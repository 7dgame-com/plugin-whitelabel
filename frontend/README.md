# plugin-whitelabel frontend

Vue 3 iframe management UI for the independent white-label backend.

运行时模型：**访问域名 → 配置键 → Unity 白牌 JSON**。

## Creation flow

Root first selects a `configKey` from the main frontend's read-only manifest
summary. Selection does not load or copy the main frontend JSON; it only fixes
the immutable identity and unlocks the editor. Root then enters an independent
JSON object, for example:

```json
{
  "name": "主站",
  "logoUrl": "https://cdn.example.com/brand/logo.webp"
}
```

The editor validates JSON syntax and public-data security limits, not the main
frontend's domain-file schema. `name` is ordinary content, not `configKey`.

## Permissions

| Capability | root | admin |
|---|---:|---:|
| View list, state, and complete JSON | yes | yes |
| Create, edit, enable, disable | yes | no |
| Read the main-frontend key catalog | yes | no |

The host registration remains `accessScope: "admin-only"`; the plugin backend
enforces the actual root-only mutation boundary on every request.

## Host protocol and routes

- `PLUGIN_READY -> INIT`, token updates, theme/language changes, and destroy;
- `/backend/api/v1/domain-configs` for records;
- `/backend/api/v1/domain-import-catalog` for read-only keys;
- public Unity resolver is served by the backend at
  `/v1/white-label-configs?domain=<hostname>`.

## Local development

```bash
pnpm install
pnpm --filter plugin-whitelabel-frontend dev
```

Default frontend: `http://localhost:3012`; default plugin backend:
`http://localhost:8093`.
