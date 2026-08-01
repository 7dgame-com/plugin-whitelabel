import { createHash } from 'node:crypto';
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
  revisionConflict,
  unauthorized,
  unprocessable,
} from './errors';
import type { DomainImportCatalog } from './domainImportCatalog';
import type {
  AuthenticatedSession,
  DomainConfig,
  DomainConfigInput,
  SessionVerifier,
  VersionedMutationResult,
  WhiteLabelRepository,
} from './types';
import {
  createDomainConfigSchema,
  domainConfigCandidates,
  listQuerySchema,
  parseInput,
  positiveIdSchema,
  resolveQuerySchema,
  revisionBodySchema,
  updateDomainConfigSchema,
} from './validation';

export interface AppDependencies {
  repository: WhiteLabelRepository;
  sessionVerifier: SessionVerifier;
  domainImportCatalog?: DomainImportCatalog;
}

interface ManagementContext {
  session: AuthenticatedSession;
  isRoot: boolean;
}

interface PublicWhiteLabelResponse {
  version: 1;
  domain: {
    requestedDomain: string;
    configKey: string;
    isDomainFallback: boolean;
    revision: number;
    schemaVersion: number;
    config: DomainConfig['config'];
  };
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

function requireRoot(response: Response): ManagementContext {
  const context = managementContext(response);
  if (!context.isRoot) {
    throw forbidden('Only root may change domain white-label configurations');
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

function publicResponse(requestedDomain: string, record: DomainConfig): PublicWhiteLabelResponse {
  return {
    version: 1,
    domain: {
      requestedDomain,
      configKey: record.configKey,
      isDomainFallback: record.configKey !== requestedDomain,
      revision: record.revision,
      schemaVersion: record.schemaVersion,
      config: record.config,
    },
  };
}

function publicEtag(body: PublicWhiteLabelResponse): string {
  const digest = createHash('sha256')
    .update(JSON.stringify(body))
    .digest('base64url');
  return `"wl-${digest}"`;
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

function sendPublicConfig(
  request: Request,
  response: Response,
  body: PublicWhiteLabelResponse,
): void {
  const etag = publicEtag(body);
  response.set({
    // The enabled flag is an operational kill switch. Caches may retain the
    // body for ETag reuse, but must revalidate before every application.
    'Cache-Control': 'public, no-cache, must-revalidate',
    ETag: etag,
  });
  if (ifNoneMatchMatches(request, etag)) {
    response.status(304).end();
    return;
  }
  response.json(body);
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
    response.locals.management = { session, isRoot } satisfies ManagementContext;
    next();
  });
}

function createDomainRouter(repository: WhiteLabelRepository): express.Router {
  const router = express.Router();

  router.get('/', asyncHandler(async (request, response) => {
    const query = parseInput(listQuerySchema, request.query);
    const result = await repository.listDomainConfigs(listOptions(query));
    response.json(listResponse(result.items, result.total, query.page, query.pageSize));
  }));

  router.post('/', asyncHandler(async (request, response) => {
    const context = requireRoot(response);
    const body = parseInput(createDomainConfigSchema, request.body);
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
    const context = requireRoot(response);
    const domainId = parseInput(positiveIdSchema, request.params.domainId);
    const body = parseInput(updateDomainConfigSchema, request.body);
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
      const context = requireRoot(response);
      const domainId = parseInput(positiveIdSchema, request.params.domainId);
      const body = parseInput(revisionBodySchema, request.body);
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

function createPublicResolverRouter(repository: WhiteLabelRepository): express.Router {
  const router = express.Router();

  router.get('/', asyncHandler(async (request, response) => {
    const query = resolveQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw notFound();
    }

    const candidates = domainConfigCandidates(query.data.domain)
      .filter((candidate) => candidate !== 'default');
    let record = await repository.findFirstDomainConfig(candidates);
    if (!record) {
      record = await repository.findFirstDomainConfig(['default']);
    }
    // A configured higher-priority match is authoritative. Disabled records
    // deliberately block parent/default fallback instead of being skipped.
    if (!record || !record.enabled || !record.config.is_active) {
      throw notFound();
    }
    sendPublicConfig(request, response, publicResponse(query.data.domain, record));
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
    '/api/v1/domain-import-catalog',
    managementAuth,
    createDomainImportCatalogRouter(dependencies.domainImportCatalog),
  );
  app.use(
    '/api/v1/domain-configs',
    managementAuth,
    createDomainRouter(dependencies.repository),
  );
  app.use(
    '/v1/white-label-configs',
    createPublicResolverRouter(dependencies.repository),
  );

  app.use((_request, _response, next) =>
    next(new AppError(404, 'ROUTE_NOT_FOUND', 'Route not found')));
  app.use(errorHandler);
  return app;
}
