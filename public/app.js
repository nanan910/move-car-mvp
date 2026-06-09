const params = new URLSearchParams(location.search);
const page = document.body.dataset.page;

const DEFAULT_API_BASE = localStorage.getItem("moveCarApiBase") || window.MOVE_CAR_API_BASE || "";

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
  if (!base) throw new Error("请先填写 Cloudflare Worker API 地址。");
  const res = await fetch(`${base}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `请求失败：${res.status}`);
  return data;
}

function boolValue(form, name) {
  const value = new FormData(form).get(name);
  if (value === "") return undefined;
  return value === "true";
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
    const payload = {
      plateNumber: form.plateNumber.value.trim(),
      showdocWebhook: form.showdocWebhook.value.trim(),
      showdocToken: form.showdocToken.value.trim(),
      ownerPhone: form.ownerPhone.value.trim(),
      smsEnabled: boolValue(form, "smsEnabled"),
      privacyCallEnabled: boolValue(form, "privacyCallEnabled"),
    };
    show(bindResult, "正在创建绑定...");
    try {
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

if (page === "bind") setupBindPage();
if (page === "owner") setupOwnerPage();
if (page === "move") setupMovePage();
