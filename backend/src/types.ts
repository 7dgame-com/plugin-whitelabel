export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface AuthenticatedSession {
  userId: string;
  roles: string[];
}

export interface SessionVerifier {
  verify(authorizationHeader: string): Promise<AuthenticatedSession>;
}

export interface AuditFields {
  createdBy: string;
  updatedBy: string;
  statusChangedBy: string | null;
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string | null;
}

/**
 * A complete snapshot of the main frontend's
 * public/config/domains/<configKey>.json contract.
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

  listDomainConfigs(options: ListOptions): Promise<ListResult<DomainConfig>>;
  createDomainConfig(input: DomainConfigInput, actorId: string): Promise<DomainConfig>;
  findDomainConfig(domainId: number): Promise<DomainConfig | null>;
  /** Returns the first configured key in caller-supplied precedence order. */
  findFirstDomainConfig(configKeys: readonly string[]): Promise<DomainConfig | null>;
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
}
