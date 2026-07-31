# Unity HTTPS 二维码协议

## 1. v1 格式

目标二维码内容本身是可直接访问的 `yii3-a1` HTTPS REST 地址：

```text
https://a1.example.com/v1/white-label-configs?o=42&d=8
```

| 参数 | 含义 |
|---|---|
| `o` | 主平台数字组织 ID，代表账号购买方 |
| `d` | 插件数字域名 ID，代表产品代理方 |

`d` 不是主前端域名表 ID，也不是精确 hostname；它是白牌插件自己的稳定数字
`domainId`。插件再用该 ID 取得 `configKey` 和完整域名配置快照。不使用
`mrpp://`、ULID、组织名称、`configKey` 或完整请求域名作为二维码索引，也不存在
`yii3-a3`。

> 当前 `yii3-a1` 白牌路由仍是草案且尚未部署。本页定义最终协议；在 A1 完成实现和
> 发布前，二维码 URL 不能被视为已可用的线上接口。

## 2. URL 生成

插件后端从部署配置生成 URL：

```text
A1_PUBLIC_BASE_URL + /v1/white-label-configs?o={organizationId}&d={domainId}
```

- 生产环境的 base URL 必须是 HTTPS；本地界面仅额外接受 loopback HTTP；
- 不从浏览器 Host、Origin、Referer 或表单输入构造；
- 二维码只为数据库中存在的组合生成；
- 组合、组织配置和域名配置都启用后，URL 才能成功解析。

插件保存的是域名族的 `configKey` 及 `StaticDomainConfig` 独立快照，不保存扫描时的
精确 hostname。例如 `d.dev.xrugc.com` 可对应 `configKey = dev.xrugc.com`。A1 响应
返回 `configKey`，二维码本身不需要包含它。

## 3. Unity 处理流程

1. 扫描二维码并解析 HTTPS URL；
2. 校验 URL origin 属于 Unity 允许的 A1 部署地址；
3. 校验路径为 `/v1/white-label-configs`，`o`、`d` 都是正整数；
4. 直接 GET 扫描得到的 URL；
5. 校验响应同时包含 `organization` 和 `domain` 两个对象；
6. 校验 `domain.configKey === domain.config.name`，再分别校验两侧
   `schemaVersion`，原子应用两份 JSON；`fallback_domain` 仅作元数据，不发起递归
   请求；
7. 成功后保存响应和 ETag 作为 last-known-good；
8. 304 继续使用缓存；404 回退默认值；网络错误或 503 回退 last-known-good。

Unity 不能只应用其中一侧，也不能把两个 `config` 对象自动深度合并。

## 4. 安全边界

二维码不包含：

- JWT、刷新 token 或登录码；
- 两份完整 JSON；
- 插件后端内网地址；
- A1 与插件共享的内部 token；
- 密码、密钥或签名材料。

数字 ID 是公开定位符，不是授权凭证。A1 后面的插件服务仍需验证组合和三层启用
状态。两份 JSON 都应视为公开数据。
