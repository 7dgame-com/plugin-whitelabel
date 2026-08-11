import { domainToASCII } from 'node:url';
import { z, type ZodType } from 'zod';
import { unprocessable } from './errors';
import type {
  DomainConfigContent,
  JsonObject,
  JsonValue,
  StaticDomainConfig,
} from './types';

const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 5_000;

const forbiddenKeyNames = new Set([
  'auth',
  'authorization',
  'bearer',
  'jwt',
  'oauth',
  'proto',
  'prototype',
  'constructor',
  'dsn',
]);
const sensitiveKeyFragments = [
  'secret',
  'password',
  'token',
  'credential',
  'apikey',
  'privatekey',
  'signingkey',
  'databaseurl',
  'connectionstring',
];

function normalizedFieldName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '').replace(/_/g, '').toLowerCase();
}

function isForbiddenFieldName(value: string): boolean {
  const normalized = normalizedFieldName(value);
  return forbiddenKeyNames.has(normalized)
    || sensitiveKeyFragments.some((fragment) => normalized.includes(fragment));
}

function isAllowedFieldName(value: string): boolean {
  return /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/.test(value);
}

function inspectJson(
  value: JsonValue,
  path: Array<string | number>,
  state: { nodes: number },
): { path: Array<string | number>; message: string } | null {
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES) {
    return { path, message: `config may contain at most ${MAX_JSON_NODES} JSON values` };
  }
  if (path.length > MAX_JSON_DEPTH) {
    return { path, message: `config may be nested at most ${MAX_JSON_DEPTH} levels` };
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const issue = inspectJson(value[index] as JsonValue, [...path, index], state);
      if (issue) {
        return issue;
      }
    }
    return null;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (!isAllowedFieldName(key)) {
        return {
          path: [...path, key],
          message: `config field "${key}" must use ASCII letters, digits, dot, underscore, or hyphen`,
        };
      }
      if (isForbiddenFieldName(key)) {
        return {
          path: [...path, key],
          message: `config field "${key}" is forbidden; secrets must not be stored here`,
        };
      }
      const issue = inspectJson(child, [...path, key], state);
      if (issue) {
        return issue;
      }
    }
  }
  return null;
}

const jsonFieldNameSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/,
    'config field names must use ASCII letters, digits, dot, underscore, or hyphen',
  );

const jsonValueSchema: ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string().max(16_384),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema).max(1_000),
    z.record(jsonFieldNameSchema, jsonValueSchema),
  ]),
);

const rawConfigSecuritySchema = z.unknown().superRefine((value, context) => {
  const issue = inspectJson(value as JsonValue, [], { nodes: 0 });
  if (issue) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: issue.path,
      message: issue.message,
    });
  }
  let serialized = '';
  try {
    serialized = JSON.stringify(value) ?? '';
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'config must be serializable JSON',
    });
    return;
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_CONFIG_BYTES) {
    context.addIssue({
      code: z.ZodIssueCode.too_big,
      type: 'string',
      maximum: MAX_CONFIG_BYTES,
      inclusive: true,
      message: `config JSON may be at most ${MAX_CONFIG_BYTES} bytes`,
    });
  }
});

export const configJsonSchema = rawConfigSecuritySchema
  .pipe(z.record(jsonFieldNameSchema, jsonValueSchema)) as ZodType<JsonObject>;

export const domainConfigKeySchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/,
    'configKey must be a lowercase domain-config key or slug without a scheme, path, whitespace, or empty label',
  );

const requestedDomainTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_024)
  .refine(
    (value) => !/[\s/:?#@\\]/.test(value),
    'domain must be a hostname or slug without a scheme, port, credentials, path, query, or fragment',
  )
  .transform((value) => {
    const withoutOneTrailingDot = value.endsWith('.') ? value.slice(0, -1) : value;
    return domainToASCII(withoutOneTrailingDot).toLowerCase();
  });

export const requestedDomainSchema = requestedDomainTextSchema.pipe(domainConfigKeySchema);

/**
 * Resolves a hostname exactly as a domain-key hierarchy: the complete hostname
 * first, then each registrable-looking parent. The final single-label TLD is
 * never treated as a configuration key.
 */
export function domainConfigCandidates(domain: string): string[] {
  const candidates: string[] = [];
  let candidate = domain;
  while (candidate) {
    candidates.push(candidate);
    const nextDot = candidate.indexOf('.');
    if (nextDot < 0) {
      break;
    }
    const parent = candidate.slice(nextDot + 1);
    if (!parent.includes('.')) {
      break;
    }
    candidate = parent;
  }
  return candidates;
}

export const positiveIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

const schemaVersionV1Schema = z.literal(1, {
  invalid_type_error: 'schemaVersion must be 1',
});
const revisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const jsonObjectSchema = z.record(jsonFieldNameSchema, jsonValueSchema);

export function hasLocalDomainConfigData(
  config: Pick<DomainConfigContent, 'default_config' | 'configs'>,
): boolean {
  return Object.keys(config.default_config).length > 0
    || Object.values(config.configs)
      .some((localizedConfig) => Object.keys(localizedConfig).length > 0);
}

export const staticDomainConfigStructureSchema = rawConfigSecuritySchema.pipe(
  z.object({
    name: domainConfigKeySchema,
    description: z.string().max(191),
    is_active: z.boolean(),
    fallback_domain: domainConfigKeySchema.nullable(),
    default_config: jsonObjectSchema,
    configs: z.record(jsonFieldNameSchema, jsonObjectSchema),
  })
    .catchall(jsonValueSchema),
) as ZodType<StaticDomainConfig>;

export const domainConfigContentSchema = rawConfigSecuritySchema.pipe(
  z.object({
    description: z.string().max(191),
    is_active: z.boolean(),
    fallback_domain: domainConfigKeySchema.nullable(),
    default_config: jsonObjectSchema,
    configs: z.record(jsonFieldNameSchema, jsonObjectSchema),
  })
    .catchall(jsonValueSchema)
    .superRefine((config, context) => {
      if (Object.prototype.hasOwnProperty.call(config, 'name')) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['name'],
          message: 'name is managed as the external configKey and must not be stored in config JSON',
        });
      }
    }),
) as ZodType<DomainConfigContent>;

export const staticDomainConfigSchema = staticDomainConfigStructureSchema
  .superRefine((config, context) => {
    if (
      config.fallback_domain !== null
      && config.fallback_domain !== config.name
      && !hasLocalDomainConfigData(config)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fallback_domain'],
        message: 'an external fallback requires local default_config or configs data; Unity snapshots must be self-contained',
      });
    }
  }) as ZodType<StaticDomainConfig>;

function selfContainedContentForKey(
  value: { configKey: string; config: DomainConfigContent },
  context: z.RefinementCtx,
): void {
  if (
    value.config.fallback_domain !== null
    && value.config.fallback_domain !== value.configKey
    && !hasLocalDomainConfigData(value.config)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['config', 'fallback_domain'],
      message: 'an external fallback requires local default_config or configs data; Unity snapshots must be self-contained',
    });
  }
}

export const createDomainConfigSchema = z
  .object({
    configKey: domainConfigKeySchema,
    schemaVersion: schemaVersionV1Schema.default(1),
    config: domainConfigContentSchema,
    enabled: z.literal(false).default(false),
  })
  .strict()
  .superRefine(selfContainedContentForKey);

export const updateDomainConfigSchema = z
  .object({
    schemaVersion: schemaVersionV1Schema,
    config: domainConfigContentSchema,
    revision: revisionSchema,
  })
  .strict();

export function assertSelfContainedDomainConfigContent(
  configKey: string,
  config: DomainConfigContent,
): void {
  if (
    config.fallback_domain !== null
    && config.fallback_domain !== configKey
    && !hasLocalDomainConfigData(config)
  ) {
    throw unprocessable(
      'An external fallback requires local Unity config data',
      [{
        path: 'config.fallback_domain',
        message: 'an external fallback requires local default_config or configs data; Unity snapshots must be self-contained',
      }],
    );
  }
}

export const revisionBodySchema = z
  .object({
    revision: revisionSchema,
  })
  .strict();

export const listQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const resolveQuerySchema = z
  .object({
    domain: requestedDomainSchema,
  })
  .strict();

export function parseInput<Schema extends z.ZodTypeAny>(
  schema: Schema,
  input: unknown,
): z.output<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw unprocessable(
      'Request validation failed',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}
