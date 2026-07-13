const STORAGE_KEY = "stock-system-pwa-config";
const PUBLIC_CONFIG_PATH = "public-config.json?v=6";

const state = {
  config: null,
  run: null,
  candidates: [],
  judgements: [],
  market: [],
  charts: [],
  selectedCode: null,
  actionFilter: "BUY_CANDIDATE",
};

const els = {
  setupPanel: document.querySelector("#setupPanel"),
  supabaseUrlInput: document.querySelector("#supabaseUrlInput"),
  supabaseKeyInput: document.querySelector("#supabaseKeyInput"),
  saveConfigButton: document.querySelector("#saveConfigButton"),
  clearConfigButton: document.querySelector("#clearConfigButton"),
  refreshButton: document.querySelector("#refreshButton"),
  marketRegime: document.querySelector("#marketRegime"),
  buyCount: document.querySelector("#buyCount"),
  watchCount: document.querySelector("#watchCount"),
  runDate: document.querySelector("#runDate"),
  runStatus: document.querySelector("#runStatus"),
  candidateList: document.querySelector("#candidateList"),
  actionFilter: document.querySelector("#actionFilter"),
  candidateDetail: document.querySelector("#candidateDetail"),
  priceChart: document.querySelector("#priceChart"),
  chartMeta: document.querySelector("#chartMeta"),
};

async function clearOldServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {}
}

function normalizeSupabaseUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return raw
      .replace(/\/+$/, "")
      .replace(/\/rest\/v1$/i, "")
      .replace(/\/+$/, "");
  }
}

function loadConfig() {
  try {
    const config = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!config) return null;
    if (config.url) config.url = normalizeSupabaseUrl(config.url);
    return { ...config, source: "manual" };
  } catch {
    return null;
  }
}

async function loadPublicConfig() {
  try {
    const res = await fetch(PUBLIC_CONFIG_PATH, { cache: "no-store" });
    if (!res.ok) return null;
    const config = await res.json();
    const url = normalizeSupabaseUrl(config.supabaseUrl || config.url);
    const key = String(config.supabaseKey || config.key || "").trim();
    if (!url || !key) return null;
    return { url, key, source: "public" };
  } catch {
    return null;
  }
}

function saveConfig(config) {
  const normalized = { ...config, url: normalizeSupabaseUrl(config.url), source: "manual" };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  state.config = normalized;
}

function showSetup(show) {
  els.setupPanel.classList.toggle("hidden", !show);
  if (state.config) {
    els.supabaseUrlInput.value = state.config.url || "";
    els.supabaseKeyInput.value = state.config.key || "";
  }
}

function supabaseHeaders() {
  return {
    apikey: state.config.key,
    Authorization: `Bearer ${state.config.key}`,
  };
}

