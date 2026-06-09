const params = new URLSearchParams(location.search);
const page = document.body.dataset.page;

const DEFAULT_API_BASE = localStorage.getItem("moveCarApiBase") || window.MOVE_CAR_API_BASE || "";
const DEMO_MODE = Boolean(window.MOVE_CAR_DEMO_MODE);
const DEMO_STORAGE_KEY = "moveCarDemoState";

function apiBase() {
  const input = document.querySelector("#apiBase");
  const value = (input?.value || DEFAULT_API_BASE).trim().replace(/\/$/, "");
  if (value) localStorage.setItem("moveCarApiBase", value);
  return value;
}

function setApiInput() {
  const input = document.querySelector("#apiBase");
  if (input && DEFAULT_API_BASE) input.value = DEFAULT_API_BASE;
}

function show(el, html, error = false) {
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

async function request(path, options = {}) {
  const base = apiBase();
  if (!base && DEMO_MODE) return demoRequest(path, options);
  if (!base) throw new Error("请先填写 Cloudflare Worker API 地址。");
  const res = await fetch(`${base}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `请求失败：${res.status}`);
  return data;
}

async function demoRequest(path, options = {}) {
  await new Promise((resolve) => setTimeout(resolve, 180));
  const method = options.method || "GET";
  const state = loadDemoState();

  if (method === "POST" && path === "/api/ocr/plate") {
    return {
      plateNumber: "粤B12345",
      candidates: [{ plateNumber: "粤B12345", color: "blue" }],
      demo: true,
    };
  }

  if (method === "POST" && path === "/api/vehicles") {
    const input = JSON.parse(options.body || "{}");
    if (!input.plateNumber) throw new Error("请确认车牌号。");
    if (!input.showdocWebhook) throw new Error("请填写 ShowDoc Webhook。");
    const vehicleToken = demoToken("veh");
    const ownerToken = demoToken("own");
    state.vehicles.push({
      vehicleToken,
      ownerToken,
      maskedPlate: maskPlate(input.plateNumber),
      showdocEnabled: Boolean(input.showdocWebhook),
      smsEnabled: Boolean(input.smsEnabled && input.ownerPhone),
      privacyCallEnabled: Boolean(input.privacyCallEnabled && input.ownerPhone),
      createdAt: new Date().toISOString(),
    });
    saveDemoState(state);
    return { vehicleToken, ownerToken, maskedPlate: maskPlate(input.plateNumber), demo: true };
  }

  let match = path.match(/^\/api\/vehicles\/([^/]+)\/public$/);
  if (method === "GET" && match) {
    const vehicle = findDemoVehicle(state, match[1], "vehicleToken");
    if (!vehicle) throw new Error("车辆不存在。演示模式数据只保存在当前浏览器。");
    return { maskedPlate: vehicle.maskedPlate, availableChannels: demoChannels(vehicle), demo: true };
  }

  match = path.match(/^\/api\/vehicles\/([^/]+)\/notify$/);
  if (method === "POST" && match) {
    const vehicle = findDemoVehicle(state, match[1], "vehicleToken");
    if (!vehicle) throw new Error("车辆不存在。");
    const input = JSON.parse(options.body || "{}");
    const channel = input.channel || "showdoc";
    if (!demoChannels(vehicle).includes(channel)) throw new Error("该通知方式尚未配置。");
    const recent = state.logs.find(
      (log) => log.vehicleToken === vehicle.vehicleToken && Date.now() - log.time < 120000
    );
    if (recent) throw new Error("已提醒车主，请勿频繁操作。");
    state.logs.push({
      vehicleToken: vehicle.vehicleToken,
      channel,
      status: "sent",
      time: Date.now(),
    });
    saveDemoState(state);
    return { message: `演示模式：已模拟发送 ${channel} 通知。`, demo: true };
  }

  match = path.match(/^\/api\/owner\/([^/]+)\/vehicle$/);
  if (match) {
    const vehicle = findDemoVehicle(state, match[1], "ownerToken");
    if (!vehicle) throw new Error("管理链接无效。");
    if (method === "GET") {
      return {
        vehicleToken: vehicle.vehicleToken,
        maskedPlate: vehicle.maskedPlate,
        showdocEnabled: vehicle.showdocEnabled,
        smsEnabled: vehicle.smsEnabled,
        privacyCallEnabled: vehicle.privacyCallEnabled,
        recentNotifications: state.logs
          .filter((log) => log.vehicleToken === vehicle.vehicleToken)
          .map((log) => ({ channel: log.channel, status: log.status, created_at: new Date(log.time).toISOString() })),
        demo: true,
      };
    }
    if (method === "PATCH") {
      const input = JSON.parse(options.body || "{}");
      if (input.showdocWebhook) vehicle.showdocEnabled = true;
      if (typeof input.smsEnabled === "boolean") vehicle.smsEnabled = input.smsEnabled;
      if (typeof input.privacyCallEnabled === "boolean") vehicle.privacyCallEnabled = input.privacyCallEnabled;
      saveDemoState(state);
      return { message: "演示模式：配置已更新。", demo: true };
    }
  }

  throw new Error("演示模式暂不支持该接口。");
}

function loadDemoState() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)) || { vehicles: [], logs: [] };
  } catch {
    return { vehicles: [], logs: [] };
  }
}

function saveDemoState(state) {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
}

function findDemoVehicle(state, token, key) {
  return state.vehicles.find((vehicle) => vehicle[key] === decodeURIComponent(token));
}

function demoChannels(vehicle) {
  return [
    vehicle.showdocEnabled ? "showdoc" : "",
    vehicle.smsEnabled ? "sms" : "",
    vehicle.privacyCallEnabled ? "privacy_call" : "",
  ].filter(Boolean);
}

function demoToken(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}_${btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}

function maskPlate(value) {
  const plate = String(value || "").trim().replace(/\s+/g, "").toUpperCase();
  if (plate.length <= 3) return "***";
  return `${plate.slice(0, 2)}***${plate.slice(-2)}`;
}

function boolValue(form, name) {
  const value = new FormData(form).get(name);
  if (value === "") return undefined;
  return value === "true";
}

function validatePlateNumber(value) {
  const plate = String(value || "").trim().replace(/\s+/g, "").toUpperCase();
  if (!/^[\u4e00-\u9fa5A-Z0-9]{5,10}$/.test(plate)) {
    throw new Error("请填写有效车牌号，长度建议 5-10 位。");
  }
  return plate;
}

function validateHttpUrl(value, label) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${label} 必须是 http 或 https 地址。`);
  }
}

