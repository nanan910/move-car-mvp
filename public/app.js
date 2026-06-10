const params = new URLSearchParams(location.search);
const page = document.body.dataset.page;
const CONFIG_PARAM = "d";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function show(el, html, error = false) {
  if (!el) return;
  el.classList.remove("hidden", "error");
  if (error) el.classList.add("error");
  el.innerHTML = html;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizePlate(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function maskPlate(value) {
  const plate = normalizePlate(value);
  if (plate.length <= 3) return "***";
  return `${plate.slice(0, 2)}***${plate.slice(-2)}`;
}

function validatePlate(value) {
  const plate = normalizePlate(value);
  if (!/^[\u4e00-\u9fa5A-Z0-9]{5,10}$/.test(plate)) {
    throw new Error("请输入有效车牌号。");
  }
  return plate;
}

function validatePhone(value, required = false) {
  const phone = String(value || "").trim().replace(/[\s-]/g, "");
  if (!phone && !required) return "";
  if (!/^\+?\d{7,20}$/.test(phone)) {
    throw new Error("请输入有效手机号。");
  }
  return phone;
}

function validateImageFile(file) {
  if (!file) throw new Error("请先选择车牌照片。");
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("请上传图片文件。");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("图片不能超过 4MB。");
  }
  return file;
}

function moveUrlFromPayload(payload) {
  const url = new URL("./move.html", location.href);
  url.searchParams.set(CONFIG_PARAM, encodePayload(payload));
  return url.toString();
}

function qrImageUrl(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(text)}`;
}

function encodePayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodePayload(text) {
  const base64 = String(text || "").replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const input = document.createElement("textarea");
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
  return Promise.resolve();
}

function buildPayload(form) {
  const plateNumber = validatePlate(form.plateNumber.value);
  const ownerPhone = validatePhone(form.ownerPhone.value, false);
  const smsTextRaw = form.smsText.value.trim();
  const smsText = smsTextRaw || `您好，您的车辆 ${maskPlate(plateNumber)} 可能影响通行，请尽快挪车，谢谢。`;
  const note = form.note.value.trim();
  const wechatId = form.wechatId.value.trim();
  const customLink = form.customLink.value.trim();
  return {
    version: 1,
    plateNumber,
    maskedPlate: maskPlate(plateNumber),
    ownerPhone,
    smsText,
    note,
    wechatId,
    customLink,
    createdAt: new Date().toISOString(),
  };
}

function renderContactSummary(payload) {
  const lines = [
    `<strong>${escapeHtml(payload.maskedPlate)}</strong>`,
    payload.ownerPhone ? `手机号：${escapeHtml(payload.ownerPhone.replace(/^(\+?\d{3})\d+(\d{2})$/, "$1****$2"))}` : "手机号：未填写",
    payload.wechatId ? `微信号：${escapeHtml(payload.wechatId)}` : "微信号：未填写",
    payload.note ? `备注：${escapeHtml(payload.note)}` : "备注：无",
  ];
  return lines.join("<br>");
}

function setupBindPage() {
  const ocrForm = document.querySelector("#ocrForm");
  const bindForm = document.querySelector("#bindForm");
  const ocrResult = document.querySelector("#ocrResult");
  const bindResult = document.querySelector("#bindResult");
  const plateInput = document.querySelector("#plateNumber");
  const imageInput = document.querySelector("#plateImage");
  let previewUrl = "";

  imageInput?.addEventListener("change", () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    const file = imageInput.files?.[0];
    if (!file) {
      ocrResult?.classList.add("hidden");
      return;
    }
    try {
      validateImageFile(file);
      previewUrl = URL.createObjectURL(file);
      show(
        ocrResult,
        `<img class="plate-preview" src="${previewUrl}" alt="车牌照片预览">
         <div class="muted">静态版不会上传原图，只做本地预览。请手动确认车牌。</div>`
      );
    } catch (error) {
      show(ocrResult, escapeHtml(error.message), true);
    }
  });

  ocrForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const file = imageInput.files?.[0];
    try {
      validateImageFile(file);
      show(
        ocrResult,
        `<img class="plate-preview" src="${previewUrl}" alt="车牌照片预览">
         <div>静态免费版不接入在线 OCR，请手动填写或确认车牌号后继续。</div>`
      );
      plateInput.focus();
    } catch (error) {
      show(ocrResult, escapeHtml(error.message), true);
    }
  });

  bindForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    show(bindResult, "正在生成二维码...");
    try {
      const payload = buildPayload(form);
      if (!payload.ownerPhone && !payload.wechatId && !payload.customLink) {
        throw new Error("请至少填写一种联系车主的方式。");
      }
      const moveUrl = moveUrlFromPayload(payload);
      const qrUrl = qrImageUrl(moveUrl);
      const downloadName = `${payload.maskedPlate}-move-car.txt`;
      show(
        bindResult,
        `<div class="qr">
          <strong>生成成功</strong>
          <div class="move-card">
            <p class="move-card-kicker">扫码联系车主</p>
            <img src="${qrUrl}" alt="挪车二维码">
            <strong>${escapeHtml(payload.maskedPlate)}</strong>
            <span>扫码后可拨号、发短信或复制提醒文案</span>
            <small>完全免费 · 纯静态页面 · 无需后端</small>
          </div>
          <span>访客链接：<a href="${moveUrl}">${escapeHtml(moveUrl)}</a></span>
          <span>联系摘要：${renderContactSummary(payload)}</span>
          <div class="actions actions-single">
            <button type="button" id="copyMoveUrlButton">复制链接</button>
            <button type="button" onclick="window.print()">打印挪车卡片</button>
          </div>
          <details class="payload-box">
            <summary>查看本地配置备份</summary>
            <pre class="command">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
            <a download="${downloadName}" href="data:text/plain;charset=utf-8,${encodeURIComponent(
              JSON.stringify(payload, null, 2)
            )}">下载备份</a>
          </details>
        </div>`
      );
      document.querySelector("#copyMoveUrlButton")?.addEventListener("click", async () => {
        await copyText(moveUrl);
        show(bindResult, `${bindResult.innerHTML}<div class="form-note">链接已复制。</div>`);
      });
    } catch (error) {
      show(bindResult, escapeHtml(error.message), true);
    }
  });
}

function setupMovePage() {
  const encoded = params.get(CONFIG_PARAM) || "";
  const vehicle = document.querySelector("#publicVehicle");
  const result = document.querySelector("#contactResult");
  const callButton = document.querySelector("#callButton");
  const smsButton = document.querySelector("#smsButton");
  const copyButton = document.querySelector("#copyButton");
  const wechatButton = document.querySelector("#wechatButton");
  const linkButton = document.querySelector("#customLinkButton");

  let payload;
  try {
    if (!encoded) throw new Error("二维码内容缺失。请重新生成挪车二维码。");
    payload = decodePayload(encoded);
    if (!payload?.maskedPlate) throw new Error("二维码内容无效。");
  } catch (error) {
    show(vehicle, escapeHtml(error.message), true);
    [callButton, smsButton, copyButton, wechatButton, linkButton].forEach((button) => {
      if (button) button.disabled = true;
    });
    return;
  }

  show(
    vehicle,
    `<strong>${escapeHtml(payload.maskedPlate)}</strong><br>
     当前为静态免费版，不经过服务端。你可以直接联系车主或复制提醒文案。${payload.note ? `<br>备注：${escapeHtml(payload.note)}` : ""}`
  );

  callButton.disabled = !payload.ownerPhone;
  smsButton.disabled = !payload.ownerPhone;
  wechatButton.disabled = !payload.wechatId;
  linkButton.disabled = !payload.customLink;

  callButton?.addEventListener("click", () => {
    location.href = `tel:${payload.ownerPhone}`;
  });

  smsButton?.addEventListener("click", () => {
    const separator = /iphone|ipad|ipod/i.test(navigator.userAgent) ? "&" : "?";
    location.href = `sms:${payload.ownerPhone}${separator}body=${encodeURIComponent(payload.smsText)}`;
  });

  copyButton?.addEventListener("click", async () => {
    await copyText(payload.smsText);
    show(result, "提醒文案已复制，你可以粘贴到短信、微信或电话说明里。");
  });

  wechatButton?.addEventListener("click", async () => {
    await copyText(payload.wechatId);
    show(result, `车主微信号已复制：${escapeHtml(payload.wechatId)}。请在微信里搜索后联系。`);
  });

  linkButton?.addEventListener("click", () => {
    window.open(payload.customLink, "_blank", "noopener");
  });
}

function setupOwnerPage() {
  const status = document.querySelector("#ownerStatus");
  show(
    status,
    "静态免费版不再提供服务端车主管理页。请回到首页重新生成二维码，或使用下载的本地配置备份重新编辑。"
  );
}

function setupSetupPage() {
  const status = document.querySelector("#setupStatus");
  const health = document.querySelector("#healthResult");
  show(
    status,
    "当前是完全免费静态版。无需数据库或云函数，只要能访问静态站点就可以使用。"
  );
  document.querySelector("#setupCheckForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    show(
      health,
      "静态版检查项：1) 首页能打开；2) 能生成二维码；3) 扫码后 move.html 能拨号/发短信/复制文案。"
    );
  });
}

function setupDemoPage() {
  const flow = document.querySelector("#demoFlow");
  const replay = document.querySelector("#replayDemoButton");
  if (!flow || !replay) return;
  const play = () => {
    flow.classList.remove("is-playing");
    void flow.offsetWidth;
    flow.classList.add("is-playing");
  };
  replay.addEventListener("click", play);
  play();
}

if (page === "bind") setupBindPage();
if (page === "move") setupMovePage();
if (page === "owner") setupOwnerPage();
if (page === "setup") setupSetupPage();
if (page === "demo") setupDemoPage();
