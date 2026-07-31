import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { z, type ZodType } from 'zod';
import { unprocessable } from './errors';
import type { JsonObject, JsonValue } from './types';

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

export const hostnameSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .superRefine((value, context) => {
    const raw = value.toLowerCase();
    const ascii = domainToASCII(raw);
    const labels = ascii.split('.');
    const labelPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
    if (
      !ascii
      || ascii.length > 253
      || raw.endsWith('.')
      || /[^\x00-\x7F]/.test(raw)
      || /[\s/:?#@*]/.test(raw)
      || isIP(ascii) !== 0
      || labels.length < 2
      || labels.some((label) => label.length === 0 || label.length > 63 || !labelPattern.test(label))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'domain must be an exact hostname without a scheme, path, port, wildcard, or IP address',
      });
    }
  })
  .transform((value) => domainToASCII(value.toLowerCase()));

export const positiveIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

const domainDisplayNameSchema = z.string().trim().min(1).max(191);
const schemaVersionSchema = z.number().int().positive().max(2_147_483_647);
const revisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const organizationWritableFields = {
  schemaVersion: schemaVersionSchema.default(1),
  config: configJsonSchema,
};

export const createOrganizationConfigSchema = z
  .object({
    organizationId: positiveIdSchema,
    ...organizationWritableFields,
    enabled: z.literal(false).default(false),
  })
  .strict();

export const updateOrganizationConfigSchema = z
  .object({
    ...organizationWritableFields,
    revision: revisionSchema,
  })
  .strict();

const domainWritableSchema = z.object({
  domain: hostnameSchema,
  displayName: domainDisplayNameSchema,
  schemaVersion: schemaVersionSchema.default(1),
  config: configJsonSchema,
});

export const createDomainConfigSchema = domainWritableSchema
  .extend({
    enabled: z.literal(false).default(false),
  })
  .strict();

export const updateDomainConfigSchema = domainWritableSchema
  .extend({
    revision: revisionSchema,
  })
  .strict();

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