function validatePhone(value, required) {
  const phone = String(value || "").trim();
  if (!phone && !required) return "";
  if (!/^\+?\d[\d\s-]{6,19}$/.test(phone)) {
    throw new Error("请填写有效手机号，或关闭短信/隐私号通知。");
  }
  return phone.replace(/[\s-]/g, "");
}

function moveUrl(vehicleToken) {
  const url = new URL("./move.html", location.href);
  url.searchParams.set("t", vehicleToken);
  return url.toString();
}

function ownerUrl(ownerToken) {
  const url = new URL("./owner.html", location.href);
  url.searchParams.set("ownerToken", ownerToken);
  return url.toString();
}

function qrImageUrl(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(text)}`;
}

function setupBindPage() {
  setApiInput();
  const ocrForm = document.querySelector("#ocrForm");
  const bindForm = document.querySelector("#bindForm");
  const ocrResult = document.querySelector("#ocrResult");
  const bindResult = document.querySelector("#bindResult");
  const plateNumber = document.querySelector("#plateNumber");

  ocrForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = document.querySelector("#plateImage").files[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("image", file);
    show(ocrResult, "正在识别车牌...");
    try {
      const data = await request("/api/ocr/plate", { method: "POST", body: formData });
      const candidate = data.plateNumber || data.candidates?.[0]?.plateNumber || "";
      if (candidate) plateNumber.value = candidate;
      show(
        ocrResult,
        `识别结果：<strong>${escapeHtml(candidate || "未识别到车牌")}</strong><br>请人工确认后再绑定。`
      );
    } catch (error) {
      show(ocrResult, escapeHtml(error.message), true);
    }
  });

  bindForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const smsEnabled = boolValue(form, "smsEnabled");
    const privacyCallEnabled = boolValue(form, "privacyCallEnabled");
    show(bindResult, "正在创建绑定...");
    try {
      const payload = {
        plateNumber: validatePlateNumber(form.plateNumber.value),
        showdocWebhook: validateHttpUrl(form.showdocWebhook.value.trim(), "ShowDoc Webhook"),
        showdocToken: form.showdocToken.value.trim(),
        ownerPhone: validatePhone(form.ownerPhone.value, smsEnabled || privacyCallEnabled),
        smsEnabled,
        privacyCallEnabled,
      };
      const data = await request("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const publicUrl = moveUrl(data.vehicleToken);
      const manageUrl = ownerUrl(data.ownerToken);
      show(
        bindResult,
        `<div class="qr">
          <strong>绑定成功</strong>
          ${data.demo ? "<span>当前为浏览器演示模式：二维码链接只在本浏览器保存了车辆数据。</span>" : ""}
          <img src="${qrImageUrl(publicUrl)}" alt="挪车二维码" />
          <span>访客二维码链接：<a href="${publicUrl}">${escapeHtml(publicUrl)}</a></span>
          <span>车主管理链接：<a href="${manageUrl}">${escapeHtml(manageUrl)}</a></span>
        </div>`
      );
    } catch (error) {
      show(bindResult, escapeHtml(error.message), true);
    }
  });
}

function setupOwnerPage() {
  setApiInput();
  const tokenInput = document.querySelector("#ownerToken");
  tokenInput.value = params.get("ownerToken") || "";
  const loadForm = document.querySelector("#ownerLoadForm");
  const patchForm = document.querySelector("#ownerPatchForm");
  const status = document.querySelector("#ownerStatus");
  const patchResult = document.querySelector("#ownerPatchResult");

  async function loadOwner() {
    const token = tokenInput.value.trim();
    if (!token) throw new Error("请填写 ownerToken。");
    const data = await request(`/api/owner/${encodeURIComponent(token)}/vehicle`);
    const publicUrl = moveUrl(data.vehicleToken);
    show(
      status,
      `<strong>${escapeHtml(data.maskedPlate)}</strong><br>
       访客链接：<a href="${publicUrl}">${escapeHtml(publicUrl)}</a><br>
       ShowDoc：${data.showdocEnabled ? "已配置" : "未配置"}<br>
       短信：${data.smsEnabled ? "启用" : "停用"}，隐私号：${data.privacyCallEnabled ? "启用" : "停用"}<br>
       最近通知：${data.recentNotifications?.length || 0} 条`
    );
    return data;
  }

  loadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    show(status, "正在读取配置...");
    try {
      await loadOwner();
    } catch (error) {
      show(status, escapeHtml(error.message), true);
    }
  });

  patchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = tokenInput.value.trim();
    const form = event.currentTarget;
    const payload = {};
    ["showdocWebhook", "showdocToken", "ownerPhone"].forEach((name) => {
      const value = form[name].value.trim();
      if (value) payload[name] = value;
    });
    const smsEnabled = boolValue(form, "smsEnabled");
    const privacyCallEnabled = boolValue(form, "privacyCallEnabled");
    if (smsEnabled !== undefined) payload.smsEnabled = smsEnabled;
    if (privacyCallEnabled !== undefined) payload.privacyCallEnabled = privacyCallEnabled;
    show(patchResult, "正在保存...");
    try {
      if (payload.showdocWebhook) payload.showdocWebhook = validateHttpUrl(payload.showdocWebhook, "ShowDoc Webhook");
      if (payload.ownerPhone) payload.ownerPhone = validatePhone(payload.ownerPhone, smsEnabled || privacyCallEnabled);
      await request(`/api/owner/${encodeURIComponent(token)}/vehicle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      show(patchResult, "保存成功。");
      await loadOwner();
    } catch (error) {
      show(patchResult, escapeHtml(error.message), true);
    }
  });

  if (tokenInput.value) loadForm.requestSubmit();
}

