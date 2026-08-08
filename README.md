# XRUGC 域名白牌插件

`plugin-whitelabel` 是一个独立的域名白牌配置服务。白牌结果只由当前前端的完整
hostname 决定，与用户、账号、组织和登录方式无关。

插件只保存一类数据：与主前端 `StaticDomainConfig` 同结构的域名 JSON 快照。请求
`d.dev.xrugc.com` 时，插件依次查找 `d.dev.xrugc.com`、`dev.xrugc.com`、
`xrugc.com`，返回第一条存在且可用的 JSON。

## 最终边界

```text
主前端 PluginSystem
  └─ iframe 加载 plugin-whitelabel frontend
       ├─ /api/*      -> 主后端（仅验证当前管理用户）
       └─ /backend/*  -> 插件后端（域名配置管理）

plugin-whitelabel backend
  ├─ 管理请求逐次调用主后端 /v1/plugin/verify-token
  ├─ root 可从主前端固定 domain manifest 一次性导入
  └─ 独立 MySQL：white_label_domain_config

Unity
  └─ GET /v1/white-label-configs?domain={完整 hostname}
       └─ 直接从插件 MySQL 解析并取得一份域名 JSON
```

- 插件不接收、不保存也不判断组织；
- 插件没有组织配置、组织 × 域名 assignment 或二维码生成功能；
- 公开解析不经过主前端、主后端或 `yii3-a1`；
- `yii3-a1` 继续只负责原有登录，不读取插件数据库；
- 登录二维码保持原样：`web_<loginKey>`；
- 新 Unity 客户端所需的前端域名、组织信息和配置服务地址属于另一份临时登录上下文，
  不属于白牌数据模型。组织可供其他业务使用，但不得传给白牌解析接口。

独立登录上下文的职责和兼容流程见
[登录上下文与 Unity 接入](docs/login-context-integration.md)。该上下文不在本插件仓库
实现。

## 域名如何匹配配置键

管理端保存的是主前端静态域名配置键，而不是每一个精确 hostname：

- `config.name` 是唯一 `configKey`，例如 `dev.xrugc.com`；
- `config.description` 是只读显示说明的来源；
- `config_json` 是完整、自包含的 `StaticDomainConfig` 快照；
- root 可从主前端 `/config/domains/manifest.json` 选择并复制一项，保存后与主前端
  文件独立，不会自动同步；
- 运行时对 hostname 做小写和 IDN ASCII 规范化，再按“完整域名优先、逐级父域”的
  顺序匹配；`d.` 和 `www.` 都是普通子域，不做特殊跳过；
- 如果第一条存在的记录被停用，则返回空 JSON，不越过它套用父域品牌；
- 所有候选都不存在时返回空 JSON `{}`，不使用 `default` 配置键；
- `fallback_domain` 只是已物化快照的格式元数据，运行时不递归读取其他文件。

例如：

```text
d.dev.xrugc.com
  -> d.dev.xrugc.com
  -> dev.xrugc.com
  -> xrugc.com
  -> {}（均不存在时）
```

## 权限

| 能力 | root | admin |
|---|---:|---:|
| 查看域名配置和完整 JSON | 是 | 是 |
| 创建、编辑、启停域名配置 | 是 | 否 |
| 从主前端 manifest 导入 | 是 | 否 |

域名是全局资源。移除组织后已不存在可用于限制 admin 写入范围的权威关系，因此 admin
只能读。以后如需委托写权限，应单独建立“用户 → 可管理域名”ACL；该 ACL 只管理后台
权限，不能参与公开白牌解析。

## 公开接口

```http
GET /v1/white-label-configs?domain=d.dev.xrugc.com
```

```json
{
  "name": "dev.xrugc.com",
  "description": "XR UGC Dev",
  "is_active": true,
  "fallback_domain": "default",
  "default_config": {},
  "configs": {}
}
```

公开接口只接收 `domain` 并直接返回配置 JSON，不接收或返回 `domainId`。旧的 `o`、
数字 `d` 参数不再接受。

详细设计：

- [架构与权限](docs/architecture.md)
- [REST API 契约](docs/api.md)
- [登录上下文与 Unity 接入](docs/login-context-integration.md)
- [部署与数据切换](docs/deployment.md)

## 本地开发

需要 Node.js 22+、pnpm 10.12.1 和 Docker。

```bash
cp .env.example .env
docker compose up -d db
pnpm install
pnpm dev
```

| 服务 | 地址 |
|---|---|
| 插件前端 | `http://localhost:3012` |
| 插件后端 | `http://localhost:8093` |
| 插件 MySQL | `localhost:3337` |
| 主后端（管理鉴权依赖） | `http://localhost:8081` |
| Unity 公开读取 | `http://localhost:8093/v1/white-label-configs?domain=dev.xrugc.com` |

## 主前端注册

动态注册示例见
[`system-admin-registration.example.json`](system-admin-registration.example.json)。插件
保持 `access_scope = admin-only`，让 root 与 admin 都能进入；真正的写权限由插件
后端逐请求强制为 root-only。注册记录使用公共组织范围
`organization_name = NULL`，这只是宿主插件可见性，不是白牌解析条件。

## 分支与 CI/CD

- `develop`：开发集成；
- `main`：经过验证的稳定代码；
- `publish`：生产发布。

分支 push 会运行类型检查、单元测试、MySQL 集成测试和构建，并发布对应 tag 的前后
端镜像。`publish` 另外更新 `latest`：

```text
hkccr.ccs.tencentyun.com/plugins/plugin-whitelabel-frontend
hkccr.ccs.tencentyun.com/plugins/plugin-whitelabel-backend
```

生产部署使用 `deploy/production.yml`，在 `port.7dgame.com` 作为一个独立
Portainer stack 运行前端、后端和 MySQL。插件不在 xrteeth/tmrpp 部署容器，
不复用主业务数据库、Redis、数据卷或数据库账号。

## 安全约束

- 域名 JSON 经公开接口下发，必须视为公开数据；
- hostname 参数拒绝 scheme、路径、端口、userinfo、通配符和空标签；
- 公开解析只使用显式参数，不读取 `Host` 或 `X-Forwarded-Host` 决定品牌；
- JSON 限制大小、深度、节点数和字段名，并拒绝 token、密码、私钥、数据库连接串等
  敏感字段；
- 新配置默认停用，修改和启停使用 `revision` 乐观锁；
- 不提供硬删除，避免 ID 复用并保留审计；
- Unity 保存内置默认值和 last-known-good，远端失败不能阻塞登录或启动。
