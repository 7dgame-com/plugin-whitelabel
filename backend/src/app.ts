import { createHash, timingSafeEqual } from 'node:crypto';
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {
  AppError,
  badRequest,
  domainCatalogUnavailable,
  forbidden,
  notFound,
  organizationNotFound,
  revisionConflict,
  unauthorized,
  unprocessable,
} from './errors';
import type { DomainImportCatalog } from './domainImportCatalog';
import type {
  Assignment,
  AuthenticatedSession,
  DomainConfigInput,
  OrganizationDirectory,
  OrganizationConfigInput,
  OrganizationConfigUpdate,
  OrganizationScope,
  ResolvedWhiteLabel,
  SessionOrganization,
  SessionVerifier,
  VersionedMutationResult,
  WhiteLabelRepository,
} from './types';
import {
  createAssignmentSchema,
  createDomainConfigSchema,
  createOrganizationConfigSchema,
  listQuerySchema,
  parseInput,
  positiveIdSchema,
  resolveQuerySchema,
  revisionBodySchema,
  updateDomainConfigSchema,
  updateOrganizationConfigSchema,
} from './validation';

export interface AppDependencies {
  repository: WhiteLabelRepository;
  sessionVerifier: SessionVerifier;
  organizationDirectory: OrganizationDirectory;
  internalApiToken: string;
  a1PublicBaseUrl: URL;
  domainImportCatalog?: DomainImportCatalog;
}

interface ManagementContext {
  session: AuthenticatedSession;
  scope: OrganizationScope;
  isRoot: boolean;
  authorizationHeader: string;
}

type AsyncRequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<void>;

function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response, next).catch(next);
  };
}

function managementContext(response: Response): ManagementContext {
  return response.locals.management as ManagementContext;
}

function sessionOrganization(
  context: ManagementContext,
  organizationId: number,
): SessionOrganization | undefined {
  return context.session.organizations.find((organization) => organization.id === organizationId);
}

function requireOrganizationMembership(
  context: ManagementContext,
  organizationId: number,
): SessionOrganization | undefined {
  if (context.isRoot) {
    return undefined;
  }
  const organization = sessionOrganization(context, organizationId);
  if (!organization) {
    throw forbidden('Admin users may manage only organizations in their main-platform session');
  }
  return organization;
}

async function authoritativeOrganization(
  organizationDirectory: OrganizationDirectory,
  context: ManagementContext,
  organizationId: number,
): Promise<{ name: string; title: string }> {
  const membership = requireOrganizationMembership(context, organizationId);
  if (membership) {
    return { name: membership.name, title: membership.title };
  }
  const authoritative = await organizationDirectory.findById(
    context.authorizationHeader,
    organizationId,
  );
  if (!authoritative) {
    throw organizationNotFound();
  }
  return { name: authoritative.name, title: authoritative.title };
}

function requireRoot(response: Response): ManagementContext {
  const context = managementContext(response);
  if (!context.isRoot) {
    throw forbidden('Only root may manage domains and organization/domain assignments');
  }
  return context;
}

function mutationValue<Value>(result: VersionedMutationResult<Value>): Value {
  if (result.kind === 'not_found') {
    throw notFound();
  }
  if (result.kind === 'revision_conflict') {
    throw revisionConflict(result.currentRevision);
  }
  return result.value;
}

function listOptions(query: {
  q?: string;
  page: number;
  pageSize: number;
}) {
  return {
    ...(query.q === undefined ? {} : { q: query.q }),
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  };
}

function listResponse<Value>(
  items: Value[],
  total: number,
  page: number,
  pageSize: number,
) {
  return {
    code: 0,
    data: { items, total, page, pageSize },
  };
}