function setupMovePage() {
  const token = params.get("t") || "";
  const result = document.querySelector("#notifyResult");
  const vehicle = document.querySelector("#publicVehicle");
  const buttons = document.querySelectorAll("[data-channel]");

  async function loadPublic() {
    if (!token) throw new Error("二维码缺少车辆 token。");
    const data = await request(`/api/vehicles/${encodeURIComponent(token)}/public`);
    show(
      vehicle,
      `<strong>${escapeHtml(data.maskedPlate)}</strong><br>
       可用通知：${data.availableChannels.map(escapeHtml).join("、") || "暂无"}`
    );
    buttons.forEach((button) => {
      button.disabled = !data.availableChannels.includes(button.dataset.channel);
    });
  }

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      show(result, "正在发送提醒...");
      try {
        const data = await request(`/api/vehicles/${encodeURIComponent(token)}/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: button.dataset.channel }),
        });
        show(result, escapeHtml(data.message || "已通知车主。"));
      } catch (error) {
        show(result, escapeHtml(error.message), true);
      }
    });
  });

  loadPublic().catch((error) => show(vehicle, escapeHtml(error.message), true));
}

function setupSetupPage() {
  setApiInput();
  const status = document.querySelector("#setupStatus");
  const form = document.querySelector("#setupCheckForm");
  const health = document.querySelector("#healthResult");
  const configuredBase = window.MOVE_CAR_API_BASE || "";
  show(
    status,
    `GitHub Pages：已加载<br>
     Worker API：${configuredBase ? escapeHtml(configuredBase) : "未配置"}<br>
     Demo 模式：${DEMO_MODE ? "启用" : "关闭"}`
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    show(health, "正在检查 Worker...");
    try {
      const data = await request("/api/health");
      show(
        health,
        `Worker：${escapeHtml(data.status)}<br>
         D1：${data.d1 ? "已绑定" : "未绑定"}<br>
         加密密钥：${data.encryption ? "已配置" : "未配置"}<br>
         腾讯云 OCR：${data.tencentOcr ? "已配置" : "未配置"}<br>
         短信：${data.tencentSms ? "已配置" : "未配置"}<br>
         隐私号：${data.privacyCall ? "已配置" : "未配置"}<br>
         缺失项：${data.missing?.length ? data.missing.map(escapeHtml).join("、") : "无"}`
      );
    } catch (error) {
      show(health, escapeHtml(error.message), true);
    }
  });
}

if (page === "bind") setupBindPage();
if (page === "owner") setupOwnerPage();
if (page === "move") setupMovePage();
if (page === "setup") setupSetupPage();