async function fetchTable(table, params = {}) {
  const baseUrl = normalizeSupabaseUrl(state.config.url);
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) {
    throw new Error(`${table}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function number(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}

function yen(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString("ja-JP");
}

function stars(score) {
  const n = Number(score);
  const count = Math.max(1, Math.min(5, Math.ceil((Number.isFinite(n) ? n : 0) / 20)));
  return "★".repeat(count) + "☆".repeat(5 - count);
}

function expectedPrice(row) {
  const price = Number(row.close_price);
  const upside = Number(row.expected_upside_pct);
  if (!Number.isFinite(price) || !Number.isFinite(upside)) return null;
  return price * (1 + upside / 100);
}

function actionClass(action) {
  if (action === "BUY_CANDIDATE") return "buy";
  if (action === "WATCH") return "watch";
  return "skip";
}

async function loadData() {
  if (!state.config?.url || !state.config?.key) {
    showSetup(true);
    els.runStatus.textContent = "Supabase接続設定を入力してください。";
    return;
  }

  showSetup(false);
  els.runStatus.textContent = `読み込み中... ${normalizeSupabaseUrl(state.config.url)}`;
  const runs = await fetchTable("stock_operation_runs", {
    select: "*",
    order: "created_at.desc",
    limit: "1",
  });
  state.run = runs[0] || null;
  if (!state.run) throw new Error("stock_operation_runs にデータがありません。");

  const runId = state.run.run_id;
  const [candidates, judgements, market] = await Promise.all([
    fetchTable("stock_daily_candidates", { select: "*", run_id: `eq.${runId}`, order: "rank.asc,switch_priority_score.desc" }),
    fetchTable("stock_position_judgements", { select: "*", run_id: `eq.${runId}` }),
    fetchTable("stock_daily_market_summary", { select: "*", run_id: `eq.${runId}`, order: "date.desc", limit: "30" }),
  ]);

  state.candidates = candidates;
  state.judgements = judgements;
  state.market = market;
  state.selectedCode = candidates.find((r) => r.suggested_action === "BUY_CANDIDATE")?.code || candidates[0]?.code || null;
  render();
}

function renderSummary() {
  const market = state.market[0] || {};
  const buy = state.candidates.filter((r) => r.suggested_action === "BUY_CANDIDATE").length;
  const watch = state.candidates.filter((r) => r.suggested_action === "WATCH").length;
  els.marketRegime.textContent = market.market_regime_5 || Object.keys(state.run?.report?.market_counts || {})[0] || "-";
  els.buyCount.textContent = String(buy);
  els.watchCount.textContent = String(watch);
  els.runDate.textContent = state.run?.run_date || "-";
  els.runStatus.textContent = `run_id: ${state.run?.run_id || "-"}`;
}

function filteredCandidates() {
  if (state.actionFilter === "ALL") return state.candidates;
  return state.candidates.filter((r) => r.suggested_action === state.actionFilter);
}

function renderCandidates() {
  const rows = filteredCandidates();
  if (!rows.length) {
    els.candidateList.innerHTML = `<div class="empty-state">該当候補はありません。</div>`;
    return;
  }
  els.candidateList.innerHTML = rows.map((row) => {
    const score = row.switch_priority_score;
    const ep = expectedPrice(row);
    const gain = ep == null ? null : ep - Number(row.close_price);
    const active = row.code === state.selectedCode ? " active" : "";
    return `
      <button class="candidate-card${active}" data-code="${row.code}" type="button">
        <div>
          <div class="card-title">
            <span class="code">${row.code}</span>
            <span class="name">${row.name || ""}</span>
            <span class="badge ${actionClass(row.suggested_action)}">${row.suggested_action}</span>
          </div>
          <div class="card-numbers">
            <span>score ${number(score)}</span>
            <span>値段 ${yen(row.close_price)}</span>
            <span>期待 ${number(row.expected_upside_pct)}%</span>
            <span>見込み +${yen(gain)}</span>
          </div>
        </div>
        <div class="priority-stars" aria-label="優先度 ${stars(score)}">${stars(score)}</div>
      </button>`;
  }).join("");

  els.candidateList.querySelectorAll(".candidate-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCode = button.dataset.code;
      render();
    });
  });
}

async function loadChartForSelected() {
  if (!state.selectedCode || !state.run) return [];
  const rows = await fetchTable("stock_candidate_charts", {
    select: "date,code,close,high,low,return_pct,market_relative_return_pct,low_price_relative_return_pct",
    run_id: `eq.${state.run.run_id}`,
    code: `eq.${state.selectedCode}`,
    order: "date.asc",
  });
  state.charts = rows;
  return rows;
}

function drawChart(rows) {
  const canvas = els.priceChart;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.floor(rect.width * dpr));
  canvas.height = Math.floor(220 * dpr);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, 220);

  if (!rows.length) {
    els.chartMeta.textContent = "チャートデータがありません。";
    return;
  }
  const values = rows.map((r) => Number(r.close)).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 16;
  const w = rect.width || 360;
  const h = 220;
  const span = max - min || 1;

  ctx.strokeStyle = "#d9e0e8";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = pad + ((h - pad * 2) * i) / 3;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  rows.forEach((row, i) => {
    const x = pad + ((w - pad * 2) * i) / Math.max(rows.length - 1, 1);
    const y = h - pad - ((Number(row.close) - min) / span) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  els.chartMeta.textContent = `${rows[0].date} - ${rows[rows.length - 1].date} / close ${yen(values.at(-1))}`;
}

function renderDetail() {
  const row = state.candidates.find((r) => r.code === state.selectedCode);
  if (!row) {
    els.candidateDetail.innerHTML = `<div class="empty-state">候補を選択してください。</div>`;
    drawChart([]);
    return;
  }
  const ep = expectedPrice(row);
  const gain = ep == null ? null : ep - Number(row.close_price);
  els.candidateDetail.innerHTML = `
    <div class="card-title">
      <span class="code">${row.code}</span>
      <span class="name">${row.name || ""}</span>
      <span class="badge ${actionClass(row.suggested_action)}">${row.suggested_action}</span>
    </div>
    <div class="detail-grid">
      <div class="detail-item"><span>総合判断</span><strong>${stars(row.switch_priority_score)}</strong></div>
      <div class="detail-item"><span>スコア</span><strong>${number(row.switch_priority_score)}</strong></div>
      <div class="detail-item"><span>値段</span><strong>${yen(row.close_price)}</strong></div>
      <div class="detail-item"><span>期待値</span><strong>${number(row.expected_upside_pct)}%</strong></div>
      <div class="detail-item"><span>見込み上昇値</span><strong>+${yen(gain)}</strong></div>
      <div class="detail-item"><span>期待到達価格</span><strong>${yen(ep)}</strong></div>
      <div class="detail-item"><span>期待日数</span><strong>${number(row.expected_days_to_max_gain)}日</strong></div>
      <div class="detail-item"><span>下落リスク</span><strong>${number(row.expected_downside_pct)}%</strong></div>
    </div>
    <div class="signal-box"><strong>シグナル</strong><br>${row.signal_chain || row.signal_name || "-"}</div>
    <div class="signal-box"><strong>理由</strong><br>${row.reason || "-"}</div>
  `;
  loadChartForSelected().then(drawChart).catch((error) => {
    els.chartMeta.textContent = error.message;
  });
}

function render() {
  renderSummary();
  renderCandidates();
  renderDetail();
}

els.saveConfigButton.addEventListener("click", () => {
  const url = normalizeSupabaseUrl(els.supabaseUrlInput.value);
  const key = els.supabaseKeyInput.value.trim();
  if (!url || !key) return;
  saveConfig({ url, key });
  els.supabaseUrlInput.value = url;
  loadData().catch((error) => {
    showSetup(true);
    els.runStatus.textContent = error.message;
  });
});

els.clearConfigButton.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state.config = null;
  els.supabaseUrlInput.value = "";
  els.supabaseKeyInput.value = "";
  showSetup(true);
});

els.refreshButton.addEventListener("click", () => {
  loadData().catch((error) => {
    els.runStatus.textContent = error.message;
  });
});

els.actionFilter.addEventListener("change", () => {
  state.actionFilter = els.actionFilter.value;
  render();
});

async function initialize() {
  await clearOldServiceWorker();
  state.config = await loadPublicConfig();
  if (!state.config) state.config = loadConfig();
  showSetup(!state.config);
  loadData().catch((error) => {
    if (!state.config?.source || state.config.source !== "public") showSetup(true);
    els.runStatus.textContent = error.message;
  });
}

initialize();
