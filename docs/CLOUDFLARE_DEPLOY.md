# Cloudflare Worker 真实后端部署

GitHub Pages 已经可以运行浏览器 demo。要启用真实扫码通知，需要完成 Cloudflare Worker、D1、腾讯云和通知密钥配置。

## 1. 准备 Cloudflare

需要在 Cloudflare 中准备：

- Account ID
- API Token，至少允许编辑 Workers Scripts 和 D1
- D1 数据库 `move-car-db`

创建 D1 后，把 `database_id` 填入 `worker/wrangler.toml`。

## 2. 配置 GitHub Actions secrets

可以运行：

```powershell
.\scripts\configure-cloudflare.ps1
```

脚本会提示输入：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- D1 `database_id`
- Worker API URL

它会：

- 写入 GitHub Actions secrets
- 更新 `worker/wrangler.toml`
- 更新 `public/config.js`，关闭 demo 模式并指向真实 Worker

## 3. 配置 Worker 运行时 secrets

Worker 业务密钥不要写进仓库。安装 npm/wrangler 后，可以运行交互脚本：

```powershell
npm install
.\scripts\set-worker-secrets.ps1
```

脚本会自动生成 `DATA_ENCRYPTION_KEY` 和 `IP_HASH_SALT`，并提示输入腾讯云/短信/隐私号配置。也可以手动运行：

如果已经配置过 D1、加密密钥和 IP 哈希盐，只缺车牌 OCR，可只运行：

```powershell
.\scripts\set-ocr-secrets.ps1 -Deploy
```

如果暂时没有腾讯云密钥，但需要演示完整绑定流程，可以临时开启服务端 OCR 演示模式：

```powershell
"true" | npx wrangler secret put OCR_DEMO_MODE --config worker/wrangler.toml
npx wrangler deploy --config worker/wrangler.toml
```

配置真实腾讯云 OCR 密钥后，Worker 会自动优先使用腾讯云 OCR；正式上线仍建议删除或改回 `OCR_DEMO_MODE`，避免运维判断混淆。

```powershell
npm install
npx wrangler secret put DATA_ENCRYPTION_KEY --config worker/wrangler.toml
npx wrangler secret put TENCENT_SECRET_ID --config worker/wrangler.toml
npx wrangler secret put TENCENT_SECRET_KEY --config worker/wrangler.toml
npx wrangler secret put TENCENT_SMS_APP_ID --config worker/wrangler.toml
npx wrangler secret put TENCENT_SMS_SIGN_NAME --config worker/wrangler.toml
npx wrangler secret put TENCENT_SMS_TEMPLATE_ID --config worker/wrangler.toml
npx wrangler secret put PRIVACY_CALL_WEBHOOK_URL --config worker/wrangler.toml
```

可选：

```powershell
npx wrangler secret put PRIVACY_CALL_WEBHOOK_TOKEN --config worker/wrangler.toml
npx wrangler secret put IP_HASH_SALT --config worker/wrangler.toml
```

## 4. 部署验证

Cloudflare 配好后：

1. 触发 GitHub Actions 的 `Deploy Cloudflare Worker`
2. 打开 `https://nanan910.github.io/move-car-mvp/setup.html`
3. 检查 Worker `/api/health`
4. 确认 `D1`、`加密密钥`、`腾讯云 OCR` 等状态

健康检查只返回布尔状态和缺失配置名，不返回任何密钥。正常生产状态应看到：

- `status: ok`
- `missing: []`
- `d1: true`
- `encryption: true`
- `tencentOcr: true`

如果 `status: degraded`，按 `missing` 列表继续补 Cloudflare binding 或 Worker secrets。

也可以在本地执行生产检查脚本：

```powershell
.\scripts\check-production.ps1
```

它会检查 GitHub Pages 配置、Worker secrets、D1 migration，并尝试访问 `/api/health`。
