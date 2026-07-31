# REST API 契约

所有管理时间均为 ISO 8601 UTC。成功响应使用 `code: 0`。创建默认停用，不提供硬
删除。PUT 和启停请求必须携带当前 `revision`，冲突返回 `409 Conflict`。

## 1. 管理 API 通用鉴权

管理请求携带主平台 Bearer token。插件后端逐请求调用：

```http
GET /v1/plugin/verify-token
Authorization: Bearer <main-platform-token>
```

- root：不受组织范围限制；
- admin：组织 API 和组合列表强制限制到 `organizations[].id`；
- user / manager：403；
- 主后端不可用或响应无效：失败关闭，不执行管理操作。

## 2. 组织 JSON

```http
GET  /api/v1/organization-configs?page=1&pageSize=20&q=buyer
POST /api/v1/organization-configs
GET  /api/v1/organization-configs/{organizationId}
PUT  /api/v1/organization-configs/{organizationId}
POST /api/v1/organization-configs/{organizationId}/enable
POST /api/v1/organization-configs/{organizationId}/disable
```

创建示例：

```json
{
  "organizationId": 42,
  "schemaVersion": 1,
  "config": {}
}
```

更新示例：

```json
{
  "revision": 3,
  "schemaVersion": 1,
  "config": {}
}
```

admin 只能为当前会话包含的组织 ID 创建、查看、修改或启停。组织 ID 在创建后不可
更改。组织名称和标题不接受客户端写入：admin 使用 `verify-token` 权威快照，root
通过现有主后端组织目录确认 ID 并取得权威快照。

组织 `config` 与下节的域名 `config` 是两个完全独立的字段空间。组织 Schema v1
只要求顶层为 JSON object，并执行通用安全限制；它不要求也不复用
`StaticDomainConfig` 的结构。admin 同时属于多个组织时，可以分别管理这些组织的
JSON，但不能借由任一组织权限读取其他组织或域名 JSON。

## 3. 域名 JSON

域名写操作仅 root 可用。这里的域名是主前端静态配置键/域名族，不是精确
hostname：

```http
GET  /api/v1/domain-import-catalog
GET  /api/v1/domain-configs?page=1&pageSize=20&q=agent
POST /api/v1/domain-configs
GET  /api/v1/domain-configs/{domainId}
PUT  /api/v1/domain-configs/{domainId}
POST /api/v1/domain-configs/{domainId}/enable
POST /api/v1/domain-configs/{domainId}/disable
```

`domain-import-catalog` 是 root-only 的辅助读取接口。它只访问后端环境变量指定的主
前端 origin，并固定请求 `/config/domains/manifest.json`；浏览器不能提交任意 URL。
响应中的 `config` 可一次性复制进编辑器：

```json
{
  "source": "https://d.dev.xrugc.com/config/domains/manifest.json",
  "items": [
    {
      "configKey": "dev.xrugc.com",
      "description": "XR UGC Dev",
      "isActive": true,
      "importable": true,
      "materializedFrom": [],
      "warnings": [],
      "config": {}
    }
  ]
}
```

未配置来源、超时或清单顶层无效时仅该接口返回 `503`，手工编辑、CRUD、健康检查及
Unity 解析链路均不受影响。单个条目不符合插件 Schema 时只禁用该项，不会隐藏其他
合法项。外部 fallback 由后端从同一清单做最多 8 层、带循环检测的逐层物化：本地非
空默认配置优先，语言配置按语言键分别覆盖；不能安全物化的条目返回
`importable: false` 和 `reason`，不会写数据库。

创建示例：

```json
{
  "configKey": "dev.xrugc.com",
  "schemaVersion": 1,
  "config": {
    "name": "dev.xrugc.com",
    "description": "XR UGC Dev",
    "is_active": true,
    "fallback_domain": "default",
    "default_config": {
      "homepage": "https://dev.xrugc.com/"
    },
    "configs": {
      "zh-CN": {
        "title": "XR UGC Dev"
      }
    }
  }
}
```

服务端生成数字 `domainId`。客户端提交全局唯一的 `configKey`，且它必须与
`config.name` 完全相等；服务端从 `config.description` 派生只读 `displayName`。
客户端不提交 `displayName` 或当前访问 host。

响应同样以完整 JSON 为准：`configKey` 始终取 `config.name`，显示说明始终取
`config.description`；说明为空或纯空白时，前端才临时回退显示 `configKey`。

