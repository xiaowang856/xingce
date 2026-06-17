const LEGACY_STORAGE_KEY = "civil-service-study-state-v1";
const STORAGE_PREFIX = "civil-service-study-state-by-user-v1";
const USER_KEY = "civil-service-study-user-v1";
const IDIOM_API_KEY = "civil-service-study-idiom-api-key-v1";
const DEFAULT_USER_ID = "默认用户";

const state = {
  base: null,
  idiomOrder: [],
  local: {
    daily: [],
    mistakes: [],
    shenlun: [],
    idiomStatus: {},
    idiomNotes: {},
  },
};

const titles = {
  dashboard: "总览",
  daily: "每日打卡",
  mistakes: "行测错题",
  shenlun: "申论练习",
  idioms: "成语积累",
  resources: "网站资源",
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
  };
}

function currentUserId() {
  return ($("#userIdInput")?.value || DEFAULT_USER_ID).trim() || DEFAULT_USER_ID;
}

function storageKey(userId = currentUserId()) {
  return `${STORAGE_PREFIX}:${userId}`;
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

function normalizeIdiomApiData(payload) {
  const data = payload?.result || payload?.data || payload?.newslist?.[0] || payload;
  if (Array.isArray(data)) return data[0] || {};
  return data || {};
}

async function queryIdiomApi() {
  const word = $("#idiomLookupInput").value.trim();
  const key = $("#idiomApiKeyInput").value.trim();
  if (!word) {
    renderIdiomApiResult(`<article class="idiom-api-card"><p>请输入要查询的成语。</p></article>`);
    return;
  }

  const localMatch = state.base.idioms.find((item) => item["成语"] === word);
  if (localMatch) renderLocalIdiomResult(localMatch);

  if (!key) {
    if (!localMatch) {
      renderIdiomApiResult(`<article class="idiom-api-card"><p>未在本地库找到。填写接口Key后可查询在线成语词典。</p></article>`);
    }
    return;
  }

  localStorage.setItem(IDIOM_API_KEY, key);
  renderIdiomApiResult(`<article class="idiom-api-card"><p>正在查询在线成语词典...</p></article>`);

  try {
    const url = `https://apis.tianapi.com/chengyu/index?key=${encodeURIComponent(key)}&word=${encodeURIComponent(word)}`;
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok || (payload.code && Number(payload.code) !== 200)) {
      throw new Error(payload.msg || payload.message || "接口查询失败");
    }
    const data = normalizeIdiomApiData(payload);
    renderIdiomApiResult(`
      <article class="idiom-api-card">
        <strong>${escapeHtml(data.name || data.word || word)}</strong>
        <p><b>拼音：</b>${escapeHtml(data.pinyin || data.py || "")}</p>
        <p><b>解释：</b>${escapeHtml(data.content || data.explain || data.meaning || data.definition || "")}</p>
        <p><b>出处：</b>${escapeHtml(data.derivation || data.source || data.from || "")}</p>
        <p><b>例句：</b>${escapeHtml(data.samples || data.example || data.sentence || "")}</p>
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
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

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

  $("#exportJsonBtn").addEventListener("click", downloadJson);
  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("确定清空当前浏览器里的新增记录和成语状态吗？")) return;
    localStorage.removeItem(storageKey());
    state.local = emptyLocal();
    renderAll();
  });
}

function renderAll() {
  renderDashboard();
  renderDaily();
  renderMistakes();
  renderShenlun();
  renderIdioms();
  renderResources();
}

async function init() {
  $("#userIdInput").value = localStorage.getItem(USER_KEY) || DEFAULT_USER_ID;
  $("#idiomApiKeyInput").value = localStorage.getItem(IDIOM_API_KEY) || "";
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
