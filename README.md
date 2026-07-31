# XRUGC 白牌插件

`plugin-whitelabel` 是 XRUGC / MrPP 的独立白牌配置插件。它把购买方和代理方建模为
两个完全独立的配置资源：

- **组织 JSON**：购买账号的购买方配置；
- **域名 JSON**：代理产品的代理方配置，是与主前端 `StaticDomainConfig` 同结构的
  独立快照；
- **组合授权**：只声明某个组织可以搭配某个域名，不保存或合并 JSON；
- **HTTPS 二维码**：目标协议是把二维码做成 `yii3-a1` 的只读 REST 地址，Unity
  扫描后直接 `GET` 获取两份独立 JSON。

这里的“域名”不是某一个精确 hostname，而是主前端静态域名配置的
`configKey` / 域名族。例如请求域名 `d.dev.xrugc.com` 会命中配置键
`dev.xrugc.com`。插件另外生成稳定的数字 `domainId`，二维码中的 `d` 只放这个
数字 ID。

## 最终架构

```text
主前端 PluginSystem
  └─ iframe 加载 plugin-whitelabel frontend
       ├─ /api/*      -> 现有主后端（会话和组织身份）
       └─ /backend/*  -> plugin-whitelabel backend（管理 API）

plugin-whitelabel backend
  ├─ 逐请求调用主后端 /v1/plugin/verify-token
  └─ 独立 MySQL
       ├─ white_label_organization_config
       ├─ white_label_domain_config
       └─ white_label_assignment

二维码 HTTPS URL
  └─ yii3-a1 /v1/white-label-configs?o={organizationId}&d={domainId}
       └─ 内网调用 plugin backend /internal/v1/white-label-configs/resolve
```

主前端和主后端均不新增白牌业务代码或白牌数据表。主后端只继续作为身份与组织
权威源；规划中的 `yii3-a1` 只承担公开、只读的 Unity 网关。

> **当前状态：** `yii3-a1` 的白牌路由仍是接口草案，尚未部署。因此当前二维码
> URL 代表最终协议，不能把它当作已经可用的线上接口；本项目不存在
> `yii3-a3`。

## 域名配置键与主前端的关系

- 插件保存完整的域名 JSON 快照，`config.name` 就是 `configKey`，例如
  `dev.xrugc.com`；`config.description` 用作显示名称；
- 插件运行时不读取、不修改，也不依赖主前端的
  `web/public/config/domains/*.json`；主前端停机不会影响 Unity 解析已保存的快照；
- 快照必须已经包含 Unity 所需的有效内容。`fallback_domain` 只保留为与主前端格式
  对齐的元数据，插件、A1 和 Unity 都不会沿它递归抓取另一份配置；完全依赖外部
  fallback 且自身内容为空的文档不能保存；
- 主前端现有匹配规则会去掉 `d.` / `www.` 并逐级尝试父域名，所以
  `d.dev.xrugc.com` 可以命中 `dev.xrugc.com`；
- 如果同一配置也要被主前端识别，必须另行新增并发布
  `web/public/config/domains/{configKey}.json`。插件不会自动把数据同步进主前端。

域名快照示例见 [`docs/domain-config.example.json`](docs/domain-config.example.json)，
组织 JSON 示例见
[`docs/organization-config.example.json`](docs/organization-config.example.json)。两者的
字段空间互不影响，后端和 Unity 都不会把它们合并。

完整设计见：

- [架构与权限](docs/architecture.md)
- [REST API 契约](docs/api.md)
- [HTTPS 二维码协议](docs/qr-protocol.md)
- [部署与接入](docs/deployment.md)

## 权限摘要

| 能力 | root | admin |
|---|---:|---:|
| 管理所有组织 JSON | 是 | 否 |
| 管理自己所属组织 JSON | 是 | 是 |
| 管理域名 JSON | 是 | 否 |
| 管理组织 × 域名组合 | 是 | 否 |
| 查看自己组织的组合和二维码 | 是 | 是 |

admin 可以同时属于多个组织。其组织范围完全取自主后端 `verify-token` 当前返回的
组织 ID，不在插件数据库复制用户—组织关系。

## 本地开发

需要 Node.js 22+、pnpm 10+ 和 Docker。

```bash
cp .env.example .env
docker compose up -d db
pnpm install
pnpm dev
```

默认端口：

| 服务 | 地址 |
|---|---|
| 插件前端 | `http://localhost:3012` |
| 插件后端 | `http://localhost:8093` |
| 插件 MySQL | `localhost:3337` |
| 主后端（外部依赖） | `http://localhost:8081` |
| yii3-a1（外部依赖） | `http://localhost:8888` |

`yii3-a1` 地址是待接入的外部依赖；在白牌路由完成并部署前，本地或开发环境中的
二维码解析不会形成完整闭环。

## 主前端注册

通过 `system-admin` 动态注册时，提交
[`system-admin-registration.example.json`](system-admin-registration.example.json)。
该写 API 使用 snake_case 字段，其中必须保持：

```json
{
  "id": "whitelabel",
  "name": "白牌配置",
  "url": "http://localhost:3012/",
  "icon": "Brush",
  "enabled": 1,
  "order": 30,
  "access_scope": "admin-only",
  "organization_name": null,
  "version": "1.0.0"
}
```

[`plugins.json.example`](plugins.json.example) 则是主前端静态插件目录使用的 camelCase
格式，不可直接作为 system-admin 写 API 的请求体。

插件注册记录保持公共组织范围（`organization_name = NULL`）。真正的数据范围由插件
后端逐请求校验，不能依赖前端路由守卫。

## 分支约定

- `develop`：日常集成分支；
- `main`：经过验证的稳定代码；
- `publish`：生产发布分支。

三个分支的 push 都会执行类型检查、单元测试、真实 MySQL 集成测试和生产构建。
验证通过后，Docker 工作流会向腾讯容器镜像服务推送两个独立镜像：

- `hkccr.ccs.tencentyun.com/plugins/plugin-whitelabel-frontend`；
- `hkccr.ccs.tencentyun.com/plugins/plugin-whitelabel-backend`。

分支与镜像 tag 一一对应；`publish` 还会同时更新 `latest`。数据库使用标准 MySQL 8，
不构建或发布插件私有数据库镜像。详细规则见[部署文档](docs/deployment.md#6-分支与-cicd)。

## 安全约束

- 两份 `config_json` 都会下发到 Unity，应始终视为公开数据；
- 组织和域名使用两个独立 JSON Schema。组织 v1 只要求顶层为 object；域名 v1
  校验 `StaticDomainConfig` 字段以及 `config.name === configKey`；
- 当前只实现 `schemaVersion: 1`，创建时可省略并默认填 1，更新必须显式提交 1；
- 管理界面共用 JSON 编辑器，提供语法高亮、行号、格式化、压缩和实时 Schema
  诊断；JSON 或 Schema 校验失败时不能保存；
- JSON 中禁止 token、密码、签名密钥、数据库连接串等秘密；
- JSON 字段名只允许 ASCII 字母、数字、点、下划线和连字符，避免 Unicode 同形键绕过；
- 新配置和新组合默认停用，确认后显式启用；
- 所有修改和启停操作使用 `revision` 乐观锁；
- 不提供硬删除，避免数字 ID 被复用后使旧二维码指向新对象；
- Unity 必须保存内置默认值和 last-known-good，远端失败不能阻塞启动。
