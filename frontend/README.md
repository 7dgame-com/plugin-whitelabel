# plugin-whitelabel frontend

白牌插件的 Vue 3 管理界面。它作为主前端 iframe 插件运行，业务数据只写入
`plugin-whitelabel` 独立后端，不修改主前端或主后端业务模型。

## 三类独立数据

前端严格区分三类资源：

1. **购买方组织 JSON**：一条主平台组织对应一个独立 JSON object。
2. **代理方域名 JSON**：一个主前端静态 `configKey` / 域名族对应一个独立的
   `StaticDomainConfig` JSON 快照，不代表某一个精确 hostname。
3. **授权组合**：只引用 `organizationId + domainId`，不复制、不拼接、更不在
   前端合并前两份 JSON。

这两个 JSON 分别创建、编辑、版本化和启停。组合创建后也默认停用，必须由
root 明确启用。

例如主前端请求 host `d.dev.xrugc.com` 会按静态候选键规则命中
`dev.xrugc.com`；域名 JSON 的 `config.name` 保存这个 `configKey`。插件自己的
数字 `domainId` 才是组合外键和二维码参数 `d`。root 可以从主前端发布的域名清单
搜索并把完整 JSON 一次性导入编辑器；保存后插件只使用自己的独立快照，不会继续
同步或修改主前端文件。若同一配置也要在主前端生效，必须在主前端仓库单独新增
`{configKey}.json` 并发布。

## 权限矩阵

| 能力 | root | admin |
|---|---|---|
| 组织 JSON | 全部读写、启停 | 仅 `verify-token.organizations[].id` 对应组织可读写、启停 |
| 域名 JSON | 全部读写、启停 | 不读取独立域名 JSON |
| 授权组合 | 全部读取、创建、启停 | 只读自己组织范围内的组合（含停用项） |
| 组合二维码 | 可查看有效组合 | 可查看自己组织的有效组合 |

宿主注册清单使用 `accessScope: "admin-only"`；前端路由再通过主后端
`GET /api/v1/plugin/verify-token` 精确校验 `root` / `admin`。这些前端限制只为
减少误操作，插件后端仍必须逐请求执行相同权限和组织范围校验。

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
| `/api/*` | `http://localhost:8081` | 主后端会话与组织列表 |
| `/backend/api/*` | `http://localhost:8093` | 白牌插件管理 API |

其他 `/backend/*` 路径不代理，避免浏览器访问 A1 专用的内部解析接口。

可分别用 `VITE_APP_API_URL` 和 `VITE_APP_BACKEND_URL` 覆盖。

## 管理 API

前端使用三个业务资源和一个 root-only 导入辅助接口：

- `/backend/api/v1/organization-configs`
- `/backend/api/v1/domain-configs`
- `/backend/api/v1/assignments`
- `/backend/api/v1/domain-import-catalog`

列表统一发送 `q / page / pageSize`。创建请求不发送 `enabled`，由服务端默认
停用；更新与启停携带当前 `revision` 做乐观锁。新建使用 `schemaVersion: 1`，
编辑时保留服务端现有 schemaVersion，不会意外降级。

组织和域名弹窗使用同一个 JSON 编辑器，提供语法高亮、行号、搜索/撤销、格式化、
压缩和实时诊断。两类配置使用不同 Schema：组织 v1 只要求顶层是 object；域名 v1
校验 `StaticDomainConfig`，其中 `config.name` 是配置键，`config.description` 是显示
名称。语法或 Schema 校验失败时不能提交。两份 Schema 随插件版本管理，互不继承，
也不会让一侧 JSON 覆盖另一侧。

当前只接受 `schemaVersion: 1`。域名 JSON 必须是可直接下发给 Unity 的自包含快照；
`fallback_domain` 仅保留作格式兼容元数据，客户端不会再按它请求另一份配置。导入
按钮会完整替换编辑器内容而不合并；主前端文档缺失的默认或语言配置只由插件后端在
导入时从同一清单有界、逐层物化。清单加载失败不会禁用手工编辑。

关键写入 DTO：

```json
{
  "organizationId": 42,
  "schemaVersion": 1,
  "config": {}
}
```

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

```json
{
  "organizationId": 42,
  "domainId": 8
}
```

## 二维码

组合接口在 `qrUrl` 中返回完整的 yii3-a1 HTTPS GET URL，例如：

```text
https://a1.example.com/v1/white-label-configs?o=42&d=8
```

前端只校验、显示和复制该原始值，不自行拼接 URL，也不直接请求 yii3-a1。
二维码只对已启用且当前用户有权查看的组合显示。
本地开发唯一例外是 `http://localhost`、`http://127.0.0.1` 或 IPv6 loopback；
非 loopback HTTP 地址仍会被拒绝。

当前 `yii3-a1` 的白牌路由仍是草案且尚未部署；上述 URL 是已经确定的协议格式，
不是对线上可用性的声明。本设计不存在 `yii3-a3`。

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
system-admin 写 API 动态登记时，应使用仓库根目录的 snake_case
`system-admin-registration.example.json`，并保持 `access_scope:
"admin-only"`。

## 验证

```bash
pnpm --filter plugin-whitelabel-frontend type-check
pnpm --filter plugin-whitelabel-frontend test
pnpm --filter plugin-whitelabel-frontend build
```
