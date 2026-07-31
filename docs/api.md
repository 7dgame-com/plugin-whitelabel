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

## 3. 域名 JSON

域名写操作仅 root 可用：

```http
GET  /api/v1/domain-configs?page=1&pageSize=20&q=agent
POST /api/v1/domain-configs
GET  /api/v1/domain-configs/{domainId}
PUT  /api/v1/domain-configs/{domainId}
POST /api/v1/domain-configs/{domainId}/enable
POST /api/v1/domain-configs/{domainId}/disable
```

创建示例：

```json
{
  "domain": "agent.example.com",
  "displayName": "代理方 A",
  "schemaVersion": 1,
  "config": {}
}
```

服务端生成数字 `domainId`。hostname 规范化为小写精确域名，禁止 scheme、路径、
端口、通配符和 IP，且全局唯一。

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
    "host": "agent.example.com",
    "displayName": "代理方 A",
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
    "host": "agent.example.com",
    "schemaVersion": 1,
    "revision": 5,
    "config": {}
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

```http
GET /v1/white-label-configs?o=42&d=8
If-None-Match: "wl-o42-r3-d8-r5-a2"
```

A1 严格校验两个参数为正整数，然后调用固定的插件内部地址。它不访问插件数据库，
不转发客户端 Authorization，也不复制白牌权限和组合逻辑。
