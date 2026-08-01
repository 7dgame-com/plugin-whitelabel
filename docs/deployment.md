# 部署与接入

## 1. 插件服务

部署：

- `frontend`：Vue 静态应用；
- `backend`：管理 API 和 Unity 公开只读解析 API；
- `db`：插件独立 MySQL database/schema，可与其他服务复用同一 MySQL 实例。

关键环境变量：

| 组件 | 变量 | 说明 |
|---|---|---|
| frontend | `APP_API_1_URL` | 现有主后端地址 |
| frontend | `APP_BACKEND_1_URL` | 插件后端地址 |
| backend | `MAIN_API_BASE_URL` | 现有主后端固定地址 |
| backend | `MAIN_FRONTEND_PUBLIC_BASE_URL` | 可选；root 导入使用的主前端纯 origin |
| backend | `DOMAIN_CATALOG_TIMEOUT_MS` | 可选；域名清单读取超时，默认 3000ms，最大 10000ms |
| backend | `WHITELABEL_PUBLIC_BASE_URL` | 二维码使用的插件公网 HTTPS origin |
| backend | `DB_HOST` 等 | 插件数据库 |

直接运行后端时使用 `MAIN_FRONTEND_PUBLIC_BASE_URL`；仓库 Compose 通过
`MAIN_FRONTEND_DOCKER_PUBLIC_BASE_URL` 把它传入容器。Docker 变量为空时会真正禁用
目录导入，仅该辅助接口返回 503，其他功能不受影响。

示例 Compose 只把后端端口绑定 loopback，不能直接用于生产。部署代理应只把精确的
`GET /v1/white-label-configs` 路径转发到插件后端，并对该路径配置限流；管理接口继续
通过前端同源代理访问。MySQL 永远只在内部网络暴露，不能发布 3306。

## 2. 主前端注册

通过 `system-admin` 写 API 注册
`system-admin-registration.example.json`（snake_case）：

- `access_scope = admin-only`；
- `organization_name = null`；
- 插件注册记录使用公共组织范围；
- `url` 使用插件真实地址，system-admin 会从中派生 allowed origin。

`plugins.json.example` 是主前端静态目录的 camelCase 格式，不可混用为写 API DTO。

无需修改 `web/src/plugin-system` 或主前端业务路由。

### 域名静态配置边界

插件域名 JSON 对齐主前端 `StaticDomainConfig` 结构，配置键也沿用
`web/public/config/domains/{configKey}.json` 的命名语义，但两份数据是独立的：

- 插件保存自己的完整 JSON 快照，供 Unity 解析；
- 主前端构建在 `/config/domains/manifest.json` 发布按配置键排序的现有 JSON 清单；
- root 可在插件中搜索清单并把一项完整复制进编辑器，保存后不再自动同步；
- 插件运行时解析链路不读取、不写入主前端静态文件，也不要求主前端可用；
- 主前端的匹配器会去掉 `d.` / `www.` 并逐级尝试父域名，因此
  `d.dev.xrugc.com` 可命中键 `dev.xrugc.com`；
- 若新配置也要被主前端识别，必须在主前端仓库单独新增对应 JSON 并完成一次主前端
  发布。只在插件中创建记录不会改变主前端行为。

## 3. 主后端

不做代码和数据库改造。插件复用现有：

- `GET /v1/plugin/verify-token`：角色和多个组织 ID；
- 现有组织列表：root 配置界面的组织选择。

主后端故障时管理请求失败关闭，但 Unity → 插件公开只读 API 的读取链路不经过主
后端。

## 4. Unity 公开读取

插件后端配置自己的公开 origin：

```env
WHITELABEL_PUBLIC_BASE_URL=https://whitelabel.example.com
```

部署代理公开：

```http
GET /v1/white-label-configs?o={organizationId}&d={domainId}
```

`yii3-a1`、主后端和主前端均不参与该读取链路。数字 ID 是公开定位符；真正的返回
条件是组织配置、域名配置和组合授权三层都启用。

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
- 域名表单只编辑 `StaticDomainConfig` JSON，`configKey` 来自 `config.name`，显示名
  来自 `config.description`，不再录入精确 hostname；
- root 可以从主前端清单搜索配置键并一次性导入；目录不可用时仍可手工编辑，且
  CRUD 和 Unity 读取不受影响；
- JSON 编辑器能格式化、压缩并实时报告语法/Schema 错误，校验失败不能提交；
- 验证 `d.dev.xrugc.com` 等具体 host 与 `dev.xrugc.com` 配置键的域名族语义，不把
  host 错当成二维码索引；
- user / manager 无法进入插件且管理 API 返回 403；
- 新组织、新域名和新组合都默认停用；
- 只有三层都启用的组合可由公开解析接口返回；
- 任一缺失或停用统一 404；
- ETag 命中返回 304；
- 主后端不可用时不放行管理写操作；
- 插件后端不可用时 Unity 回退 last-known-good；
- 部署代理只向插件后端转发公开解析路径，管理路径不能被绕过；
- 两份 JSON 均不存在 token、password、secret、privateKey 等字段；
- 生产二维码 URL 使用 HTTPS 且来自固定 `WHITELABEL_PUBLIC_BASE_URL`。

当前 develop 数据库已确认没有历史域名记录，因此本次语义切换不需要 DDL 或回填。
在进入 main/publish 前仍必须重新审计目标库；若存在旧版任意 JSON 行，应先停用并
人工转换为自包含 `StaticDomainConfig`，保持原数字 `domainId` 后再启用，不能把旧
JSON 强制伪装成新 Schema。
