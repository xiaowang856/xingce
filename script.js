const LEGACY_STORAGE_KEY = "civil-service-study-state-v1";
const STORAGE_PREFIX = "civil-service-study-state-by-user-v1";
const USER_KEY = "civil-service-study-user-v1";
const SYNC_PASSWORD_KEY = "civil-service-study-sync-password-v1";
const IDIOM_API_URL = "https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/master/data/idiom.json";
const DEFAULT_USER_ID = "默认用户";
const CLOUD_TABLE = "study_profiles";

const state = {
  base: null,
  idiomOrder: [],
  remoteIdioms: null,
  supabase: null,
  local: {
    daily: [],
    mistakes: [],
    shenlun: [],
    idiomStatus: {},
    idiomNotes: {},
    idiomLookupCache: {},
    profile: {
      avatar: "",
    },
  },
};

const titles = {
  dashboard: "总览",
  daily: "每日打卡",
  mistakes: "行测错题",
  shenlun: "申论练习",
  idioms: "成语积累",
  resources: "网站资源",
  profile: "个人设置",
};

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let toastTimer = null;

function showToast(message, type = "success") {
  const toast = $("#toast");
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 2600);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyLocal() {
  return {
    daily: [],
    mistakes: [],
    shenlun: [],
    idiomStatus: {},
    idiomNotes: {},
    idiomLookupCache: {},
    profile: {
      avatar: "",
    },
  };
}

function currentUserId() {
  return ($("#userIdInput")?.value || DEFAULT_USER_ID).trim() || DEFAULT_USER_ID;
}

function currentSyncPassword() {
  return $("#syncPasswordInput")?.value || "";
}

function storageKey(userId = currentUserId()) {
  return `${STORAGE_PREFIX}:${userId}`;
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function sha256Text(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deriveCryptoKey(password, salt) {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptLocalData(local, password, salt) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveCryptoKey(password, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(local));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    iv: bytesToBase64(iv),
    data: bytesToBase64(encrypted),
  };
}

async function decryptLocalData(payload, password, salt) {
  const key = await deriveCryptoKey(password, salt);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(payload.iv) }, key, base64ToBytes(payload.data));
  return JSON.parse(new TextDecoder().decode(decrypted));
}

function getSupabaseClient() {
  if (state.supabase) return state.supabase;
  const config = window.SUPABASE_CONFIG;
  if (!config?.url || !config?.anonKey || !window.supabase?.createClient) {
    throw new Error("请先配置 config.js 里的 Supabase URL 和 anonKey");
  }
  state.supabase = window.supabase.createClient(config.url, config.anonKey);
  return state.supabase;
}

function requireSyncPassword() {
  const password = currentSyncPassword();
  if (!password) throw new Error("请输入同步密码");
  localStorage.setItem(SYNC_PASSWORD_KEY, password);
  return password;
}

async function syncIdFor(userId, password) {
  return sha256Text(`${userId}:${password}`);
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function resetIdiomOrder() {
  state.idiomOrder = shuffle(state.base.idioms.map((_, index) => index));
}

function loadLocal() {
  const key = storageKey();
  const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!localStorage.getItem(key) && legacyRaw && key !== LEGACY_STORAGE_KEY) {
    localStorage.setItem(key, legacyRaw);
  }

  const raw = localStorage.getItem(key);
  state.local = emptyLocal();
  if (!raw) {
    saveLocal();
    return;
  }
  try {
    state.local = { ...state.local, ...JSON.parse(raw) };
  } catch {
    localStorage.removeItem(storageKey());
  }
}

function saveLocal() {
  localStorage.setItem(storageKey(), JSON.stringify(state.local));
  localStorage.setItem(USER_KEY, currentUserId());
  if (currentSyncPassword()) localStorage.setItem(SYNC_PASSWORD_KEY, currentSyncPassword());
}

function normalizeImportedLocal(value) {
  if (!value || typeof value !== "object") {
    throw new Error("文件内容不是有效的数据对象");
  }
  const imported = value.local && typeof value.local === "object" ? value.local : value;
  return { ...emptyLocal(), ...imported };
}

