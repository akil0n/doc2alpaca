# 登录与安全部署

## 上线判定

当前版本可在一台具有持久磁盘的 Linux 云服务器上以 `next start` 方式运行，但不是“克隆后零配置启动”的版本。正式开放前必须完成 PostgreSQL、生产 Secret、至少一种登录方式、HTTPS 反向代理、数据库迁移和备份配置。

当前上传暂存使用本机 `.tmp`。因此，多实例、无状态容器或 Serverless 部署在接入共享对象存储和恶意文件扫描前不满足生产要求；单实例部署也必须确保应用目录不通过 Web 服务器直接暴露。

## 必需基础设施

1. 创建 PostgreSQL 数据库，并设置仅服务端可见的 `DATABASE_URL`。
2. 复制 `.env.example` 为部署平台的 Secret 配置。不要把生产 Secret 提交到 Git。
3. 生成两个独立随机值：

   ```bash
   openssl rand -base64 32
   openssl rand -base64 32
   ```

   分别用于 `AUTH_SECRET` 和 `DATA_ENCRYPTION_KEY`。`DATA_ENCRYPTION_KEY` 必须解码为恰好 32 字节。两个值都必须在不同部署之间保持稳定并安全备份：前者参与会话签名和 OAuth 账号标识保护，后者用于加密用户密钥、手机号和生成历史。
4. 部署前执行：

   ```bash
   npx prisma migrate deploy
   ```

## 登录服务商

未配置凭据的登录按钮会自动隐藏。

| 登录方式 | 回调地址 | 必需配置 |
| --- | --- | --- |
| GitHub | `https://你的域名/api/auth/callback/github` | `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` |
| 微信开放平台网站应用 | `https://你的域名/api/auth/callback/wechat` | `AUTH_WECHAT_ID`, `AUTH_WECHAT_SECRET` |
| QQ 互联 | `https://你的域名/api/auth/callback/qq` | `AUTH_QQ_ID`, `AUTH_QQ_SECRET` |
| 中国大陆手机号 | 无 OAuth 回调 | `TENCENTCLOUD_*`, `TENCENT_SMS_*` |

腾讯云短信模板应有两个参数：验证码和有效分钟数。验证码 5 分钟失效、最多尝试 5 次；同一手机号 60 秒内不能重复请求，并通过数据库原子计数器按手机号及来源 IP 做小时级限制。来源 IP 仅在 Vercel 或 Cloudflare Pages 注入的可信请求头上启用；其他部署会保守地共享一个来源桶。

## 数据保护边界

- LLM API Key、LLM 配置、手机号和生成历史使用 AES-256-GCM 加密，并用用户及记录 ID 作为附加认证数据；数据库篡改会导致解密失败。
- OAuth providerAccountId 在入库前使用带服务端 Secret 的 HMAC 做不可逆化；OAuth access token、refresh token、昵称、头像和邮箱不入库。
- 浏览器永远不会收到已保存的完整 API Key。分析时仅在服务端进程内短暂解密。
- 上传文件使用随机 `uploadId`，并绑定当前登录用户。文本提取完成即删除原文件；异常、断开和超时路径也会清理。
- 历史由服务端分析流程创建，只白名单保留 `instruction`、`input`、`output`，不保存原始文件、文件名、原文证据或提取全文；每个用户最多 50 条，每条最多 5 MiB。
- 服务端仍会把待分析文本发送给用户所选 LLM 服务商。第三方是否保留内容取决于对应服务商协议，隐私说明必须明确披露。

## 运维要求

- 只通过 HTTPS 提供服务，并保留项目已配置的 HSTS、CSP 和安全响应头。
- 数据库使用 TLS、最小权限账户、加密备份和访问审计。
- `DATA_ENCRYPTION_KEY` 不可丢失，否则已有密钥和历史无法恢复。轮换前需实现离线重加密流程，不要直接替换。
- 每个账户默认每天最多 200 次实际 LLM 调用；每次调用前会原子预留保守 token 预算，确保当日累计预算不超过 100 万，并在响应后按实际用量回冲；上传和分析请求另有小时级限制。可按业务成本调整 `lib/llmQuota.ts`。
- 生产环境应使用共享对象存储替代本地 `.tmp`，并配置恶意文件扫描。当前上传仍适合单实例或有持久磁盘的部署。
- 不记录请求体、完整手机号、OAuth 响应、API Key 或生成结果；监控平台也应配置字段脱敏。
- 定期运行 `npm audit --omit=dev`，并及时升级安全补丁。

## 单机云服务器发布流程

1. 在 GitHub 合并已验证的发布 PR，并为 `main` 开启分支保护、Secret scanning 和 Push protection。`.env.example` 只能包含空值或示例值，任何真实 Secret 都不得进入 Git 历史。
2. 在服务器创建专用的非登录用户和目录，例如 `/opt/doc2alpaca`。仅从受保护的 `main` 或固定提交 SHA 部署：

   ```bash
   git clone --branch main --single-branch https://github.com/akil0n/doc2alpaca.git /opt/doc2alpaca
   cd /opt/doc2alpaca
   npm ci
   npm run build
   npx prisma migrate deploy
   ```

3. 不要在 Git 仓库目录中保存生产 `.env`。把生产变量放在云平台 Secret Manager，或放在 `/etc/doc2alpaca/doc2alpaca.env`，设置为 `root:doc2alpaca` 和 `0640`。`DATABASE_URL` 应启用数据库 TLS；数据库账号只授予本应用所需 schema 的权限。
4. 用 systemd、容器编排器或等价进程管理器注入 Secret 并运行 `npm start -- --hostname 127.0.0.1 --port 3000`。应用端口只绑定环回地址，外部仅开放反向代理的 80/443；SSH 仅允许密钥登录并限制来源。
5. 在 Next.js 前放置 Nginx、Caddy 或云负载均衡器，配置可信域名、TLS、请求体上限、超时和边缘限流。不要让客户端绕过反向代理直接访问 3000 端口。
6. 配置加密数据库备份、Secret 备份、磁盘容量告警和日志脱敏。发布后验证登录、上传、分析、历史隔离、原文删除和限流；随后从服务器确认 `.tmp` 中没有残留原文。

更新版本时先备份数据库，拉取固定提交，执行 `npm ci`、`npm run build` 和 `npx prisma migrate deploy`，再原子重启服务。不要在生产环境执行 `prisma migrate dev` 或 `prisma db push`。

若用户可以填写自定义 LLM 地址，只通过 `LLM_ALLOWED_HOSTS` 加入经过审核的额外 HTTPS 主机名。不要加入通配域名、用户可控制域名、IP 地址、私有地址、环回地址或链路本地地址；生产环境不要启用本地端点例外。
