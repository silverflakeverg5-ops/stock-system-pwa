const STORAGE_KEY = "stock-system-pwa-config";
const APP_VERSION = "8";
const PUBLIC_CONFIG_PATH = `public-config.json?v=${APP_VERSION}`;

const ACTION_LABELS = {
  BUY_CANDIDATE: "買い候補",
  WATCH: "監視",
  WAIT: "待機",
  SKIP: "見送り",
  ALL: "すべて",
};

const MARKET_LABELS = {
  MARKET_VERY_STRONG: "かなり強い",
  MARKET_STRONG: "強い",
  MARKET_NEUTRAL: "中立",
  MARKET_WEAK: "弱い",
  MARKET_VERY_WEAK: "かなり弱い",
  UNKNOWN: "不明",
};

const SIGNAL_LABELS = {
  MA5_RECOVER: "5日線回復",
  MA25_RECOVER: "25日線回復",
  ABOVE_MA5: "5日線上",
  ABOVE_MA25: "25日線上",
  MA5_UPTREND: "5日線上向き",
  MA25_UPTREND: "25日線上向き",
  BREAK_PREV_HIGH: "前日高値突破",
  BREAK_3D_HIGH: "3日高値突破",
  BREAK_5D_HIGH: "5日高値突破",
  BREAK_10D_HIGH: "10日高値突破",
  BREAK_20D_HIGH: "20日高値突破",
  LOWER_SHADOW_LONG: "長い下ヒゲ",
  UPPER_SHADOW_LONG: "長い上ヒゲ",
  BULLISH_CANDLE: "陽線",
  BEARISH_CANDLE: "陰線",
  BULLISH_ENGULFING: "包み陽線",
  INSIDE_BAR: "はらみ足",
  NARROW_RANGE: "小幅もみ合い",
  RSI_RECOVER_30: "RSI30回復",
  RSI_RECOVER_35: "RSI35回復",
  RSI_RECOVER_40: "RSI40回復",
  RSI_RECOVER_50: "RSI50回復",
  RSI_OVERSOLD_LT30: "RSI売られすぎ",
  RSI_STRONG_GE70: "RSI強い",
  REBOUND_FROM_LOW: "安値から反発",
  STRONG_REBOUND: "強い反発",
  PRE5_UP: "5日上昇",
  PRE20_UP: "20日上昇",
  MOMENTUM_TURN: "勢い反転",
  PRE5_DOWN_GT_5: "5日-5%以上",
  PRE5_DOWN_GT_10: "5日-10%以上",
  PRE20_DOWN_GT_10: "20日-10%以上",
  PRE20_DOWN_GT_20: "20日-20%以上",
  PRE20_DOWN_GT_30: "20日-30%以上",
  DEEP_PULLBACK: "深押し",
  VOL_DRY_5: "5日出来高枯れ",
  VOL_DRY_20: "20日出来高枯れ",
  VOL_EXPAND_5: "5日出来高増",
  VOL_EXPAND_20: "20日出来高増",
  VOL_CLIMAX_20: "出来高急増",
  BB_LOW: "BB下限付近",
  BB_MID_RECOVER: "BB中央回復",
  BB_HIGH: "BB上限付近",
};

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
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  };
}

async function fetchTable(table, params = {}) {
  const baseUrl = normalizeSupabaseUrl(state.config.url);
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    headers: supabaseHeaders(),
    cache: "no-store",
  });
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

function actionLabel(action) {
  return ACTION_LABELS[action] || action || "-";
}

function marketLabel(market) {
  return MARKET_LABELS[market] || market || "-";
}

function signalLabel(signal) {
  return SIGNAL_LABELS[signal] || signal || "-";
}

function signalChainLabel(chain) {
  if (!chain) return "-";
  return String(chain)
    .split(" -> ")
    .map((part) => signalLabel(part.trim()))
    .join(" → ");
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

async function pickLatestRunWithCandidates(runs) {
  for (const run of runs) {
    const candidates = await fetchTable("stock_daily_candidates", {
      select: "*",
      run_id: `eq.${run.run_id}`,
      order: "rank.asc,switch_priority_score.desc",
      limit: "500",
    });
    if (candidates.length > 0) {
      return { run, candidates };
    }
  }
  return { run: runs[0] || null, candidates: [] };
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
    status: "eq.completed",
    order: "run_date.desc,created_at.desc",
    limit: "10",
  });
  if (!runs.length) throw new Error("stock_operation_runs にデータがありません。");

  const picked = await pickLatestRunWithCandidates(runs);
  state.run = picked.run;
  state.candidates = picked.candidates;
  if (!state.run) throw new Error("表示できるrunがありません。");

  const runId = state.run.run_id;
  const [judgements, market] = await Promise.all([
    fetchTable("stock_position_judgements", { select: "*", run_id: `eq.${runId}` }),
    fetchTable("stock_daily_market_summary", { select: "*", run_id: `eq.${runId}`, order: "date.desc", limit: "30" }),
  ]);

  state.judgements = judgements;
  state.market = market;
  state.selectedCode = state.candidates.find((r) => r.suggested_action === "BUY_CANDIDATE")?.code || state.candidates[0]?.code || null;
  render();
}

function renderSummary() {
  const market = state.market[0] || {};
  const buy = state.candidates.filter((r) => r.suggested_action === "BUY_CANDIDATE").length;
  const watch = state.candidates.filter((r) => r.suggested_action === "WATCH").length;
  const rawMarket = market.market_regime_5 || Object.keys(state.run?.report?.market_counts || {})[0] || "-";
  els.marketRegime.textContent = marketLabel(rawMarket);
  els.marketRegime.title = rawMarket;
  els.buyCount.textContent = String(buy);
  els.watchCount.textContent = String(watch);
  els.runDate.textContent = state.run?.run_date || "-";
  els.runStatus.textContent = `run_id: ${state.run?.run_id || "-"} / 表示候補 ${state.candidates.length}件`;
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
            <span class="badge ${actionClass(row.suggested_action)}">${actionLabel(row.suggested_action)}</span>
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
      <span class="badge ${actionClass(row.suggested_action)}">${actionLabel(row.suggested_action)}</span>
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
    <div class="signal-box"><strong>シグナル</strong><br>${signalChainLabel(row.signal_chain || row.signal_name)}</div>
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
