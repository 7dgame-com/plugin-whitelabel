# XRUGC 白牌插件

`plugin-whitelabel` 是 XRUGC / MrPP 的独立白牌配置插件。它把购买方和代理方建模为
两个完全独立的配置资源：

- **组织 JSON**：购买账号的购买方配置；
- **域名 JSON**：代理产品的代理方配置；
- **组合授权**：只声明某个组织可以搭配某个域名，不保存或合并 JSON；
- **HTTPS 二维码**：二维码本身是 `yii3-a1` 的只读 REST 地址，Unity 扫描后直接
  `GET` 获取两份独立 JSON。

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
权威源；`yii3-a1` 只承担公开、只读的 Unity 网关。

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

首次交付会建立并推送三个分支。CI 工作流不在本次提交中配置，后续共同确认发布
规则后再加入。

## 安全约束

- 两份 `config_json` 都会下发到 Unity，应始终视为公开数据；
- JSON 中禁止 token、密码、签名密钥、数据库连接串等秘密；
- JSON 字段名只允许 ASCII 字母、数字、点、下划线和连字符，避免 Unicode 同形键绕过；
- 新配置和新组合默认停用，确认后显式启用；
- 所有修改和启停操作使用 `revision` 乐观锁；
- 不提供硬删除，避免数字 ID 被复用后使旧二维码指向新对象；
- Unity 必须保存内置默认值和 last-known-good，远端失败不能阻塞启动。
