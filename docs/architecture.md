# 架构与权限

## 1. 设计原则

本设计按以下顺序取舍：

1. **业务身份正确**：组织代表账号购买方，域名代表产品代理方；
2. **配置完全分离**：双方各自维护一份 JSON，不复制、不合并、不覆盖；
3. **权限边界明确**：admin 只管理当前会话所属组织，root 管理代理域名和组合；
4. **低耦合**：主前端和主后端不承载白牌业务，A1 只做只读网关；
5. **失败安全**：任何一侧或组合无效时都不返回半份配置。

## 2. 组件关系

```mermaid
flowchart LR
    Host["主前端 / PluginSystem"] -->|"iframe + INIT token"| UI["插件前端"]
    UI -->|"Bearer token"| API["插件后端"]
    API -->|"verify-token"| Main["现有主后端"]
    API --> DB[("插件独立 MySQL")]
    UI -->|"显示 HTTPS QR"| QR["A1 URL: ?o=组织ID&d=域名ID"]
    Unity["Unity"] -->|"扫描并 GET"| A1["yii3-a1 只读网关"]
    A1 -->|"固定内网 URL + X-Internal-Token"| API
```

### 主前端

- 只通过现有插件系统加载 iframe；
- 继续使用 `PLUGIN_READY -> INIT`、token 更新、主题和语言协议；
- 不新增白牌页面、路由或白牌状态。

### 主后端

- 不新增白牌表、控制器或写入逻辑；
- 现有 `GET /v1/plugin/verify-token` 提供用户、角色和组织数组；
- 可由前端使用现有组织列表接口提供 root 的组织选择；
- 管理链路依赖主后端校验；Unity 读取链路不经过主后端。

### 插件后端

- 拥有三张白牌业务表、所有校验、审计和启停状态；
- 每次管理请求都校验主平台 Bearer token，失败时关闭写操作；
- 不信任前端提交的角色、用户 ID 或组织权限；
- 两份 JSON 的字段名限制为可审计的 ASCII 标识符，并递归拒绝认证、token、密码、
  私钥和连接串等敏感字段；
- 向 A1 暴露固定 token 保护的内部只读解析接口。

### yii3-a1

- 公开 `GET /v1/white-label-configs?o={organizationId}&d={domainId}`；
- 只接受两个正整数 ID；
- 内部服务地址来自部署环境变量，不从二维码 host 或请求参数构造；
- 只转发允许的 JSON、ETag 和 Cache-Control；
- 404 原样归一，其余上游异常返回不泄漏细节的 503。

不存在也不创建 `yii3-a3`；白牌公开读取入口是现有 `yii3-a1`。

## 3. 权限模型

| 操作 | root | admin |
|---|---:|---:|
| 查看全部组织配置 | 是 | 否 |
| 创建、编辑、启停自己组织的 JSON | 是 | 是 |
| 创建、编辑、启停域名 JSON | 是 | 否 |
| 创建、启停组织 × 域名组合 | 是 | 否 |
| 查看自己组织的组合和二维码 | 是 | 是 |

admin 可以属于多个组织。后端将 `verify-token` 返回的全部
`organizations[].id` 组成 allow-list：

- 查询在 SQL 层限制到 allow-list；
- 创建和修改必须命中 allow-list；
- 路径 ID、请求体和前端显示值都不能扩大范围；
- admin 被移出组织后，下一次请求立即失去权限；
- 多个 admin 编辑同一组织时由 `revision` 防止后写覆盖先写。

插件数据库不保存用户属于哪些组织，避免复制主平台的身份关系。

## 4. 数据模型

### `white_label_organization_config`

购买账号的购买方配置，每个主平台组织最多一条。

| 字段 | 含义 |
|---|---|
| `organization_id` | 主平台数字组织 ID，唯一且作为外部索引 |
| `organization_name` | 组织 slug 快照 |
| `organization_title` | 显示名称快照 |
| `schema_version` | 组织 JSON 契约版本 |
| `revision` | 乐观锁版本 |
| `config_json` | 购买方独立 JSON |
| `is_enabled` | 是否可参与 Unity 解析 |
| 审计字段 | 创建、更新、启停用户及时间 |

### `white_label_domain_config`

代理产品的代理方配置。

| 字段 | 含义 |
|---|---|
| `id`（API 为 `domainId`） | 插件生成的数字域名 ID，二维码外部索引 |
| `domain` | 小写精确 hostname，全局唯一 |
| `display_name` | 代理方显示名称 |
| `schema_version` | 域名 JSON 契约版本 |
| `revision` | 乐观锁版本 |
| `config_json` | 代理方独立 JSON |
| `is_enabled` | 是否可参与 Unity 解析 |
| 审计字段 | 创建、更新、启停用户及时间 |

域名记录不硬删除。同一代理方只是迁移 hostname 时可保留 ID；新增代理域名创建新
记录和新 ID。

### `white_label_assignment`

只表达允许的购买方 × 代理方组合，不保存 JSON。

| 字段 | 含义 |
|---|---|
| `id`（API 为 `assignmentId`） | 内部数字主键 |
| `organization_id` | 购买方组织 ID |
| `domain_id` | 代理域名 ID |
| `revision` | 乐观锁版本 |
| `is_enabled` | 组合是否可解析 |
| 审计字段 | 创建、更新、启停用户及时间 |

`organization_id + domain_id` 唯一。只有组合、组织配置和域名配置三者都启用时，
Unity 才能取得结果。

## 5. 两份 JSON

服务端永远不合并两个 JSON，也不建立字段覆盖优先级：

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

Unity 分别解析 `organization.config` 和 `domain.config`。两份 JSON 都只能包含运行时
公开配置；包名、签名、原生图标和版本号仍属于构建期属性。

## 6. 失败与缓存

- 任一 ID 非法、记录不存在、任一配置停用或组合停用：统一 404；
- 插件后端不可用或响应契约错误：A1 返回 503；
- ETag 同时包含组合、组织和域名 revision；
- If-None-Match 命中返回 304；
- Unity 成功后保存 last-known-good；
- 404 回退内置默认值，网络错误或 503 优先回退 last-known-good；
- 绝不应用只有组织或只有域名的半份配置。