function normalizeDaily(row) {
  const total = Number(row["行测题量"] || row.total || 0);
  const correct = Number(row["行测正确数"] || row.correct || 0);
  const rate = total > 0 ? `${Math.round((correct / total) * 1000) / 10}%` : "";
  return {
    date: row["日期"] || row.date || "",
    minutes: row["学习时长(分钟)"] || row.minutes || "",
    module: row["行测模块"] || row.module || "",
    total,
    correct,
    rate,
    shenlunTask: row["申论任务"] || row.shenlunTask || "",
    problem: row["今日主要问题"] || row.problem || "",
    adjust: row["明日调整"] || row.adjust || "",
  };
}

function normalizeMistake(row) {
  return {
    date: row["日期"] || row.date || "",
    module: row["模块"] || row.module || "",
    type: row["题型"] || row.type || "",
    reason: row["错因"] || row.reason || "",
    method: row["正确方法/公式"] || row.method || "",
    source: row["练习网站/题源链接"] || row.source || "",
  };
}

function normalizeShenlun(row) {
  return {
    date: row["日期"] || row.date || "",
    type: row["题型"] || row.type || "",
    topic: row["材料主题"] || row.topic || "",
    score: row["自评分"] || row.score || "",
    miss: row["主要漏点"] || row.miss || "",
    rewrite: row["修改后要点"] || row.rewrite || "",
    link: row["参考网站/文章链接"] || row.link || "",
  };
}

function allDaily() {
  return [...state.base.dailyCheckin.map(normalizeDaily), ...state.local.daily];
}

function allMistakes() {
  return [
    ...state.base.examMistakes.map(normalizeMistake).filter((row) => row.date || row.module || row.type || row.reason),
    ...state.local.mistakes,
  ];
}

function allShenlun() {
  return [
    ...state.base.shenlunPractice.map(normalizeShenlun).filter((row) => row.date || row.type || row.topic || row.miss),
    ...state.local.shenlun,
  ];
}

function switchView(viewName) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((button) => button.classList.remove("active"));
  $(`#${viewName}`).classList.add("active");
  document.querySelector(`[data-view="${viewName}"]`).classList.add("active");
  $("#viewTitle").textContent = titles[viewName];
}

function renderProfile() {
  const avatar = state.local.profile?.avatar || "";
  const preview = $("#avatarPreview");
  const topAvatar = $("#topAvatarBtn");
  const fallback = (currentUserId()[0] || "考").toUpperCase();
  if (avatar) {
    if (preview) preview.innerHTML = `<img src="${escapeHtml(avatar)}" alt="头像" />`;
    if (topAvatar) topAvatar.innerHTML = `<img src="${escapeHtml(avatar)}" alt="头像" />`;
  } else {
    if (preview) preview.textContent = fallback;
    if (topAvatar) topAvatar.textContent = fallback;
  }
}

