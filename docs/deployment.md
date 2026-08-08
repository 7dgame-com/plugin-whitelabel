# 部署与数据切换

## 1. 服务

| 服务 | 职责 |
|---|---|
| `frontend` | root/admin 域名管理界面 |
| `backend` | 管理 API 与公开域名解析 API |
| MySQL 8 | 插件独立 database/schema |

关键环境变量：

| 组件 | 变量 | 说明 |
|---|---|---|
| frontend | `APP_API_1_URL` / `APP_API_2_URL` | 主后端主备地址，用于 verify-token |
| frontend | `APP_BACKEND_1_URL` | 同一 stack 内的插件后端 origin |
| backend | `MAIN_API_BASE_URL` | 主后端固定 base URL |
| backend | `MAIN_API_TIMEOUT_MS` | 管理鉴权超时 |
| backend | `MAIN_FRONTEND_PUBLIC_BASE_URL` | 可选；root 导入使用的主前端纯 origin |
| backend | `DOMAIN_CATALOG_TIMEOUT_MS` | 可选；manifest 超时 |
| backend | `DB_HOST` 等 | 插件 MySQL |

插件不再生成二维码，因此没有 `WHITELABEL_PUBLIC_BASE_URL`。公开 resolver 的完整 URL
由开发环境的入口代理和独立登录上下文提供。

## 2. 网络边界

管理前端同源代理：

```text
/api/*          -> 主后端
/backend/api/*  -> 插件后端管理 API
```

开发环境可由入口代理直接暴露插件后端。生产环境由管理前端仅代理这一条精确公开路由：

```http
GET /v1/white-label-configs?domain=<hostname>
```

建议对该路径限流并保留 ETag。不要把插件后端的整个 `/api/v1/*` 直接暴露给公网；管理
接口仍必须经过 Bearer token 校验。MySQL 只在内部网络开放。

公开 resolver 不经过主前端业务代码、主后端或 `yii3-a1`。生产入口 nginx 只负责把该
精确路径转发到同一插件 stack 内的后端；管理 API 继续只允许
`/backend/api/*`。主前端和主后端不承载白牌公开解析请求。

## 3. 生产拓扑

```text
port.7dgame.com
  └─ plugin-whitelabel (Portainer stack)
       ├─ frontend:publish
       │    ├─ /api/*                  -> 主 API（只用于既有登录令牌校验）
       │    ├─ /backend/api/*          -> backend:8093
       │    └─ /v1/white-label-configs -> backend:8093
       ├─ backend:publish
       └─ MySQL 8.4 + 独立数据卷
```

生产编排模板为 `deploy/production.yml`，只部署到 `port.7dgame.com`。
它使用内部 Docker 网络连接前端、后端和 MySQL，只把前端加入公共
`proxy` 网络；后端和 MySQL 不发布主机端口。初始化容器会幂等地创建
`white_label_domain_config` 表。

数据库 root 密码和插件账号密码只放在 Portainer stack environment 中，
不写入 Compose 或仓库。不允许使用主业务库账号、主 Redis 或主应用数据卷。

## 4. 主前端注册

`system-admin-registration.example.json` 使用 snake_case：

- `access_scope = admin-only`；
- `organization_name = null`；
- `url` 使用插件开发环境真实地址；
- root 与 admin 可见，写权限仍由插件后端限制为 root。

`plugins.json.example` 是主前端静态目录的 camelCase 版本，不能直接作为 system-admin
写 API 请求体。

无需修改主前端 PluginSystem 或动态路由。

## 5. 主前端 manifest 边界

插件域名 JSON 与主前端 `web/public/config/domains/{configKey}.json` 使用同一数据结构
和配置键语义，但保存后是两份独立数据：

- 主前端构建发布 `/config/domains/manifest.json`；
- root 可在插件编辑器中选择一项并一次性复制；
- 插件不写主前端仓库，也不在运行时读取 manifest；
- manifest 不可用不会影响已有配置解析；
- 若新键也要影响主前端本身，仍需在主前端仓库单独增加 JSON 并发布。

## 6. 数据库初始化与旧数据

新安装应用：

```text
backend/db/schema.sql
```

它只创建 `white_label_domain_config`。

已有数据库的旧组织和 assignment 表不删除，新代码停止读写它们。切换前必须导出
以下清单：

- 所有 `white_label_domain_config` 及当前启停状态；
- 所有旧组织/assignment 数据用于审计；
- 每个已启用域名过去实际连接的组织数量。

重要行为变化：旧模型要求组织、assignment、域名三层同时启用；新模型只检查域名。
因此生产切换前不能盲目沿用旧 `is_enabled=1`。安全流程：

1. 备份数据库；
2. 列出所有已启用域名，由 root 确认其配置现在可以对该域名的所有用户公开；
3. 未确认的记录先停用；
4. 仅部署新公开接口和新客户端到开发环境；
5. 验证域名候选、停用熔断、缓存和 last-known-good；
6. 完成安全评审后再制定 main/publish 迁移窗口；
7. 旧表归档作为独立、可回滚的运维变更，不能夹带在应用发布中。

本仓库不自动把组织 JSON 合并进域名 JSON，也不执行破坏性 DDL。

## 7. 登录上下文接入

白牌插件部署只需提供公开 resolver URL，例如：

```text
https://whitelabel-d.plugins.xrugc.com/v1/white-label-configs
```

这个 URL 与当前前端 hostname 由另一份 loginKey 临时上下文提供给新 Unity 客户端。
插件本身不连接该 Redis、不读取 loginKey，也不关心上下文中的组织。详细契约见
[登录上下文与 Unity 接入](login-context-integration.md)。

## 8. CI/CD

分支与镜像 tag：

| Git 分支 | 镜像 tag |
|---|---|
| `develop` | `develop` |
| `main` | `main` |
| `publish` | `publish`、`latest` |

工作流运行：

1. Node.js 22 + pnpm 10.12.1 锁定安装；
2. TypeScript/Vue 类型检查、单元测试、生产构建；
3. MySQL 8 repository 集成测试；
4. 构建 `linux/amd64` 镜像并推送腾讯容器镜像服务。

```text
hkccr.ccs.tencentyun.com/plugins/plugin-whitelabel-frontend
hkccr.ccs.tencentyun.com/plugins/plugin-whitelabel-backend
```

## 9. 开发环境验收

- root 能查看、创建、编辑、启停和导入域名配置；
- admin 能查看列表和完整 JSON，但没有任何写入口，直接写 API 返回 403；
- user / manager 无法进入插件；
- 管理界面不再出现组织、assignment、二维码或 `o/d`；
- `d.dev.xrugc.com` 依次匹配自身、`dev.xrugc.com`、`xrugc.com`；
- 大小写、尾点和 IDN 规范化正确；scheme、路径、端口、userinfo 被拒绝；
- 第一条存在但停用的记录阻断父域名回退并返回 `{}`；
- 未知域名在所有候选不存在时返回 `{}`，不使用 `default`；
- 响应不含组织、assignment 或公开 `domainId`；
- ETag 命中返回 304；
- 主后端不可用时管理失败关闭，公开解析仍可工作；
- 登录二维码仍是 `web_<loginKey>`，旧客户端登录行为不变；
- 仅开发域名和 develop 镜像被修改。
