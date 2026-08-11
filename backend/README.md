# White-label backend

The backend owns one resource: an immutable external `configKey` plus an
independent public JSON object. Domain resolution does not use organization or
login context.

## Data boundary

- `configKey` must be selected from the fixed main-frontend manifest summary.
- The catalog reads only `configKey`, `description`, and `isActive`; source JSON
  is never returned, copied, or synchronized.
- Root authors `config` independently. It is stored and returned unchanged.
- A JSON `name` field is ordinary brand content and may contain Chinese text.
- Plugin enable state is the database `is_enabled` column. JSON fields do not
  control operational status.
- Existing `config_json` values are preserved without destructive migration.

## Permissions and API

- root/admin: `GET /api/v1/domain-configs` and record detail;
- root only: create, update, enable, disable, and key catalog;
- public: `GET /v1/white-label-configs?domain=d.dev.xrugc.com`.

Management Bearer tokens are verified through the fixed main API
`/v1/plugin/verify-token`. The service never reads the main-platform database.

Public lookup checks the full hostname followed by parent domains. The first
existing disabled record returns `{}` and blocks parent fallback. A successful
match returns the stored JSON object directly, with a strong ETag and
`Cache-Control: public, no-cache, must-revalidate`.

## Safety

Config must be a JSON object. Size, depth, node count, array length, string
length, and ASCII field-name limits apply. Credential-, token-, password-, key-,
or database-connection-like fields are rejected recursively. There are no hard
delete routes.

## Run

1. Apply `backend/db/schema.sql` to a dedicated database.
2. Configure MySQL, `MAIN_API_BASE_URL`, and optional
   `MAIN_FRONTEND_PUBLIC_BASE_URL`.
3. Run `corepack pnpm --dir backend build`, then `dist/server.js`.
