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

Worker 业务密钥不要写进仓库。安装 npm/wrangler 后运行：

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

健康检查只返回布尔状态，不返回任何密钥。
