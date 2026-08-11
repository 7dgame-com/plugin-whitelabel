# REST API 契约

## 管理鉴权

所有 `/api/v1/*` 请求携带主平台 Bearer token。插件逐请求调用固定的主后端：

```http
GET /v1/plugin/verify-token
Authorization: Bearer <main-platform-token>
```

root 可读写；admin 只读；其他角色 403。更新和启停必须携带当前 `revision`。

## 域名配置

```http
GET  /api/v1/domain-configs?page=1&pageSize=20&q=xrugc
POST /api/v1/domain-configs
GET  /api/v1/domain-configs/{domainId}
PUT  /api/v1/domain-configs/{domainId}
POST /api/v1/domain-configs/{domainId}/enable
POST /api/v1/domain-configs/{domainId}/disable
```

创建：

```json
{
  "configKey": "dev.xrugc.com",
  "schemaVersion": 1,
  "config": {
    "name": "主站",
    "logoUrl": "https://cdn.example.com/brand/logo.webp",
    "theme": { "primaryColor": "#409eff" }
  }
}
```

- `configKey` 必须来自当前只读键目录中的 active/selectable 项，创建后不可修改；
- `config` 是独立的公开 JSON object，由 root 自行填写；
- `name` 若存在是普通内容，不是匹配键，可以是中文；
- 服务端不从主前端复制 JSON，也不注入、删除或改写内容字段；
- 新记录默认停用；`schemaVersion` 当前只接受 1；
- JSON 限制大小、深度、节点数和字段名，并拒绝凭据、token、密码等敏感字段。

更新不提交键：

```json
{
  "schemaVersion": 1,
  "revision": 5,
  "config": { "name": "更新后的品牌" }
}
```

启停：

```json
{ "revision": 5 }
```

插件启停只由数据库 `is_enabled` 决定，不解释 JSON 内同名或类似字段。

## 主前端只读键目录

```http
GET /api/v1/domain-import-catalog
```

仅 root。后端访问固定的 `/config/domains/manifest.json`，只返回摘要：

```json
{
  "source": "https://d.xrugc.com/config/domains/manifest.json",
  "items": [
    {
      "configKey": "dev.xrugc.com",
      "description": "XR UGC Dev",
      "isActive": true,
      "selectable": true
    }
  ]
}
```

响应不含源 JSON 内容。目录失败时返回 503，并暂停创建新键；已有记录的查看、编辑、
启停和公开解析不受影响。

## Unity 公开解析

```http
GET /v1/white-label-configs?domain=d.dev.xrugc.com
If-None-Match: "<previous-etag>"
```

请求只接受一个 hostname/slug `domain`。它拒绝 scheme、端口、路径、query、fragment、
userinfo、通配符、空 label、旧 `o/d` 参数和额外参数。

命中时直接返回插件数据库保存的 JSON：

```json
{
  "name": "主站",
  "logoUrl": "https://cdn.example.com/brand/logo.webp"
}
```

响应无 `code/data` 包装，也不返回 `configKey`、`domainId` 或组织。候选顺序为完整域名
到父域名，例如：

```text
d.dev.xrugc.com -> dev.xrugc.com -> xrugc.com -> {}
```

未配置或首条现有记录被停用时返回 HTTP 200 与 `{}`。响应使用强 ETag 和
`Cache-Control: public, no-cache, must-revalidate`；命中 `If-None-Match` 返回 304。

## 错误格式

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "The record changed before this request was applied"
  }
}
```
