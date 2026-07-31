import { z, type ZodType } from 'zod';
import { unprocessable } from './errors';
import type { JsonObject, JsonValue, StaticDomainConfig } from './types';

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

export const organizationNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(
    /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/,
    'organizationName must be a stable organization identifier',
  )
  .transform((value) => value.toLowerCase());

export const domainConfigKeySchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/,
    'configKey must be a lowercase domain-config key or slug without a scheme, path, whitespace, or empty label',
  );

export const positiveIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

const schemaVersionV1Schema = z.literal(1, {
  invalid_type_error: 'schemaVersion must be 1',
});
const revisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const createOrganizationConfigSchema = z
  .object({
    organizationId: positiveIdSchema,
    schemaVersion: schemaVersionV1Schema.default(1),
    config: configJsonSchema,
    enabled: z.literal(false).default(false),
  })
  .strict();

export const updateOrganizationConfigSchema = z
  .object({
    schemaVersion: schemaVersionV1Schema,
    config: configJsonSchema,
    revision: revisionSchema,
  })
  .strict();

const jsonObjectSchema = z.record(jsonFieldNameSchema, jsonValueSchema);

export const staticDomainConfigSchema = rawConfigSecuritySchema.pipe(
  z.object({
    name: domainConfigKeySchema,
    description: z.string().max(191),
    is_active: z.boolean(),
    fallback_domain: domainConfigKeySchema.nullable(),
    default_config: jsonObjectSchema,
    configs: z.record(jsonFieldNameSchema, jsonObjectSchema),
  })
    .catchall(jsonValueSchema)
    .superRefine((config, context) => {
      if (config.description.trim() === '' && config.name.length > 191) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['description'],
          message: 'description is required when config.name exceeds 191 characters',
        });
      }
      const hasDefaultConfig = Object.keys(config.default_config).length > 0;
      const hasLocalizedConfig = Object.values(config.configs)
        .some((localizedConfig) => Object.keys(localizedConfig).length > 0);
      if (
        config.fallback_domain !== null
        && config.fallback_domain !== config.name
        && !hasDefaultConfig
        && !hasLocalizedConfig
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fallback_domain'],
          message: 'an external fallback requires local default_config or configs data; Unity snapshots must be self-contained',
        });
      }
    }),
) as ZodType<StaticDomainConfig>;

function matchingDomainConfigKey(
  value: { configKey: string; config: StaticDomainConfig },
  context: z.RefinementCtx,
): void {
  if (value.configKey !== value.config.name) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['config', 'name'],
      message: 'config.name must exactly match configKey',
    });
  }
}

export const createDomainConfigSchema = z
  .object({
    configKey: domainConfigKeySchema,
    schemaVersion: schemaVersionV1Schema.default(1),
    config: staticDomainConfigSchema,
    enabled: z.literal(false).default(false),
  })
  .strict()
  .superRefine(matchingDomainConfigKey);

export const updateDomainConfigSchema = z
  .object({
    configKey: domainConfigKeySchema,
    schemaVersion: schemaVersionV1Schema,
    config: staticDomainConfigSchema,
    revision: revisionSchema,
  })
  .strict()
  .superRefine(matchingDomainConfigKey);

export const createAssignmentSchema = z
  .object({
    organizationId: positiveIdSchema,
    domainId: positiveIdSchema,
    enabled: z.literal(false).default(false),
  })
  .strict();

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
    o: positiveIdSchema,
    d: positiveIdSchema,
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
