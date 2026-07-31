# 部署与接入

## 1. 插件服务

部署：

- `frontend`：Vue 静态应用；
- `backend`：管理 API 和 A1 内部解析 API；
- `db`：插件独立 MySQL database/schema，可与其他服务复用同一 MySQL 实例。

关键环境变量：

| 组件 | 变量 | 说明 |
|---|---|---|
| frontend | `APP_API_1_URL` | 现有主后端地址 |
| frontend | `APP_BACKEND_1_URL` | 插件后端地址 |
| backend | `MAIN_API_BASE_URL` | 现有主后端固定地址 |
| backend | `A1_PUBLIC_BASE_URL` | 二维码使用的 A1 公网 HTTPS origin |
| backend | `DB_HOST` 等 | 插件数据库 |
| backend | `WHITELABEL_INTERNAL_TOKEN` | A1 内部调用共享 secret |

`WHITELABEL_INTERNAL_TOKEN` 必须由 Secret 管理器注入且至少 32 字符，不能写入镜像、
仓库或任何白牌 JSON。

示例 Compose 为本地开发保留插件后端端口，以便独立运行的 A1 调用。生产部署应让
A1 和插件后端通过受控内网服务发现互通，不向公网发布 `8093`；MySQL 也只在内部
网络暴露。仓库 Compose 是本地开发配置，端口只绑定 loopback，不能直接用于生产。
前端 nginx 和 Vite 只代理 `/backend/api/*`，其他 `/backend/*` 路径全部拒绝，
浏览器无法到达内部解析接口。

## 2. 主前端注册

通过 `system-admin` 写 API 注册
`system-admin-registration.example.json`（snake_case）：

- `access_scope = admin-only`；
- `organization_name = null`；
- 插件注册记录使用公共组织范围；
- `url` 使用插件真实地址，system-admin 会从中派生 allowed origin。

`plugins.json.example` 是主前端静态目录的 camelCase 格式，不可混用为写 API DTO。

无需修改 `web/src/plugin-system` 或主前端业务路由。

## 3. 主后端

不做代码和数据库改造。插件复用现有：

- `GET /v1/plugin/verify-token`：角色和多个组织 ID；
- 现有组织列表：root 配置界面的组织选择。

主后端故障时管理请求失败关闭，但 Unity → A1 → 插件内部 API 的读取链路不经过主
后端。

## 4. yii3-a1

A1 配置：

```env
WHITELABEL_SERVICE_URL=http://whitelabel-backend:8093
WHITELABEL_INTERNAL_TOKEN=<与插件后端一致的 secret>
```

A1 公开：

```http
GET /v1/white-label-configs?o={organizationId}&d={domainId}
```

A1 只读调用：

```http
GET /internal/v1/white-label-configs/resolve?o={organizationId}&d={domainId}
X-Internal-Token: <secret>
```

不存在 `yii3-a3` 接入。

## 5. 数据初始化

首次部署先应用：

```text
backend/db/schema.sql
```

脚本只创建插件自己的三张业务表，不修改主平台数据库。

## 6. 分支与 CI/CD

本仓库使用：

- `develop`：开发集成；
- `main`：稳定版本；
- `publish`：生产发布。

三个分支的 push 都会运行：

1. Node.js 22 与 pnpm 10.12.1 锁定安装；
2. TypeScript/Vue 类型检查、单元测试和生产构建；
3. 使用 MySQL 8 service 的真实 repository 集成测试；
4. Docker 发布工作流内的同等质量门禁；
5. 质量门禁通过后构建 `linux/amd64` 前后端镜像并推送腾讯容器镜像服务。

镜像地址：

```text
hkccr.ccs.tencentyun.com/plugins/plugin-whitelabel-frontend
hkccr.ccs.tencentyun.com/plugins/plugin-whitelabel-backend
```

tag 规则：

| Git 分支 | 镜像 tag |
|---|---|
| `develop` | `develop` |
| `main` | `main` |
| `publish` | `publish`、`latest` |

GitHub 仓库必须提供 `TENCENT_REGISTRY_USER` 和
`TENCENT_REGISTRY_PASSWORD` Actions Secrets。两个镜像都从仓库根目录构建，以便使用
同一份 pnpm workspace 锁文件；数据库继续使用腾讯环境中的标准 MySQL 8 服务，不会
上传数据库镜像。

## 7. 发布前检查

- root 能管理全部组织、域名和组合；
- admin 属于多个组织时能管理这些组织 JSON，不能读取其他组织；
- admin 不能修改域名 JSON 或组合授权；
- user / manager 无法进入插件且管理 API 返回 403；
- 新组织、新域名和新组合都默认停用；
- 只有三层都启用的组合可由 A1 返回；
- 任一缺失或停用统一 404；
- ETag 命中返回 304；
- 主后端不可用时不放行管理写操作；
- 插件后端不可用时 A1 返回 503；
- 两份 JSON 均不存在 token、password、secret、privateKey 等字段；
- 生产二维码 URL 使用 HTTPS 且来自固定 `A1_PUBLIC_BASE_URL`。
