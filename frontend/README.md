# plugin-whitelabel frontend

白牌插件的 Vue 3 管理界面。它作为主前端 iframe 插件运行，业务数据只写入
`plugin-whitelabel` 独立后端，不修改主前端或主后端业务模型。

## 域名唯一模型

插件只维护一种业务资源：域名白牌配置。解析链路固定为：

**访问域名 → 配置键 → Unity 白牌 JSON**

客户端提供当前完整 hostname，例如 `d.dev.xrugc.com`。插件后端先精确查找完整域名，
再依次查找 `dev.xrugc.com`、`xrugc.com`，并直接返回第一条可用记录保存的完整
`StaticDomainConfig` JSON 快照；全部不存在时返回 `{}`。管理端不保存登录关系、用户
范围或组合关系。

`config.name` 是配置键，不要求等于请求中的完整 hostname；`config.description` 是
管理列表说明。插件内部数字 `domainId` 仅用于管理 API，不作为公开解析输入。

root 可以从主前端发布的域名清单搜索并把完整 JSON 一次性导入编辑器。保存后插件只
使用自己的独立快照，不会继续同步或修改主前端文件。若同一配置也要在主前端生效，
必须在主前端仓库单独新增或更新对应 JSON 并发布。

## 权限矩阵

| 能力 | root | admin |
|---|---|---|
| 查看列表、状态和完整 JSON | 可以 | 可以 |
| 创建、编辑、启停 | 可以 | 不可以 |
| 从主前端清单一次性导入 | 可以 | 不可以 |

宿主注册清单继续使用 `accessScope: "admin-only"`，因此 root 与 admin 都可以进入插件。
前端路由通过主后端 `GET /api/v1/plugin/verify-token` 只校验身份与角色；插件后端仍须
逐请求执行相同权限边界。前端不读取会话中的其他业务上下文，也不调用主平台的业务
列表 API。

## 宿主协议

- `PLUGIN_READY -> INIT`
- `TOKEN_UPDATE` 与 `TOKEN_REFRESH_REQUEST`
- `THEME_CHANGE`、`LANG_CHANGE`、`DESTROY`
- 路由变化发送 `plugin-url-changed`

## 本地开发

```bash
pnpm install
pnpm --filter plugin-whitelabel-frontend dev
```

开发地址为 `http://localhost:3012`。Vite 的同源代理为：

| 前端路径 | 默认上游 | 用途 |
|---|---|---|
| `/api/*` | `http://localhost:8081` | 主后端会话验证 |
| `/backend/api/*` | `http://localhost:8093` | 白牌插件管理 API |

其他 `/backend/*` 路径不代理。公开只读解析接口由部署层直接路由到插件后端，不经过
管理前端。可分别用 `VITE_APP_API_URL` 和 `VITE_APP_BACKEND_URL` 覆盖上游。

## 管理 API

前端只使用域名资源与 root-only 导入辅助接口：

- `/backend/api/v1/domain-configs`
- `/backend/api/v1/domain-import-catalog`

列表发送 `q / page / pageSize`。创建请求不发送 `enabled`，由服务端默认停用；更新与
启停携带当前 `revision` 做乐观锁。新建与编辑固定使用当前唯一支持的
`schemaVersion: 1`。

JSON 编辑器提供语法高亮、行号、搜索、撤销、格式化、压缩与实时诊断。它只校验
`StaticDomainConfig` Schema，并同时执行深度、节点数、大小、字段名和敏感字段等安全
检查。admin 查看时编辑器为只读；导入与保存控件不会加载或显示。

写入 DTO：

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

`fallback_domain` 仅保留作格式兼容元数据。下发给 Unity 的快照必须自包含；外部回退
存在时，当前记录至少要有非空的 `default_config` 或语言配置。导入会完整替换编辑器
内容而不合并；清单加载失败不影响手工编辑。

## 公开解析

客户端按完整访问域名请求插件后端：

```text
GET https://whitelabel.example.com/v1/white-label-configs?domain=d.dev.xrugc.com
```

插件后端负责规范化 hostname，按完整域名到父域名的顺序选择配置键并直接返回 Unity
JSON。`d.`、`www.` 不做特殊处理，也不使用 `default` 兜底。管理前端不生成、拼接或
缓存公开解析地址。

## Docker

```bash
docker build -f frontend/Dockerfile -t plugin-whitelabel-frontend .
docker run --rm -p 3012:80 \
  -e APP_API_1_URL=http://api:80 \
  -e APP_BACKEND_1_URL=http://plugin-whitelabel-backend:8093 \
  plugin-whitelabel-frontend
```

运行时 nginx 只提供 `/api` 与 `/backend/api/*` 两个同源代理，以及 `GET /health`
健康检查。

生产静态目录可参考 [`plugins.json.example`](./plugins.json.example)；通过
system-admin 写 API 动态登记时，应使用仓库根目录的 snake_case 注册示例，并保持
`access_scope: "admin-only"`。

## 验证

```bash
pnpm --filter plugin-whitelabel-frontend type-check
pnpm --filter plugin-whitelabel-frontend test
pnpm --filter plugin-whitelabel-frontend build
```
