# White-label backend

This service owns one independently versioned resource: a domain-family JSON
snapshot with the main frontend's `StaticDomainConfig` semantics. White-label
resolution is domain-only; organization and login context belong to other
systems and are never stored, queried, or returned here.

The service does not read the main-platform database. Management Bearer tokens
are verified through the fixed main API `verify-token` endpoint. The optional
main-frontend domain catalog is a root-only import helper; saved JSON is an
independent snapshot and public resolution never calls the main frontend.

## Security and permissions

- `root` and `admin` may list and inspect domain records.
- Only `root` may create, update, enable, disable, or use the import catalog.
- New records are disabled and every mutation uses optimistic `revision` checks.
- `configKey` is selected from the fixed main-frontend catalog, stored outside
  JSON, and immutable after creation. A `name` field in editable JSON is
  rejected. Secret-bearing fields are rejected recursively and snapshots are
  size/depth constrained.
- An enabled database record must also have `config.is_active === true` before
  it is publicly resolvable.
- There are no delete routes.

## Management API

- `GET /api/v1/domain-import-catalog` — root only; optional import candidates
- `GET /api/v1/domain-configs` — root/admin
- `POST /api/v1/domain-configs` — root only
- `GET /api/v1/domain-configs/:domainId` — root/admin
- `PUT /api/v1/domain-configs/:domainId` — root only
- `POST /api/v1/domain-configs/:domainId/enable` — root only
- `POST /api/v1/domain-configs/:domainId/disable` — root only

Domain create input contains the selected `configKey`, `schemaVersion`, and
content JSON without `name`. Updates contain only `schemaVersion`, `revision`,
and content, so they cannot rename the key. `displayName` is derived from the
content and cannot be submitted independently. The public Unity response adds
`name = configKey` at the compatibility boundary.

## Public Unity API

```http
GET /v1/white-label-configs?domain=d.dev.xrugc.com
```

The query accepts only a hostname or slug. Schemes, credentials, ports, paths,
queries, and fragments are rejected. Input is lowercased, one trailing dot is
removed, and IDNs are converted to ASCII.

Lookup precedence mirrors the main frontend: `d.` candidates first, then
`www.`, then the exact hostname and progressively broader parent domains, with
duplicates removed. An explicitly configured `default` record is considered
only when none of those records exists. If the first configured match is
disabled or its snapshot is inactive, resolution returns `404` without falling
through to a broader/default record.

```json
{
  "version": 1,
  "domain": {
    "requestedDomain": "d.dev.xrugc.com",
    "configKey": "dev.xrugc.com",
    "isDomainFallback": true,
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

The response contains no organization data or database id. A strong ETag is
derived from the complete response; `Cache-Control: public, no-cache,
must-revalidate` permits storage but requires validation before reuse, and
`If-None-Match` may return `304`. Disabling a record therefore remains an
immediate operational kill switch for compliant clients and intermediaries.

## Database compatibility

`db/schema.sql` creates only `white_label_domain_config` for new installs. It
contains no destructive statements. Organization/assignment tables left by an
older deployment are therefore preserved as rollback data but are not used by
the runtime.

## Run

1. Create a database and apply `db/schema.sql`.
2. Configure MySQL and `MAIN_API_BASE_URL` in the environment.
3. Optionally set `MAIN_FRONTEND_PUBLIC_BASE_URL` for the import catalog.
4. Run `corepack pnpm --dir backend build` and then start `dist/server.js`.

The MySQL integration test is opt-in and refuses database names that do not end
in `_test`:

```bash
MYSQL_TEST_DATABASE=whitelabel_test \
MYSQL_TEST_PORT=3338 \
corepack pnpm --dir backend test:mysql
```