function renderDashboard() {
  $("#idiomCount").textContent = state.base.idioms.length;
  $("#mistakeCount").textContent = allMistakes().length;
  $("#shenlunCount").textContent = allShenlun().length;
  const todayRecord = allDaily().find((row) => row.date === today());
  $("#todayStatus").textContent = todayRecord ? "已记录" : "未记录";

  $("#focusList").innerHTML = state.base.focusList
    .slice(0, 8)
    .map(
      (item) => `
        <article class="focus-item">
          <strong>${escapeHtml(item["科目"])} · ${escapeHtml(item["模块/题型"])}</strong>
          <p>${escapeHtml(item["训练目标"])}</p>
          <div class="tag-row">
            <span class="tag good">${escapeHtml(item["优先级"])}</span>
            <span class="tag">${escapeHtml(item["阶段"])}</span>
          </div>
        </article>
      `,
    )
    .join("");

  $("#weeklyPlan").innerHTML = state.base.weeklyPlan
    .slice(0, 6)
    .map(
      (item) => `
        <article class="week-item">
          <strong>第${escapeHtml(item["周次"])}周 · ${escapeHtml(item["阶段"])}</strong>
          <p>${escapeHtml(item["行测任务"])}</p>
          <p>${escapeHtml(item["申论任务"])}</p>
          <div class="tag-row">
            <span class="tag warn">${escapeHtml(item["套卷/模考"])}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function table(headers, rows) {
  if (!rows.length) {
    return `<div class="focus-item"><p>暂无记录。</p></div>`;
  }
  return `
    <table>
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header.label)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                ${headers.map((header) => `<td>${escapeHtml(row[header.key])}</td>`).join("")}
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function includesRow(row, keyword) {
  if (!keyword) return true;
  return Object.values(row).join(" ").toLowerCase().includes(keyword.toLowerCase());
}

function renderDaily() {
  const keyword = $("#dailySearch").value.trim();
  const rows = allDaily().filter((row) => includesRow(row, keyword));
  $("#dailyTable").innerHTML = table(
    [
      { key: "date", label: "日期" },
      { key: "minutes", label: "时长" },
      { key: "module", label: "模块" },
      { key: "total", label: "题量" },
      { key: "correct", label: "正确" },
      { key: "rate", label: "正确率" },
      { key: "shenlunTask", label: "申论任务" },
      { key: "problem", label: "问题" },
      { key: "adjust", label: "调整" },
    ],
    rows,
  );
}

function renderMistakes() {
  const keyword = $("#mistakeSearch").value.trim();
  const rows = allMistakes().filter((row) => includesRow(row, keyword));
  $("#mistakeTable").innerHTML = table(
    [
      { key: "date", label: "日期" },
      { key: "module", label: "模块" },
      { key: "type", label: "题型" },
      { key: "reason", label: "错因" },
      { key: "method", label: "正确方法" },
      { key: "source", label: "题源" },
    ],
    rows,
  );
}

function renderShenlun() {
  const keyword = $("#shenlunSearch").value.trim();
  const rows = allShenlun().filter((row) => includesRow(row, keyword));
  $("#shenlunTable").innerHTML = table(
    [
      { key: "date", label: "日期" },
      { key: "type", label: "题型" },
      { key: "topic", label: "主题" },
      { key: "score", label: "自评分" },
      { key: "miss", label: "主要漏点" },
      { key: "rewrite", label: "修改后要点" },
      { key: "link", label: "参考链接" },
    ],
    rows,
  );
}

function idiomStatus(idiom) {
  return state.local.idiomStatus[idiom["成语"]] || idiom["掌握状态"] || "未掌握";
}

function idiomNote(idiom) {
  return state.local.idiomNotes[idiom["成语"]] || "";
}

function renderIdioms() {
  const keyword = $("#idiomSearch").value.trim().toLowerCase();
  const tone = $("#idiomTone").value;
  const status = $("#idiomStatus").value;
  const orderedIdioms = state.idiomOrder.map((index) => state.base.idioms[index]).filter(Boolean);
  const rows = orderedIdioms.filter((item) => {
    const text = Object.values(item).join(" ").toLowerCase();
    const toneOk = !tone || String(item["感情色彩"] || "").includes(tone);
    const statusOk = !status || idiomStatus(item) === status;
    return text.includes(keyword) && toneOk && statusOk;
  });

  $("#idiomCards").innerHTML = rows
    .map((item) => {
      const current = idiomStatus(item);
      const note = idiomNote(item);
      return `
        <article class="idiom-card">
          <strong>${escapeHtml(item["成语"])}</strong>
          <p>${escapeHtml(item["常见含义"])}</p>
          <p><b>易错：</b>${escapeHtml(item["易错点"])}</p>
          <p><b>例句：</b>${escapeHtml(item["例句/常见搭配"])}</p>
          <p><b>辨析：</b>${escapeHtml(item["近义辨析"])}</p>
          <label class="idiom-note">
            我的含义
            <textarea data-idiom-note="${escapeHtml(item["成语"])}" rows="3" placeholder="用自己的话写下理解">${escapeHtml(note)}</textarea>
          </label>
          <div class="tag-row">
            <span class="tag">${escapeHtml(item["感情色彩"])}</span>
            <span class="tag ${current === "已掌握" ? "good" : "warn"}">${escapeHtml(current)}</span>
          </div>
          <div class="idiom-actions">
            <button class="small-btn" data-idiom="${escapeHtml(item["成语"])}" data-status="已掌握">已掌握</button>
            <button class="small-btn" data-idiom="${escapeHtml(item["成语"])}" data-status="需复习">需复习</button>
            <button class="small-btn" data-idiom="${escapeHtml(item["成语"])}" data-status="未掌握">未掌握</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderResources() {
  $("#shenlunSites").innerHTML = state.base.shenlunSites.map(resourceCard).join("");
  $("#xingceSites").innerHTML = state.base.xingceSites.map(resourceCard).join("");
}

function resourceCard(item) {
  const name = item["网站/渠道"] || "";
  const link = item["链接"] || "";
  const suitable = item["适合看什么"] || item["适合练什么"] || "";
  return `
    <article class="resource-card">
      <strong>${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>` : escapeHtml(name)}</strong>
      <p>${escapeHtml(suitable)}</p>
      <p>${escapeHtml(item["怎么用"])}</p>
      <div class="tag-row">
        <span class="tag">${escapeHtml(item["建议频率"] || item["重点模块"] || "")}</span>
      </div>
    </article>
  `;
}

function serializeForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setDefaultDates() {
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (!input.value) input.value = today();
  });
}

function renderIdiomApiResult(html) {
  $("#idiomApiResult").innerHTML = html;
}

function renderLocalIdiomResult(idiom) {
  renderIdiomApiResult(`
    <article class="idiom-api-card">
      <strong>${escapeHtml(idiom["成语"])}</strong>
      <p><b>本地含义：</b>${escapeHtml(idiom["常见含义"])}</p>
      <p><b>易错点：</b>${escapeHtml(idiom["易错点"])}</p>
      <p><b>例句：</b>${escapeHtml(idiom["例句/常见搭配"])}</p>
      <p><b>辨析：</b>${escapeHtml(idiom["近义辨析"])}</p>
    </article>
  `);
}

async function loadRemoteIdioms() {
  if (state.remoteIdioms) return state.remoteIdioms;
  const response = await fetch(IDIOM_API_URL);
  if (!response.ok) throw new Error("成语接口加载失败");
  state.remoteIdioms = await response.json();
  return state.remoteIdioms;
}

async function loadCloudState() {
  const userId = currentUserId();
  const password = requireSyncPassword();
  const syncId = await syncIdFor(userId, password);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from(CLOUD_TABLE).select("payload, salt, updated_at").eq("sync_id", syncId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.payload) throw new Error("云端没有找到该使用者的数据");
  const local = await decryptLocalData(data.payload, password, data.salt);
  state.local = { ...emptyLocal(), ...local };
  saveLocal();
  renderAll();
  showToast("已读取云端数据");
}

async function saveCloudState() {
  const userId = currentUserId();
  const password = requireSyncPassword();
  const syncId = await syncIdFor(userId, password);
  const salt = `civil-service-study:${userId}`;
  const payload = await encryptLocalData(state.local, password, salt);
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(CLOUD_TABLE).upsert(
    {
      sync_id: syncId,
      user_name: userId,
      salt,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "sync_id" },
  );
  if (error) throw new Error(error.message);
  saveLocal();
  showToast("已保存到云端");
}

function matchRemoteIdiom(row, word) {
  return row?.word === word || row?.name === word || row?.derivation === word;
}

function cacheIdiomLookup(word, data) {
  state.local.idiomLookupCache[word] = {
    word: data.name || data.word || word,
    pinyin: data.pinyin || data.py || "",
    explanation: data.explanation || data.content || data.explain || "",
    derivation: data.derivation || data.source || "",
    example: data.example || data.samples || "",
    abbreviation: data.abbreviation || "",
    cachedAt: new Date().toISOString(),
  };
  saveLocal();
}

function renderCachedIdiomLookup(word, data) {
  renderIdiomApiResult(`
    <article class="idiom-api-card">
      <strong>${escapeHtml(data.word || word)}</strong>
      <p><b>拼音：</b>${escapeHtml(data.pinyin || "")}</p>
      <p><b>解释：</b>${escapeHtml(data.explanation || "")}</p>
      <p><b>出处：</b>${escapeHtml(data.derivation || "")}</p>
      <p><b>例句：</b>${escapeHtml(data.example || "")}</p>
      <p><b>缩写：</b>${escapeHtml(data.abbreviation || "")}</p>
      <p><b>来源：</b>本地缓存</p>
    </article>
  `);
}

async function queryIdiomApi() {
  const word = $("#idiomLookupInput").value.trim();
  if (!word) {
    renderIdiomApiResult(`<article class="idiom-api-card"><p>请输入要查询的成语。</p></article>`);
    return;
  }

  const localMatch = state.base.idioms.find((item) => item["成语"] === word);
  if (localMatch) renderLocalIdiomResult(localMatch);

  const cached = state.local.idiomLookupCache[word];
  if (cached) {
    renderCachedIdiomLookup(word, cached);
    return;
  }

  renderIdiomApiResult(`<article class="idiom-api-card"><p>正在查询成语接口...</p></article>`);

  try {
    const remoteIdioms = await loadRemoteIdioms();
    const data = remoteIdioms.find((row) => matchRemoteIdiom(row, word));
    if (!data) throw new Error("接口中未找到该成语");
    cacheIdiomLookup(word, data);
    renderIdiomApiResult(`
      <article class="idiom-api-card">
        <strong>${escapeHtml(data.name || data.word || word)}</strong>
        <p><b>拼音：</b>${escapeHtml(data.pinyin || data.py || "")}</p>
        <p><b>解释：</b>${escapeHtml(data.explanation || data.content || data.explain || "")}</p>
        <p><b>出处：</b>${escapeHtml(data.derivation || data.source || "")}</p>
        <p><b>例句：</b>${escapeHtml(data.example || data.samples || "")}</p>
        <p><b>缩写：</b>${escapeHtml(data.abbreviation || "")}</p>
        <p><b>来源：</b>接口查询，已保存到本地</p>
      </article>
    `);
  } catch (error) {
    const fallback = localMatch ? `<p>已显示本地结果。</p>` : "";
    renderIdiomApiResult(`<article class="idiom-api-card"><p>在线查询失败：${escapeHtml(error.message)}</p>${fallback}</article>`);
  }
}

function downloadJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    userId: currentUserId(),
    local: state.local,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `公考复习-${currentUserId()}-${today()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("已导出我的数据");
}

function importJsonFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const payload = JSON.parse(String(reader.result || "{}"));
      const importedUserId = String(payload.userId || currentUserId()).trim() || DEFAULT_USER_ID;
      $("#userIdInput").value = importedUserId;
      state.local = normalizeImportedLocal(payload);
      saveLocal();
      renderAll();
      showToast(`已导入 ${importedUserId} 的数据`);
    } catch (error) {
      showToast(`导入失败：${error.message}`, "error");
    } finally {
      $("#importJsonInput").value = "";
    }
  });
  reader.addEventListener("error", () => {
    showToast("导入失败：文件读取失败", "error");
    $("#importJsonInput").value = "";
  });
  reader.readAsText(file, "utf-8");
}

function importAvatarFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("请选择图片文件", "error");
    return;
  }
  const image = new Image();
  const url = URL.createObjectURL(file);
  image.addEventListener("load", () => {
    const canvas = document.createElement("canvas");
    const size = 240;
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const offsetX = (image.naturalWidth - side) / 2;
    const offsetY = (image.naturalHeight - side) / 2;
    canvas.width = size;
    canvas.height = size;
    canvas.getContext("2d").drawImage(image, offsetX, offsetY, side, side, 0, 0, size, size);
    state.local.profile = { ...(state.local.profile || {}), avatar: canvas.toDataURL("image/jpeg", 0.86) };
    saveLocal();
    renderProfile();
    $("#avatarInput").value = "";
    URL.revokeObjectURL(url);
    showToast("头像已上传");
  });
  image.addEventListener("error", () => {
    showToast("头像读取失败", "error");
    $("#avatarInput").value = "";
    URL.revokeObjectURL(url);
  });
  image.src = url;
}

async function runCloudAction(action) {
  try {
    await action();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  $("#topAvatarBtn").addEventListener("click", () => switchView("profile"));

  $("#dailyForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = serializeForm(event.currentTarget);
    const total = Number(form.total || 0);
    const correct = Number(form.correct || 0);
    state.local.daily.unshift({
      date: form.date,
      minutes: form.minutes,
      module: form.module,
      total,
      correct,
      rate: total > 0 ? `${Math.round((correct / total) * 1000) / 10}%` : "",
      shenlunTask: form.shenlunTask,
      problem: form.problem,
      adjust: form.adjust,
    });
    saveLocal();
    renderDaily();
    renderDashboard();
    event.currentTarget.reset();
    setDefaultDates();
  });

  $("#mistakeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = serializeForm(event.currentTarget);
    state.local.mistakes.unshift(form);
    saveLocal();
    renderMistakes();
    renderDashboard();
    event.currentTarget.reset();
    setDefaultDates();
  });

  $("#shenlunForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = serializeForm(event.currentTarget);
    state.local.shenlun.unshift(form);
    saveLocal();
    renderShenlun();
    renderDashboard();
    event.currentTarget.reset();
    setDefaultDates();
  });

  ["dailySearch", "mistakeSearch", "shenlunSearch"].forEach((id) => {
    $(`#${id}`).addEventListener("input", () => {
      if (id === "dailySearch") renderDaily();
      if (id === "mistakeSearch") renderMistakes();
      if (id === "shenlunSearch") renderShenlun();
    });
  });

  ["idiomSearch", "idiomTone", "idiomStatus"].forEach((id) => {
    $(`#${id}`).addEventListener("input", renderIdioms);
  });

  $("#queryIdiomApiBtn").addEventListener("click", queryIdiomApi);
  $("#idiomLookupInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") queryIdiomApi();
  });

  $("#refreshIdiomsBtn").addEventListener("click", () => {
    resetIdiomOrder();
    renderIdioms();
  });

  $("#idiomCards").addEventListener("click", (event) => {
    const button = event.target.closest("[data-idiom]");
    if (!button) return;
    state.local.idiomStatus[button.dataset.idiom] = button.dataset.status;
    saveLocal();
    renderIdioms();
  });

  $("#idiomCards").addEventListener("input", (event) => {
    const field = event.target.closest("[data-idiom-note]");
    if (!field) return;
    const idiom = field.dataset.idiomNote;
    const value = field.value.trim();
    if (value) {
      state.local.idiomNotes[idiom] = value;
    } else {
      delete state.local.idiomNotes[idiom];
    }
    saveLocal();
  });

  $("#userIdInput").addEventListener("change", () => {
    loadLocal();
    renderAll();
    saveLocal();
  });

  $("#syncPasswordInput").addEventListener("change", () => {
    saveLocal();
  });

  $("#avatarUploadBtn").addEventListener("click", () => {
    showToast("请选择头像图片");
    $("#avatarInput").click();
  });
  $("#avatarInput").addEventListener("change", (event) => {
    importAvatarFile(event.currentTarget.files?.[0]);
  });
  $("#avatarRemoveBtn").addEventListener("click", () => {
    state.local.profile = { ...(state.local.profile || {}), avatar: "" };
    saveLocal();
    renderProfile();
    showToast("头像已移除");
  });

  $("#exportJsonBtn").addEventListener("click", downloadJson);
  $("#importJsonBtn").addEventListener("click", () => {
    showToast("请选择导出的 JSON 文件");
    $("#importJsonInput").click();
  });
  $("#importJsonInput").addEventListener("change", (event) => {
    importJsonFile(event.currentTarget.files?.[0]);
  });
  $("#loadCloudBtn").addEventListener("click", () => runCloudAction(loadCloudState));
  $("#saveCloudBtn").addEventListener("click", () => runCloudAction(saveCloudState));
  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("确定清空当前浏览器里的新增记录和成语状态吗？")) return;
    localStorage.removeItem(storageKey());
    state.local = emptyLocal();
    renderAll();
    showToast("本地记录已清空");
  });
}

function renderAll() {
  renderDashboard();
  renderDaily();
  renderMistakes();
  renderShenlun();
  renderIdioms();
  renderResources();
  renderProfile();
}

async function init() {
  $("#userIdInput").value = localStorage.getItem(USER_KEY) || DEFAULT_USER_ID;
  $("#syncPasswordInput").value = localStorage.getItem(SYNC_PASSWORD_KEY) || "";
  loadLocal();
  if (window.STUDY_DATA) {
    state.base = window.STUDY_DATA;
  } else {
    const response = await fetch("data.json");
    state.base = await response.json();
  }
  resetIdiomOrder();
  bindEvents();
  setDefaultDates();
  renderAll();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="app"><section class="panel"><h2>加载失败</h2><p>${escapeHtml(error.message)}</p></section></main>`;
});
