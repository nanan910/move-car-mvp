# 扫码挪车 MVP

一个可演示的匿名扫码挪车项目：车主上传车牌照片完成识别绑定，系统生成车辆专属二维码；访客扫码后一键通知车主，但不会看到车主手机号、微信、ShowDoc token 或完整绑定资料。

## 在线演示

- GitHub Pages：[https://nanan910.github.io/move-car-mvp/](https://nanan910.github.io/move-car-mvp/)
- 部署检查页：[https://nanan910.github.io/move-car-mvp/setup.html](https://nanan910.github.io/move-car-mvp/setup.html)
- 隐私说明页：[https://nanan910.github.io/move-car-mvp/privacy.html](https://nanan910.github.io/move-car-mvp/privacy.html)
- 当前线上版本已指向 Cloudflare Worker：`https://move-car-api.nanan910-move-car.workers.dev`。
- D1、Worker、加密密钥和 IP 哈希盐已配置；腾讯云 OCR 需要设置 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` 后才会从 `degraded` 变为 `ok`。

## 当前状态

- 已部署到 GitHub 仓库和 GitHub Pages。
- 已实现 Cloudflare Worker API、D1 migration、隐私字段加密、访客限流和 `/api/health`。
- 已提供 GitHub Actions workflow：Pages 可自动发布；Worker workflow 待 Cloudflare secrets 配置后启用。
- 已通过 `preflight.ps1`、Mock MVP 验收和 Worker 隐私/限流验收。
- 隐私与安全说明见 [docs/PRIVACY_AND_SECURITY.md](docs/PRIVACY_AND_SECURITY.md)。
- Worker API 契约见 [docs/API.md](docs/API.md)。

## 功能

- 车主绑定页：上传车牌照片，服务端调用腾讯云车牌 OCR，确认车牌后创建绑定。
- 挪车卡片：绑定成功后生成可打印二维码卡片，适合放在车内。
- 车主管理页：通过 `ownerToken` 管理密钥链接更新通知配置、重新生成访客二维码、查看最近通知状态。
- 访客挪车页：通过 `vehicleToken` 二维码打开，只显示脱敏车牌、一键通知按钮和可用通知通道。
- 部署检查页：打开 `setup.html` 查看 demo 模式、Worker 地址和 `/api/health` 状态。
- 通知通道：企业微信群机器人 webhook、ShowDoc webhook、腾讯云短信、隐私号呼叫适配器。
- 隐私保护：敏感信息只保存在 Cloudflare Worker/D1，手机号和 ShowDoc token 加密保存。

## 项目结构

```text
public/                 GitHub Pages 静态前端
worker/src/index.js      Cloudflare Worker API
worker/migrations/       Cloudflare D1 数据库迁移
worker/wrangler.toml     Worker 部署配置
.github/workflows/       GitHub Pages 自动部署
scripts/                 本地辅助脚本
```

## 本地预览前端

当前项目的前端无构建步骤，装好 Node.js 后可直接运行：

```bash
npm run serve:public
```

然后打开 `http://localhost:4173`。页面中的 API 地址填写已部署的 Cloudflare Worker 地址。

线上 GitHub Pages 默认指向真实 Cloudflare Worker：`public/config.js` 中 `MOVE_CAR_DEMO_MODE = false`。如果需要临时回到浏览器内 demo 模式，可以把 API 地址置空并改为 `MOVE_CAR_DEMO_MODE = true`。demo 数据只保存在当前浏览器的 `localStorage`，不会真正发送 ShowDoc/短信/隐私号通知。

接入其他 Worker 后，把 `public/config.js` 改为：

```js
window.MOVE_CAR_API_BASE = "https://move-car-api.your-subdomain.workers.dev";
window.MOVE_CAR_DEMO_MODE = false;
```

如果还没有 Cloudflare、腾讯云或 ShowDoc 配置，可以先用内置 Mock 服务完整演示：

```bash
npm run serve:mock
```

然后打开 `http://localhost:8787`。Mock 服务会同时托管静态前端和模拟 API，可以跑通 OCR、绑定、访客通知、限流和车主管理流程。

也可以运行自动化 MVP 验收：

```bash
npm run preflight
npm run verify:mvp
npm run verify:worker
```

`verify:mvp` 会验证 Mock API 的端到端流程；`verify:worker` 会直接调用真实 Worker `fetch()`，用假 D1 和假 ShowDoc 验证公开接口不会泄露手机号、ShowDoc token 或 webhook，并检查重复通知会被限流。

Windows PowerShell 也可以直接运行：

```powershell
.\scripts\preflight.ps1
```

## Cloudflare 部署

详细步骤见 [docs/CLOUDFLARE_DEPLOY.md](docs/CLOUDFLARE_DEPLOY.md)。

Worker 运行时密钥可用交互脚本配置：

```powershell
.\scripts\set-worker-secrets.ps1
```

如果只需要补腾讯云车牌 OCR 密钥，可运行更短的脚本：

```powershell
.\scripts\set-ocr-secrets.ps1 -Deploy
```

没有腾讯云 OCR 密钥时，也可以临时开启服务端 OCR 演示模式完成绑定流程演示：

```powershell
"true" | npx wrangler secret put OCR_DEMO_MODE --config worker/wrangler.toml
npx wrangler deploy --config worker/wrangler.toml
```

正式上线前请删除或改回该 secret，并配置真实 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`。

生产部署后可运行：

```powershell
.\scripts\check-production.ps1
```

1. 安装依赖：

```bash
npm install
```

2. 登录 Cloudflare：

```bash
npx wrangler login
```

3. 创建 D1 数据库：

```bash
npx wrangler d1 create move-car-db
```

把输出的 `database_id` 填入 `worker/wrangler.toml`。

4. 执行 D1 migration：

```bash
npx wrangler d1 migrations apply move-car-db --config worker/wrangler.toml --remote
```

5. 设置 Worker secret：

```bash
npx wrangler secret put DATA_ENCRYPTION_KEY --config worker/wrangler.toml
npx wrangler secret put TENCENT_SECRET_ID --config worker/wrangler.toml
npx wrangler secret put TENCENT_SECRET_KEY --config worker/wrangler.toml
```

可选变量：

```bash
npx wrangler secret put TENCENT_SMS_APP_ID --config worker/wrangler.toml
npx wrangler secret put TENCENT_SMS_SIGN_NAME --config worker/wrangler.toml
npx wrangler secret put TENCENT_SMS_TEMPLATE_ID --config worker/wrangler.toml
npx wrangler secret put PRIVACY_CALL_WEBHOOK_URL --config worker/wrangler.toml
npx wrangler secret put PRIVACY_CALL_WEBHOOK_TOKEN --config worker/wrangler.toml
```

6. 部署 Worker：

```bash
npx wrangler deploy --config worker/wrangler.toml
```

本地调试 Worker 时可以复制 `.dev.vars.example` 为 `.dev.vars`，再填入真实密钥。`.dev.vars` 已被 `.gitignore` 忽略，不要提交。

## GitHub Pages 部署

1. 将项目推送到 GitHub 仓库的 `main` 分支。
2. 在仓库 Settings -> Pages 中选择 GitHub Actions。
3. `.github/workflows/pages.yml` 会把 `public/` 发布为静态站点。
4. 打开前端后，在 API 地址中填写 Cloudflare Worker 的 URL。

如果希望访客扫码页无需任何输入即可调用 API，请在部署前把 `public/config.js` 改成你的 Worker 地址：

```js
window.MOVE_CAR_API_BASE = "https://move-car-api.your-subdomain.workers.dev";
```

## GitHub Actions 自动部署

仓库包含两个 workflow：

- `.github/workflows/pages.yml`：发布 `public/` 到 GitHub Pages。
- `.github/workflows/worker.yml`：对 `worker/**` 变更执行 D1 migration 并部署 Cloudflare Worker。

Worker 自动部署需要在 GitHub 仓库 Settings -> Secrets and variables -> Actions 中添加：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | 具备 Workers Scripts、D1 编辑权限的 Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Cloudflare Account ID |

Cloudflare Worker 运行时业务密钥仍通过 Wrangler secret 设置，不建议放进 GitHub Pages 前端或普通仓库文件。

也可以运行配置脚本写入 GitHub Actions secrets 并更新公开配置：

```powershell
.\scripts\configure-cloudflare.ps1
```

## 推送到 GitHub

如果本机已经安装 Git 并登录 GitHub CLI，可执行：

```bash
git init
git add .
git commit -m "Initial move car MVP"
gh repo create move-car-mvp --public --source=. --remote=origin --push
```

或使用仓库内的 PowerShell 脚本：

```powershell
.\scripts\publish-github.ps1 -RepoName move-car-mvp -Visibility public
```

如果不用 GitHub CLI，也可以先在 GitHub 网页创建空仓库，再执行：

```bash
git remote add origin https://github.com/<你的用户名>/move-car-mvp.git
git branch -M main
git push -u origin main
```

## 环境变量

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `DATA_ENCRYPTION_KEY` | 是 | 用于 AES-GCM 加密手机号和 ShowDoc token |
| `TENCENT_SECRET_ID` | OCR 必填 | 腾讯云 SecretId |
| `TENCENT_SECRET_KEY` | OCR 必填 | 腾讯云 SecretKey |
| `TENCENT_OCR_REGION` | 否 | 默认 `ap-guangzhou` |
| `MAX_OCR_IMAGE_BYTES` | 否 | 车牌 OCR 上传图片大小上限，默认 `4194304` |
| `TENCENT_SMS_APP_ID` | 短信必填 | 腾讯云短信应用 ID |
| `TENCENT_SMS_SIGN_NAME` | 短信必填 | 腾讯云短信签名 |
| `TENCENT_SMS_TEMPLATE_ID` | 短信必填 | 腾讯云短信模板 ID |
| `PRIVACY_CALL_WEBHOOK_URL` | 隐私号必填 | 隐私号呼叫适配器地址 |
| `PRIVACY_CALL_WEBHOOK_TOKEN` | 否 | 调用隐私号适配器的 Bearer token |
| `CORS_ORIGIN` | 否 | GitHub Pages 域名，默认 `*` |
| `IP_HASH_SALT` | 否 | 访客 IP 哈希盐 |

## ShowDoc 通知

ShowDoc 通知按“服务端 POST 到用户提供的 webhook/API 地址”实现，请在车主绑定页填写 webhook 和可选 token。Worker 会发送如下 JSON：

```json
{
  "title": "扫码挪车提醒",
  "content": "车辆 粤B***45 收到挪车提醒，请及时处理。",
  "token": "optional-token"
}
```

如果你的 ShowDoc 接口字段不同，只需要调整 `worker/src/index.js` 中的 `sendShowDoc`。

## 微信通知

第一版用企业微信群机器人 Webhook 作为微信生态通知通道。车主在绑定页或管理页填写企业微信群机器人地址后，访客页会出现“微信通知”按钮。Webhook 会加密保存在 D1，访客接口只返回 `wechat_work` 这个可用通道名，不会返回机器人地址或 key。

## 隐私号呼叫

腾讯云号码保护/隐私号的接入参数会随产品形态变化。MVP 中 `privacy_call` 会把解密后的手机号仅从服务端发送到 `PRIVACY_CALL_WEBHOOK_URL`，建议这个地址由你自己的腾讯云函数或云托管服务实现，再去调用实际隐私号 API。访客端不会收到手机号。

## 验收清单

- `npm run check` 通过语法检查。
- GitHub Pages 能打开三个前端页面。
- `setup.html` 能检查 Worker `/api/health`，且健康接口只返回配置布尔值，不泄露密钥。
- Worker 的 `/api/ocr/plate` 能返回车牌识别候选。
- 创建绑定后得到 `vehicleToken` 和 `ownerToken`。
- 访客页接口只返回脱敏车牌和可用通知通道。
- 访客页“一键通知车主”会优先使用企业微信，其次 ShowDoc、短信、隐私号。
- 连续触发通知会返回限流提示。
- D1 `notification_logs` 能记录通知状态。
