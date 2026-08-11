# REST API 契约

## 1. 管理鉴权

所有 `/api/v1/*` 请求携带主平台 Bearer token。插件后端逐请求调用固定的主后端
地址：

```http
GET /v1/plugin/verify-token
Authorization: Bearer <main-platform-token>
```

- root：可读写；
- admin：只读域名列表和详情；
- user / manager：403；
- token 无效或主后端不可用：失败关闭，不执行操作。

插件只读取会话中的用户 ID 与角色。`organizations` 即使出现在主后端响应中也会被
忽略。

管理成功响应使用 `code: 0`；时间为 ISO 8601 UTC。创建默认停用，不提供硬删除。
更新和启停必须携带当前 `revision`，冲突返回 `409 Conflict`。

## 2. 域名配置管理

```http
GET  /api/v1/domain-configs?page=1&pageSize=20&q=xrugc
POST /api/v1/domain-configs
GET  /api/v1/domain-configs/{domainId}
PUT  /api/v1/domain-configs/{domainId}
POST /api/v1/domain-configs/{domainId}/enable
POST /api/v1/domain-configs/{domainId}/disable
```

GET 允许 root 和 admin；POST、PUT、enable、disable 只允许 root。

创建：

```json
{
  "configKey": "dev.xrugc.com",
  "schemaVersion": 1,
  "config": {
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

创建时 `schemaVersion` 可省略并默认使用 1。`configKey` 必须是主前端导入目录中当前
可导入的键；它是唯一身份来源，创建后不可修改。`config` 禁止包含 `name`。
`domainId`、显示说明和审计字段由服务端生成。

更新只提交内容、Schema 版本和 revision，不再提交键：

```json
{
  "schemaVersion": 1,
  "revision": 5,
  "config": {}
}
```

上例中的 `config` 仅为结构缩写；实际请求仍须满足完整内容 Schema（不含 `name`）。

启停：

```json
{
  "revision": 5
}
```

约束：

- 数据库 `configKey` 是静态配置键，不是每次访问的精确 hostname；
- 公开返回时自动加入 `name = configKey`，管理端 JSON 不存 `name`；
- `config.description` 是显示说明来源；
- `config.is_active=false` 的记录不能启用；
- 已启用记录不能直接保存为 `config.is_active=false`，应先停用；
- `fallback_domain` 不触发运行时递归读取；
- JSON 必须自包含，且通过大小、深度、字段名和敏感键检查。

## 3. 主前端域名导入目录

```http
GET /api/v1/domain-import-catalog
```

仅 root 可用。后端只访问部署配置给出的主前端纯 origin，并固定追加：

```text
/config/domains/manifest.json
```

浏览器不能提交任意 URL。响应：

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

选择目录项会同时确定不可变 `configKey` 并把对应内容载入编辑器，root 只需编辑内容并
明确保存，不再另外填写键。保存后插件数据不会跟随主前端文件变化。

目录未配置、超时或协议无效时该辅助接口返回 503，并暂停新建记录；已有域名的读取、
更新、启停、健康检查和公开解析不受影响。外部 fallback 最多物化 8 层并检测循环，
不能安全物化的条目只标记为不可导入。

## 4. Unity 公开解析

```http
GET /v1/white-label-configs?domain=d.dev.xrugc.com
If-None-Match: "<previous-etag>"
```

请求恰好接受一个 `domain` 参数：

- 必须是 hostname 或静态配置 slug；
- 接受大小写和单个 DNS 尾点并规范化；
- IDN 统一转为 ASCII/Punycode；
- 拒绝 scheme、路径、query、fragment、端口、userinfo、通配符和空 label；
- 不接受 `organizationId`、`o`、数字 `d`、loginKey 或上游 URL。

成功响应直接就是匹配到的配置 JSON，不使用 `code/data` 包装，也不返回内部
`domainId`：

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

响应头：

```http
ETag: "..."
Cache-Control: public, no-cache, must-revalidate
```

客户端和中间缓存可以保存响应，但每次应用前都必须携带 `If-None-Match` 重验证；命中
返回 304。这样 root 停用记录后不会继续使用尚在 freshness 窗口内的旧品牌。
匹配顺序固定为完整域名到父域名。例如 `d.dev.xrugc.com` 依次查找：

```text
d.dev.xrugc.com -> dev.xrugc.com -> xrugc.com -> {}
```

以下情况返回 HTTP 200 和空 JSON `{}`：

- 所有域名候选均不存在；
- 候选顺序中的第一条现有记录被停用；
- `config.is_active=false`。

以下非法请求统一返回 404：

- 参数缺失、额外、非法；
- 旧版 `?o=<id>&d=<id>` 请求。

公开接口不读取登录身份或组织。登录成功与白牌解析成功是两个独立结果。

## 5. 已移除的 API

域名唯一模型不再提供：

```text
/api/v1/organization-configs
/api/v1/assignments
```

插件也不再生成白牌二维码或组合 URL。旧表可能暂时留在已有数据库用于审计，但没有
任何 HTTP 路径可以读写它们。

## 6. 错误格式

管理 API 的已知错误：

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "The record changed before this request was applied",
    "details": {}
  }
}
```

公开 resolver 对不存在和停用统一返回 `{}`；只有参数缺失、额外或非法时返回普通
404。