function assignmentQrUrl(baseUrl: URL, assignment: Assignment): string {
  const url = new URL(baseUrl.toString());
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/v1/white-label-configs`;
  url.search = new URLSearchParams({
    o: String(assignment.organizationId),
    d: String(assignment.domainId),
  }).toString();
  return url.toString();
}

function assignmentResponse(baseUrl: URL, assignment: Assignment) {
  return {
    assignmentId: assignment.assignmentId,
    organizationId: assignment.organizationId,
    domainId: assignment.domainId,
    revision: assignment.revision,
    enabled: assignment.enabled,
    createdBy: assignment.createdBy,
    updatedBy: assignment.updatedBy,
    statusChangedBy: assignment.statusChangedBy,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    statusChangedAt: assignment.statusChangedAt,
    organization: assignment.organization,
    domain: assignment.domain,
    qrUrl: assignmentQrUrl(baseUrl, assignment),
  };
}

function internalResponse(resolved: ResolvedWhiteLabel) {
  return {
    version: 1,
    organization: resolved.organization,
    domain: resolved.domain,
  };
}

function internalEtag(resolved: ResolvedWhiteLabel): string {
  return `"wl-o${resolved.organization.id}-r${resolved.organization.revision}-d${resolved.domain.id}-r${resolved.domain.revision}-a${resolved.assignmentRevision}"`;
}

function ifNoneMatchMatches(request: Request, etag: string): boolean {
  const header = request.headers['if-none-match'];
  if (typeof header !== 'string') {
    return false;
  }
  return header.split(',').some((candidate) => {
    const normalized = candidate.trim().replace(/^W\//, '');
    return normalized === '*' || normalized === etag;
  });
}

function sendInternalConfig(
  request: Request,
  response: Response,
  resolved: ResolvedWhiteLabel,
): void {
  const etag = internalEtag(resolved);
  response.set({
    'Cache-Control': 'private, max-age=60',
    ETag: etag,
    Vary: 'X-Internal-Token',
  });
  if (ifNoneMatchMatches(request, etag)) {
    response.status(304).end();
    return;
  }
  response.json(internalResponse(resolved));
}

function tokenDigest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function createInternalAuth(expectedToken: string): RequestHandler {
  const expectedDigest = tokenDigest(expectedToken);
  return (request, _response, next) => {
    const token = request.headers['x-internal-token'];
    if (typeof token !== 'string' || !timingSafeEqual(tokenDigest(token), expectedDigest)) {
      next(unauthorized('A valid internal service token is required'));
      return;
    }
    next();
  };
}

function createManagementAuth(sessionVerifier: SessionVerifier): RequestHandler {
  return asyncHandler(async (request, response, next) => {
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization)) {
      throw unauthorized('A Bearer token is required');
    }
    const session = await sessionVerifier.verify(authorization);
    const isRoot = session.roles.includes('root');
    if (!isRoot && !session.roles.includes('admin')) {
      throw forbidden();
    }
    response.locals.management = {
      session,
      scope: isRoot ? null : session.organizations.map((organization) => organization.id),
      isRoot,
      authorizationHeader: authorization,
    } satisfies ManagementContext;
    next();
  });
}

function createOrganizationRouter(
  repository: WhiteLabelRepository,
  organizationDirectory: OrganizationDirectory,
): express.Router {
  const router = express.Router();

  router.get('/', asyncHandler(async (request, response) => {
    const query = parseInput(listQuerySchema, request.query);
    const context = managementContext(response);
    const result = await repository.listOrganizationConfigs(context.scope, listOptions(query));
    response.json(listResponse(result.items, result.total, query.page, query.pageSize));
  }));

  router.post('/', asyncHandler(async (request, response) => {
    const body = parseInput(createOrganizationConfigSchema, request.body);
    const context = managementContext(response);
    const snapshot = await authoritativeOrganization(
      organizationDirectory,
      context,
      body.organizationId,
    );
    const input: OrganizationConfigInput = {
      organizationId: body.organizationId,
      organizationName: snapshot.name,
      organizationTitle: snapshot.title,
      schemaVersion: body.schemaVersion,
      config: body.config,
    };
    const created = await repository.createOrganizationConfig(input, context.session.userId);
    response
      .status(201)
      .location(`/api/v1/organization-configs/${created.organizationId}`)
      .json({ code: 0, data: created });
  }));

  router.get('/:organizationId', asyncHandler(async (request, response) => {
    const organizationId = parseInput(positiveIdSchema, request.params.organizationId);
    const context = managementContext(response);
    const record = await repository.findOrganizationConfig(context.scope, organizationId);
    if (!record) {
      throw notFound();
    }
    response.json({ code: 0, data: record });
  }));

  router.put('/:organizationId', asyncHandler(async (request, response) => {
    const organizationId = parseInput(positiveIdSchema, request.params.organizationId);
    const body = parseInput(updateOrganizationConfigSchema, request.body);
    const context = managementContext(response);
    const snapshot = await authoritativeOrganization(
      organizationDirectory,
      context,
      organizationId,
    );
    const input: OrganizationConfigUpdate = {
      organizationName: snapshot.name,
      organizationTitle: snapshot.title,
      schemaVersion: body.schemaVersion,
      config: body.config,
      revision: body.revision,
    };
    const result = await repository.updateOrganizationConfig(
      context.scope,
      organizationId,
      input,
      context.session.userId,
    );
    response.json({ code: 0, data: mutationValue(result) });
  }));

  const statusHandler = (enabled: boolean): RequestHandler =>
    asyncHandler(async (request, response) => {
      const organizationId = parseInput(positiveIdSchema, request.params.organizationId);
      const body = parseInput(revisionBodySchema, request.body);
      const context = managementContext(response);
      if (enabled) {
        await authoritativeOrganization(
          organizationDirectory,
          context,
          organizationId,
        );
      } else {
        // Root must retain the ability to disable an orphaned configuration
        // after its main-platform organization has been removed.
        requireOrganizationMembership(context, organizationId);
      }
      const result = await repository.setOrganizationConfigEnabled(
        context.scope,
        organizationId,
        body.revision,
        enabled,
        context.session.userId,
      );
      response.json({ code: 0, data: mutationValue(result) });
    });

  router.post('/:organizationId/enable', statusHandler(true));
  router.post('/:organizationId/disable', statusHandler(false));
  return router;
}

function createDomainRouter(repository: WhiteLabelRepository): express.Router {
  const router = express.Router();

  router.get('/', asyncHandler(async (request, response) => {
    const query = parseInput(listQuerySchema, request.query);
    const result = await repository.listDomainConfigs(listOptions(query));
    response.json(listResponse(result.items, result.total, query.page, query.pageSize));
  }));

  router.post('/', asyncHandler(async (request, response) => {
    const body = parseInput(createDomainConfigSchema, request.body);
    const context = managementContext(response);
    const input: DomainConfigInput = {
      configKey: body.configKey,
      schemaVersion: body.schemaVersion,
      config: body.config,
    };
    const created = await repository.createDomainConfig(input, context.session.userId);
    response
      .status(201)
      .location(`/api/v1/domain-configs/${created.domainId}`)
      .json({ code: 0, data: created });
  }));

  router.get('/:domainId', asyncHandler(async (request, response) => {
    const domainId = parseInput(positiveIdSchema, request.params.domainId);
    const record = await repository.findDomainConfig(domainId);
    if (!record) {
      throw notFound();
    }
    response.json({ code: 0, data: record });
  }));

  router.put('/:domainId', asyncHandler(async (request, response) => {
    const domainId = parseInput(positiveIdSchema, request.params.domainId);
    const body = parseInput(updateDomainConfigSchema, request.body);
    const context = managementContext(response);
    if (!body.config.is_active) {
      const current = await repository.findDomainConfig(domainId);
      if (current?.revision === body.revision && current.enabled) {
        throw unprocessable(
          'Disable the domain configuration before saving a snapshot with config.is_active=false',
          [{
            path: 'config.is_active',
            message: 'config.is_active must remain true while the plugin domain configuration is enabled',
          }],
        );
      }
    }
    const result = await repository.updateDomainConfig(
      domainId,
      body,
      context.session.userId,
    );
    response.json({ code: 0, data: mutationValue(result) });
  }));

  const statusHandler = (enabled: boolean): RequestHandler =>
    asyncHandler(async (request, response) => {
      const domainId = parseInput(positiveIdSchema, request.params.domainId);
      const body = parseInput(revisionBodySchema, request.body);
      const context = managementContext(response);
      if (enabled) {
        const current = await repository.findDomainConfig(domainId);
        if (current?.revision === body.revision && !current.config.is_active) {
          throw unprocessable(
            'A domain configuration with config.is_active=false cannot be enabled',
            [{
              path: 'config.is_active',
              message: 'Set config.is_active to true before enabling this domain configuration',
            }],
          );
        }
      }
      const result = await repository.setDomainConfigEnabled(
        domainId,
        body.revision,
        enabled,
        context.session.userId,
      );
      response.json({ code: 0, data: mutationValue(result) });
    });

  router.post('/:domainId/enable', statusHandler(true));
  router.post('/:domainId/disable', statusHandler(false));
  return router;
}

function createDomainImportCatalogRouter(
  catalog: DomainImportCatalog | undefined,
): express.Router {
  const router = express.Router();

  router.get('/', asyncHandler(async (_request, response) => {
    requireRoot(response);
    if (!catalog) {
      throw domainCatalogUnavailable();
    }
    try {
      const result = await catalog.list();
      response.set('Cache-Control', 'no-store').json(result);
    } catch {
      throw domainCatalogUnavailable();
    }
  }));

  return router;
}

function createAssignmentRouter(
  repository: WhiteLabelRepository,
  a1PublicBaseUrl: URL,
): express.Router {
  const router = express.Router();

  router.get('/', asyncHandler(async (request, response) => {
    const query = parseInput(listQuerySchema, request.query);
    const context = managementContext(response);
    const result = await repository.listAssignments(context.scope, listOptions(query));
    response.json(listResponse(
      result.items.map((assignment) => assignmentResponse(a1PublicBaseUrl, assignment)),
      result.total,
      query.page,
      query.pageSize,
    ));
  }));

  router.post('/', asyncHandler(async (request, response) => {
    const context = requireRoot(response);
    const body = parseInput(createAssignmentSchema, request.body);
    const created = await repository.createAssignment(
      body.organizationId,
      body.domainId,
      context.session.userId,
    );
    response
      .status(201)
      .location(`/api/v1/assignments/${created.assignmentId}`)
      .json({ code: 0, data: assignmentResponse(a1PublicBaseUrl, created) });
  }));

  const statusHandler = (enabled: boolean): RequestHandler =>
    asyncHandler(async (request, response) => {
      const context = requireRoot(response);
      const assignmentId = parseInput(positiveIdSchema, request.params.assignmentId);
      const body = parseInput(revisionBodySchema, request.body);
      const result = await repository.setAssignmentEnabled(
        assignmentId,
        body.revision,
        enabled,
        context.session.userId,
      );
      response.json({
        code: 0,
        data: assignmentResponse(a1PublicBaseUrl, mutationValue(result)),
      });
    });

  router.post('/:assignmentId/enable', statusHandler(true));
  router.post('/:assignmentId/disable', statusHandler(false));
  return router;
}

function createInternalRouter(repository: WhiteLabelRepository): express.Router {
  const router = express.Router();

  router.get('/resolve', asyncHandler(async (request, response) => {
    const query = resolveQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw notFound();
    }
    const resolved = await repository.resolveEnabledAssignment(query.data.o, query.data.d);
    if (!resolved || !resolved.domain.config.is_active) {
      throw notFound();
    }
    sendInternalConfig(request, response, resolved);
  }));

  return router;
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }
  if (
    error instanceof SyntaxError
    && 'status' in error
    && (error as SyntaxError & { status?: number }).status === 400
  ) {
    const invalidJson = badRequest('Request body must be valid JSON');
    response.status(invalidJson.status).json({
      error: { code: invalidJson.code, message: invalidJson.message },
    });
    return;
  }
  console.error('Unhandled white-label backend error', error);
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
};

export function createApp(dependencies: AppDependencies): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb', strict: true }));

  app.get('/health', asyncHandler(async (_request, response) => {
    try {
      await dependencies.repository.health();
      response.json({ status: 'ok', service: 'plugin-whitelabel-backend' });
    } catch {
      response.status(503).json({ status: 'unavailable', service: 'plugin-whitelabel-backend' });
    }
  }));

  const managementAuth = createManagementAuth(dependencies.sessionVerifier);
  app.use(
    '/api/v1/organization-configs',
    managementAuth,
    createOrganizationRouter(dependencies.repository, dependencies.organizationDirectory),
  );
  app.use(
    '/api/v1/domain-import-catalog',
    managementAuth,
    createDomainImportCatalogRouter(dependencies.domainImportCatalog),
  );
  app.use(
    '/api/v1/domain-configs',
    managementAuth,
    (_request, response, next) => {
      try {
        requireRoot(response);
        next();
      } catch (error) {
        next(error);
      }
    },
    createDomainRouter(dependencies.repository),
  );
  app.use(
    '/api/v1/assignments',
    managementAuth,
    createAssignmentRouter(dependencies.repository, dependencies.a1PublicBaseUrl),
  );
  app.use(
    '/internal/v1/white-label-configs',
    createInternalAuth(dependencies.internalApiToken),
    createInternalRouter(dependencies.repository),
  );

  app.use((_request, _response, next) =>
    next(new AppError(404, 'ROUTE_NOT_FOUND', 'Route not found')));
  app.use(errorHandler);
  return app;
}
