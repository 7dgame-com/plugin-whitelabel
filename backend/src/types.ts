export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface SessionOrganization {
  id: number;
  name: string;
  title: string;
}

export interface AuthenticatedSession {
  userId: string;
  roles: string[];
  organizations: SessionOrganization[];
}

export interface SessionVerifier {
  verify(authorizationHeader: string): Promise<AuthenticatedSession>;
}

export interface OrganizationDirectory {
  findById(
    authorizationHeader: string,
    organizationId: number,
  ): Promise<SessionOrganization | null>;
}

/**
 * null means unrestricted root access. An array is always an admin organization
 * id allow-list; an empty array intentionally matches no rows.
 */
export type OrganizationScope = readonly number[] | null;

export interface AuditFields {
  createdBy: string;
  updatedBy: string;
  statusChangedBy: string | null;
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string | null;
}

export interface OrganizationConfig extends AuditFields {
  organizationId: number;
  organizationName: string;
  organizationTitle: string;
  config: JsonObject;
  schemaVersion: number;
  revision: number;
  enabled: boolean;
}

/**
 * A snapshot of the main frontend's public/config/domains/<configKey>.json
 * contract. The known fields are required while future public fields remain
 * representable through JsonObject's index signature.
 */
export interface StaticDomainConfig extends JsonObject {
  name: string;
  description: string;
  is_active: boolean;
  fallback_domain: string | null;
  default_config: JsonObject;
  configs: { [language: string]: JsonObject };
}

export interface DomainConfig extends AuditFields {
  domainId: number;
  configKey: string;
  displayName: string;
  config: StaticDomainConfig;
  schemaVersion: number;
  revision: number;
  enabled: boolean;
}

export interface Assignment extends AuditFields {
  assignmentId: number;
  organizationId: number;
  domainId: number;
  revision: number;
  enabled: boolean;
  organization: {
    name: string;
    title: string;
    enabled: boolean;
  };
  domain: {
    configKey: string;
    displayName: string;
    enabled: boolean;
  };
}

export interface ResolvedWhiteLabel {
  assignmentRevision: number;
  organization: {
    id: number;
    name: string;
    title: string;
    revision: number;
    schemaVersion: number;
    config: JsonObject;
  };
  domain: {
    id: number;
    configKey: string;
    revision: number;
    schemaVersion: number;
    config: StaticDomainConfig;
  };
}

export interface OrganizationConfigInput {
  organizationId: number;
  organizationName: string;
  organizationTitle: string;
  config: JsonObject;
  schemaVersion: 1;
}

export interface OrganizationConfigUpdate
  extends Omit<OrganizationConfigInput, 'organizationId'> {
  revision: number;
}

export interface DomainConfigInput {
  configKey: string;
  config: StaticDomainConfig;
  schemaVersion: 1;
}

export interface DomainConfigUpdate extends DomainConfigInput {
  revision: number;
}

export interface ListOptions {
  q?: string;
  limit: number;
  offset: number;
}

export interface ListResult<Value> {
  items: Value[];
  total: number;
}

export type VersionedMutationResult<Value> =
  | { kind: 'updated'; value: Value }
  | { kind: 'unchanged'; value: Value }
  | { kind: 'not_found' }
  | { kind: 'revision_conflict'; currentRevision: number };

export interface WhiteLabelRepository {
  health(): Promise<void>;

  listOrganizationConfigs(
    scope: OrganizationScope,
    options: ListOptions,
  ): Promise<ListResult<OrganizationConfig>>;
  createOrganizationConfig(
    input: OrganizationConfigInput,
    actorId: string,
  ): Promise<OrganizationConfig>;
  findOrganizationConfig(
    scope: OrganizationScope,
    organizationId: number,
  ): Promise<OrganizationConfig | null>;
  updateOrganizationConfig(
    scope: OrganizationScope,
    organizationId: number,
    input: OrganizationConfigUpdate,
    actorId: string,
  ): Promise<VersionedMutationResult<OrganizationConfig>>;
  setOrganizationConfigEnabled(
    scope: OrganizationScope,
    organizationId: number,
    expectedRevision: number,
    enabled: boolean,
    actorId: string,
  ): Promise<VersionedMutationResult<OrganizationConfig>>;

  listDomainConfigs(options: ListOptions): Promise<ListResult<DomainConfig>>;
  createDomainConfig(input: DomainConfigInput, actorId: string): Promise<DomainConfig>;
  findDomainConfig(domainId: number): Promise<DomainConfig | null>;
  updateDomainConfig(
    domainId: number,
    input: DomainConfigUpdate,
    actorId: string,
  ): Promise<VersionedMutationResult<DomainConfig>>;
  setDomainConfigEnabled(
    domainId: number,
    expectedRevision: number,
    enabled: boolean,
    actorId: string,
  ): Promise<VersionedMutationResult<DomainConfig>>;

  listAssignments(
    scope: OrganizationScope,
    options: ListOptions,
  ): Promise<ListResult<Assignment>>;
  createAssignment(
    organizationId: number,
    domainId: number,
    actorId: string,
  ): Promise<Assignment>;
  findAssignment(
    scope: OrganizationScope,
    assignmentId: number,
  ): Promise<Assignment | null>;
  setAssignmentEnabled(
    assignmentId: number,
    expectedRevision: number,
    enabled: boolean,
    actorId: string,
  ): Promise<VersionedMutationResult<Assignment>>;

  resolveEnabledAssignment(
    organizationId: number,
    domainId: number,
  ): Promise<ResolvedWhiteLabel | null>;
}
