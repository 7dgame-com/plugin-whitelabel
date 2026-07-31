# White-label backend

This service owns three independently versioned resources:

- organization JSON, keyed by the main platform's numeric organization id;
- a domain-family JSON snapshot with main-frontend `StaticDomainConfig` semantics,
  keyed externally by a plugin-owned numeric domain id;
- an organization/domain assignment with publish state but no JSON.

The service has no dependency on the main platform database. It validates the
main-platform session on every management request and exposes one token-protected
read-only resolve endpoint intended for `yii3-a1`.

The domain resource does not represent one exact request hostname. Its
`configKey` is derived from `config.name` and identifies the same domain family
as a main-frontend file such as `web/public/config/domains/dev.xrugc.com.json`.
For example, the main frontend can resolve `d.dev.xrugc.com` through the
`dev.xrugc.com` key. The numeric `domainId` remains the short, stable value used
by QR parameter `d`.

The plugin stores an independent full snapshot. It neither reads nor writes the
main frontend's static files at runtime. Publishing the same key to the main
frontend is a separate change and deployment.

## Security boundaries

- Management routes require `Authorization: Bearer ...`. The token is sent to the
  fixed `MAIN_API_BASE_URL/v1/plugin/verify-token` endpoint for every request.
- Root manages every resource. Admin is SQL-scoped to numeric organization ids in
  the verified session, can manage only those organization configs, and has
  read-only access to their assignments and QR URLs.
- Admin cannot manage domain configs or create/enable/disable assignments.
- Organization snapshots written by admin come from the verified session. Root
  writes resolve the numeric id through the fixed main-platform
  `/v1/organization/list` endpoint. Neither role trusts request-body snapshots.
- Organization titles follow the main platform's 255-character limit. Domain
  display names remain limited to 191 characters.
- A domain `configKey` is globally unique, follows the static domain-config key
  grammar, and must exactly match `config.name`. It is never derived from an HTTP
  Host header. `displayName` is a read-only projection of `config.description`.
- Internal resolve requires `X-Internal-Token`. Missing, invalid, disabled, or
  partially disabled combinations all return the same `404`.
- Organization and domain JSON reject secret-bearing field names and are
  size/depth constrained, including nested variants such as `clientSecret`,
  `dbPassword`, `signingKey`, `authorization`, `jwt`, and token-bearing keys.
  Field names use an ASCII-only identifier grammar so Unicode confusables cannot
  bypass this control.
- There are no delete routes. Every update and enable/disable requires the current
  `revision`.
- QR URLs use only fixed `A1_PUBLIC_BASE_URL`; request headers cannot alter them.
  Production startup requires this URL to use HTTPS.

Organization and domain JSON use separate versioned schemas. Organization schema
v1 requires a top-level object. Domain schema v1 validates the
`StaticDomainConfig` shape and the invariant `config.name === configKey`. A
schema change on one resource never changes the other resource.

Only `schemaVersion: 1` is implemented and accepted. A domain snapshot must be
self-contained for Unity. `fallback_domain` is preserved as format-compatible
metadata, but the plugin and A1 never dereference it at runtime; a pure external
fallback document with empty `default_config` and `configs` is rejected.

## Management API

Organization configuration (root/admin within scope):

- `GET /api/v1/organization-configs`
- `POST /api/v1/organization-configs`
- `GET /api/v1/organization-configs/:organizationId`
- `PUT /api/v1/organization-configs/:organizationId`
- `POST /api/v1/organization-configs/:organizationId/enable`
- `POST /api/v1/organization-configs/:organizationId/disable`

Domain configuration (root only):

- `GET /api/v1/domain-configs`
- `POST /api/v1/domain-configs`
- `GET /api/v1/domain-configs/:domainId`
- `PUT /api/v1/domain-configs/:domainId`
- `POST /api/v1/domain-configs/:domainId/enable`
- `POST /api/v1/domain-configs/:domainId/disable`

Assignments:

- `GET /api/v1/assignments` — root sees all; admin sees only session organizations
- `POST /api/v1/assignments` — root only
- `POST /api/v1/assignments/:assignmentId/enable` — root only
- `POST /api/v1/assignments/:assignmentId/disable` — root only

New resources are always disabled. There is no hard-delete endpoint.
Assignment responses include organization and domain display summaries for the UI
and a `qrUrl` generated from the fixed A1 origin, while retaining full audit fields.

Domain create input contains `configKey`, `schemaVersion`, and the full `config`
snapshot; update additionally contains `revision`. Clients do not submit
`displayName` or a request hostname:

```json
{
  "configKey": "dev.xrugc.com",
  "schemaVersion": 1,
  "config": {
    "name": "dev.xrugc.com",
    "description": "XR UGC Dev",
    "is_active": true,
    "fallback_domain": "default",
    "default_config": {},
    "configs": {}
  }
}
```

## Internal API

```http
GET /internal/v1/white-label-configs/resolve?o=12&d=34
X-Internal-Token: ...
```

The endpoint returns data only when the assignment, organization config, and
domain config are all enabled:

```json
{
  "version": 1,
  "organization": {
    "id": 12,
    "name": "acme",
    "title": "Acme Academy",
    "revision": 4,
    "schemaVersion": 1,
    "config": {}
  },
  "domain": {
    "id": 34,
    "configKey": "dev.xrugc.com",
    "revision": 2,
    "schemaVersion": 1,
    "config": {
      "name": "dev.xrugc.com",
      "description": "XR UGC Dev",
      "is_active": true,
      "fallback_domain": "default",
      "default_config": {},
      "configs": {}
    }
  }
}
```

ETag incorporates assignment, organization, and domain revisions, so independent
JSON updates correctly invalidate caches. `If-None-Match` returns `304`.

The `yii3-a1` white-label route is currently a draft contract and has not been
deployed. This repository defines the internal side of that integration, but a QR
URL is not end-to-end usable until A1 implements and publishes the public route.
There is no `yii3-a3` service in this design.

## Run

1. Create a database and apply `db/schema.sql`.
2. From the repository root copy the root `.env.example` to `.env`, then replace
   credentials and tokens. Development startup loads that root file without
   overriding environment variables already supplied by the process.
3. From the repository root run `pnpm install`, `pnpm --filter
   @7dgame/plugin-whitelabel-backend build`, then `pnpm --filter
   @7dgame/plugin-whitelabel-backend start`.

`A1_PUBLIC_BASE_URL` must be a pure origin such as `https://a1.example.com`;
paths, queries, and fragments are rejected.

The MySQL repository integration test is opt-in and refuses database names that
do not end in `_test`:

```bash
MYSQL_TEST_DATABASE=whitelabel_test \
MYSQL_TEST_PORT=3338 \
pnpm --filter @7dgame/plugin-whitelabel-backend test:mysql
```