更新请求增加 `revision`，其余字段保持相同。`config.name` 必须符合主前端静态配置
键的规范并与返回的 `configKey` 一致；例如请求 host `d.dev.xrugc.com` 对应的配置键
可以是 `dev.xrugc.com`。修改配置键不会改变插件数字 `domainId`。

域名 `config` 是与主前端 `StaticDomainConfig` 同结构的独立快照，包含：

| 字段 | 约束 |
|---|---|
| `name` | 必填；配置键，也是主前端静态文件名去掉 `.json` 后的部分 |
| `description` | 必填 string；代理方显示名称来源 |
| `is_active` | 必填 boolean |
| `fallback_domain` | 必填 string 或 null，非 null 值同样是配置键 |
| `default_config` | 必填 object |
| `configs` | 必填 object；每个语言键的值必须为 object |

插件只在 root 主动打开管理弹窗时通过上述目录接口读取主前端清单，且永不改写主
前端文件。导入是完整的一次性复制，不是合并或同步。如果同一个新键也要在主前端
生效，需要在主前端仓库单独增加
`web/public/config/domains/{configKey}.json` 并发布。
`fallback_domain` 只作为格式兼容元数据返回，插件、A1 和 Unity 不沿它递归读取其他
文件。提交给插件的快照必须已经包含 Unity 所需的有效内容；外部 fallback 且
`default_config`、`configs` 都为空的纯引用文档会被拒绝。

当前组织和域名接口只接受 `schemaVersion: 1`。创建时可以省略该字段并默认使用 1；
更新必须显式提交 1，不能用未实现的版本号绕过当前 Schema。

## 4. 组合授权与二维码

```http
GET  /api/v1/assignments?page=1&pageSize=20
POST /api/v1/assignments
POST /api/v1/assignments/{assignmentId}/enable
POST /api/v1/assignments/{assignmentId}/disable
```

创建仅 root 可用：

```json
{
  "organizationId": 42,
  "domainId": 8
}
```

组合列表权限：

- root 查看全部；
- admin 只查看自己当前所属组织的组合；
- admin 不得创建或启停组合。

组合响应包含由后端固定 `A1_PUBLIC_BASE_URL` 生成的 `qrUrl`：

```json
{
  "assignmentId": 12,
  "organizationId": 42,
  "domainId": 8,
  "revision": 2,
  "enabled": true,
  "organization": {
    "name": "buyer-a",
    "title": "购买方 A",
    "enabled": true
  },
  "domain": {
    "configKey": "dev.xrugc.com",
    "displayName": "XR UGC Dev",
    "enabled": true
  },
  "createdBy": "1001",
  "updatedBy": "1001",
  "statusChangedBy": "1001",
  "createdAt": "2026-07-31T08:00:00.000Z",
  "updatedAt": "2026-07-31T08:05:00.000Z",
  "statusChangedAt": "2026-07-31T08:05:00.000Z",
  "qrUrl": "https://a1.example.com/v1/white-label-configs?o=42&d=8"
}
```

`qrUrl` 不从浏览器请求 host、Origin 或用户输入构造。
前端只有在组合、`organization.enabled` 和 `domain.enabled` 三层同时为 true 时才
显示可用二维码。

## 5. 插件内部解析 API

仅 `yii3-a1` 可调用：

```http
GET /internal/v1/white-label-configs/resolve?o=42&d=8
X-Internal-Token: <shared-secret>
If-None-Match: "wl-o42-r3-d8-r5-a2"
```

成功响应不使用 `code/data` 包装，A1 可以原样转发：

```json
{
  "version": 1,
  "organization": {
    "id": 42,
    "name": "buyer-a",
    "title": "购买方 A",
    "schemaVersion": 1,
    "revision": 3,
    "config": {}
  },
  "domain": {
    "id": 8,
    "configKey": "dev.xrugc.com",
    "schemaVersion": 1,
    "revision": 5,
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

响应头：

```http
ETag: "wl-o42-r3-d8-r5-a2"
Cache-Control: private, max-age=60
```

任一配置或组合不存在、停用以及 ID 非法均返回相同 404。

## 6. Unity / yii3-a1 公开 API

> 当前状态：以下 `yii3-a1` 白牌路由是待接入契约，尚未部署。二维码格式已经确定，
> 但在 A1 实现并发布前不能形成可访问的完整链路。本设计不使用 `yii3-a3`。

```http
GET /v1/white-label-configs?o=42&d=8
If-None-Match: "wl-o42-r3-d8-r5-a2"
```

A1 严格校验两个参数为正整数，然后调用固定的插件内部地址。它不访问插件数据库，
不转发客户端 Authorization，也不复制白牌权限和组合逻辑。
