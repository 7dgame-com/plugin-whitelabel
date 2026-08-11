# XRUGC 域名白牌插件

`plugin-whitelabel` 是独立的域名白牌配置服务。白牌只由访问 hostname 决定，与用户、
账号、组织和登录方式无关。

## 第一性模型

一条记录只有两部分，而且职责互不重叠：

1. `configKey`：从主前端 manifest 的只读目录选择，作为域名匹配键；
2. `config`：root 自行填写的独立白牌 JSON，保存于插件数据库并原样返回给 Unity。

插件只读取 manifest 中的 `configKey`、`description` 和 `isActive` 摘要。它不读取、
复制、合并、修改或同步主前端 JSON 文件。选择键只会确定记录身份并解锁编辑器。

`configKey` 不写进 JSON。JSON 内若有 `name`，它只是品牌内容，可以写中文，例如：

```json
{
  "name": "主站",
  "logoUrl": "https://cdn.example.com/brand/logo.webp",
  "theme": { "primaryColor": "#409eff" }
}
```

公开接口返回上面这份 JSON 的原文语义，不补入、删除或改写字段。

## 解析规则

```http
GET /v1/white-label-configs?domain=d.dev.xrugc.com
```

候选顺序：

```text
d.dev.xrugc.com -> dev.xrugc.com -> xrugc.com -> {}
```

- 完整域名优先，然后逐级父域；
- 第一条存在但被插件停用的记录返回 `{}`，不越过它套用父域；
- 所有候选不存在时返回 `{}`；
- JSON 内任何字段（包括 `is_active`）都只是内容，不参与插件启停判断；
- 不使用 `default` 键兜底。

## 边界与权限

- root：查看、创建、编辑、启停，并读取主前端只读键目录；
- admin：只查看列表和完整 JSON；
- 公开 resolver：无需登录，只接收一个 `domain`；
- 插件不接收组织、loginKey、assignment 或数据库 ID；
- 管理鉴权只通过主后端 `/v1/plugin/verify-token`；
- 公开解析直接读取插件自己的 MySQL，不经过主前端、主后端或 `yii3-a1`；
- 登录二维码仍为 `web_<loginKey>`，登录上下文属于其他系统。

## 本地开发

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

详细说明：

- [架构与权限](docs/architecture.md)
- [REST API 契约](docs/api.md)
- [部署说明](docs/deployment.md)
- [登录上下文与 Unity 接入](docs/login-context-integration.md)

## 分支与部署

- `develop`：开发集成；
- `main`：稳定代码；
- `publish`：生产发布并更新 `publish/latest` 镜像。

生产使用 `deploy/production.yml` 在 `port.7dgame.com` 的独立 Portainer stack 中运行。
插件不复用主业务数据库、Redis、数据卷或数据库账号。
