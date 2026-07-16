const STORAGE_KEY = "stock-system-pwa-config";
const CLIENT_ID_KEY = "stock-system-client-id";
const CASH_KEY = "stock-system-initial-cash";
const APP_VERSION = "15";
const PUBLIC_CONFIG_PATH = `public-config.json?v=${APP_VERSION}`;
const PAGE_SIZE = 1000;
const MAX_CANDIDATE_ROWS = 10000;

const ACTION_LABELS = {
  BUY_CANDIDATE: "買い候補",
  WATCH: "監視",
  WAIT: "待機",
  SKIP: "見送り",
  ALL: "すべて",
};

const MANUAL_ACTION_LABELS = {
  BUY_EXECUTED: "買った",
  SKIP_DECIDED: "見送った",
  SELL_EXECUTED: "決済した",
  MEMO: "メモ",
  WATCH_ADDED: "監視中",
  WATCH_REMOVED: "監視解除",
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
  market: [],
  manualActions: [],
  selectedCode: null,
  actionFilter: "BUY_CANDIDATE",
  activeTab: "candidates",
  initialCash: Number(localStorage.getItem(CASH_KEY) || 100000),
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
  holdingCount: document.querySelector("#holdingCount"),
  runDate: document.querySelector("#runDate"),
  runStatus: document.querySelector("#runStatus"),
  candidateList: document.querySelector("#candidateList"),
  actionFilter: document.querySelector("#actionFilter"),
  detailSection: document.querySelector("#detailSection"),
  candidateDetail: document.querySelector("#candidateDetail"),
  priceChart: document.querySelector("#priceChart"),
  chartMeta: document.querySelector("#chartMeta"),
  tabButtons: document.querySelectorAll(".tab-button"),
  tabViews: document.querySelectorAll(".tab-view"),
  initialCashInput: document.querySelector("#initialCashInput"),
  saveCashButton: document.querySelector("#saveCashButton"),
  availableCash: document.querySelector("#availableCash"),
  totalEquity: document.querySelector("#totalEquity"),
  unrealizedPnl: document.querySelector("#unrealizedPnl"),
  realizedPnl: document.querySelector("#realizedPnl"),
  holdingsList: document.querySelector("#holdingsList"),
  watchlistList: document.querySelector("#watchlistList"),
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
    return raw.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "").replace(/\/+$/, "");
  }
}

function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = `client_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function loadManualConfig() {
  try {
    const config = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!config) return null;
    return { ...config, url: normalizeSupabaseUrl(config.url), source: "manual" };
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

function supabaseHeaders(extra = {}) {
  return {
    apikey: state.config.key,
    Authorization: `Bearer ${state.config.key}`,
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    ...extra,
  };
}

async function fetchTable(table, params = {}) {
  const baseUrl = normalizeSupabaseUrl(state.config.url);
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { headers: supabaseHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function insertTable(table, row) {
  const baseUrl = normalizeSupabaseUrl(state.config.url);
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  const res = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchTablePaged(table, params = {}, pageSize = PAGE_SIZE, maxRows = MAX_CANDIDATE_ROWS) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const page = await fetchTable(table, { ...params, limit: String(pageSize), offset: String(offset) });
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

const number = (value, digits = 1) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "-";
};
const yen = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n).toLocaleString("ja-JP") : "-";
};
const yenSigned = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n >= 0 ? "+" : "-"}${yen(Math.abs(n))}`;
};
const pctSigned = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
};

function stars(score) {
  const n = Number(score);
  const count = Math.max(1, Math.min(5, Math.ceil((Number.isFinite(n) ? n : 0) / 20)));
  return "★".repeat(count) + "☆".repeat(5 - count);
}

const actionLabel = (action) => ACTION_LABELS[action] || action || "-";
const manualActionLabel = (action) => MANUAL_ACTION_LABELS[action] || action || "-";
const marketLabel = (market) => MARKET_LABELS[market] || market || "-";
const signalLabel = (signal) => SIGNAL_LABELS[signal] || String(signal || "-").replaceAll("_", " ");
const signalChainLabel = (chain) => chain ? String(chain).split(" -> ").map((part) => signalLabel(part.trim())).join(" → ") : "-";

function expectedPrice(row) {
  const price = Number(row.close_price);
  const upside = Number(row.expected_upside_pct);
  return Number.isFinite(price) && Number.isFinite(upside) ? price * (1 + upside / 100) : null;
}

function actionClass(action) {
  if (action === "BUY_CANDIDATE") return "buy";
  if (action === "WATCH") return "watch";
  return "skip";
}

function latestManualAction(code) {
  return state.manualActions
    .filter((row) => String(row.code) === String(code))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] || null;
}

function latestCandidate(code) {
  return state.candidates.find((row) => String(row.code) === String(code));
}

function selectCandidate(code, shouldScroll = false) {
  state.selectedCode = code;
  state.activeTab = "candidates";
  render();
  if (shouldScroll && els.detailSection) requestAnimationFrame(() => els.detailSection.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function setActiveTab(tab) {
  state.activeTab = tab;
  render();
}

async function getNewestRunWithCandidates() {
  const runs = await fetchTable("stock_operation_runs", { select: "*", order: "created_at.desc", limit: "20" });
  for (const run of runs) {
    const candidates = await fetchTablePaged("stock_daily_candidates", {
      select: "*",
      run_id: `eq.${run.run_id}`,
      order: "rank.asc,switch_priority_score.desc",
    });
    if (candidates.length > 0) return { run, candidates };
  }
  const fallback = await fetchTablePaged("stock_daily_candidates", { select: "*", order: "created_at.desc" });
  if (!fallback.length) return { run: null, candidates: [] };
  const runId = fallback[0].run_id;
  return {
    run: { run_id: runId, run_date: fallback[0].run_date, report: {} },
    candidates: fallback.filter((row) => row.run_id === runId).sort((a, b) => Number(a.rank || 9999) - Number(b.rank || 9999)),
  };
}

async function loadManualActions() {
  try {
    return await fetchTable("stock_manual_actions", {
      select: "*",
      client_id: `eq.${getClientId()}`,
      order: "created_at.desc",
      limit: "2000",
    });
  } catch (error) {
    console.warn("manual actions are not available yet", error);
    return [];
  }
}

async function loadData() {
  if (!state.config?.url || !state.config?.key) {
    showSetup(true);
    els.runStatus.textContent = "Supabase接続設定を入力してください。";
    return;
  }
  showSetup(false);
  els.runStatus.textContent = `読み込み中... ${normalizeSupabaseUrl(state.config.url)}`;
  const picked = await getNewestRunWithCandidates();
  if (!picked.run || !picked.candidates.length) throw new Error("表示できる候補がありません。");
  const market = await fetchTable("stock_daily_market_summary", {
    select: "*",
    run_id: `eq.${picked.run.run_id}`,
    order: "date.desc",
    limit: "30",
  });
  state.run = picked.run;
  state.candidates = picked.candidates;
  state.market = market;
  state.manualActions = await loadManualActions();
  state.selectedCode = state.candidates.find((r) => r.suggested_action === "BUY_CANDIDATE")?.code || state.candidates[0]?.code || null;
  render();
}

function buildPortfolio() {
  const actions = [...state.manualActions].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const positions = new Map();
  let cash = Number(state.initialCash) || 0;
  let realized = 0;
  for (const action of actions) {
    const code = String(action.code);
    if (!positions.has(code)) {
      positions.set(code, { code, name: action.name || latestCandidate(code)?.name || "", qty: 0, cost: 0, unknownOpen: false, lastAction: action });
    }
    const pos = positions.get(code);
    pos.name = pos.name || action.name || latestCandidate(code)?.name || "";
    pos.lastAction = action;
    const price = Number(action.action_price);
    const qty = Number(action.quantity);
    if (action.action_type === "BUY_EXECUTED") {
      if (Number.isFinite(price) && Number.isFinite(qty) && qty > 0) {
        pos.qty += qty;
        pos.cost += price * qty;
        cash -= price * qty;
      } else {
        pos.unknownOpen = true;
      }
    }
    if (action.action_type === "SELL_EXECUTED") {
      if (Number.isFinite(price) && Number.isFinite(qty) && qty > 0 && pos.qty > 0) {
        const sellQty = Math.min(qty, pos.qty);
        const avg = pos.cost / pos.qty;
        realized += (price - avg) * sellQty;
        pos.qty -= sellQty;
        pos.cost -= avg * sellQty;
        cash += price * sellQty;
      } else {
        pos.unknownOpen = false;
      }
    }
  }
  const holdings = [...positions.values()].filter((pos) => pos.qty > 0 || pos.unknownOpen).map((pos) => {
    const candidate = latestCandidate(pos.code) || {};
    const currentPrice = Number(candidate.close_price) || Number(pos.lastAction?.action_price) || 0;
    const marketValue = pos.qty > 0 ? currentPrice * pos.qty : null;
    const avgPrice = pos.qty > 0 ? pos.cost / pos.qty : null;
    const unrealized = pos.qty > 0 ? marketValue - pos.cost : null;
    const unrealizedPct = pos.qty > 0 && pos.cost > 0 ? (unrealized / pos.cost) * 100 : null;
    return { ...pos, candidate, currentPrice, marketValue, avgPrice, unrealized, unrealizedPct };
  });
  const marketValue = holdings.reduce((sum, pos) => sum + (Number(pos.marketValue) || 0), 0);
  const unrealized = holdings.reduce((sum, pos) => sum + (Number(pos.unrealized) || 0), 0);
  return { holdings, cash, marketValue, totalEquity: cash + marketValue, realized, unrealized };
}

function buildUserWatchlist() {
  const latestByCode = new Map();
  for (const action of state.manualActions) {
    if (!["WATCH_ADDED", "WATCH_REMOVED"].includes(action.action_type)) continue;
    const old = latestByCode.get(String(action.code));
    if (!old || String(action.created_at || "") > String(old.created_at || "")) latestByCode.set(String(action.code), action);
  }
  return [...latestByCode.values()]
    .filter((action) => action.action_type === "WATCH_ADDED")
    .map((action) => ({ action, candidate: latestCandidate(action.code) || action.candidate_payload || {} }));
}

function renderTabs() {
  els.tabButtons.forEach((button) => button.classList.toggle("active", button.dataset.tab === state.activeTab));
  els.tabViews.forEach((view) => view.classList.toggle("active", view.id === `${state.activeTab}View`));
}

function renderSummary() {
  const portfolio = buildPortfolio();
  const market = state.market[0] || {};
  const buy = state.candidates.filter((r) => r.suggested_action === "BUY_CANDIDATE").length;
  const rawMarket = market.market_regime_5 || state.candidates[0]?.market_regime_5 || Object.keys(state.run?.report?.market_counts || {})[0] || "-";
  els.marketRegime.textContent = marketLabel(rawMarket);
  els.marketRegime.title = rawMarket;
  els.buyCount.textContent = String(buy);
  els.holdingCount.textContent = String(portfolio.holdings.length);
  els.runDate.textContent = state.run?.run_date || state.candidates[0]?.run_date || "-";
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
    const manual = latestManualAction(row.code);
    const manualBadge = manual ? `<span class="manual-badge">${manualActionLabel(manual.action_type)}</span>` : "";
    return `
      <button class="candidate-card${active}" data-code="${row.code}" type="button">
        <div>
          <div class="card-title">
            <span class="code">${row.code}</span>
            <span class="name">${row.name || ""}</span>
            <span class="badge ${actionClass(row.suggested_action)}">${actionLabel(row.suggested_action)}</span>
            ${manualBadge}
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
    button.addEventListener("click", () => selectCandidate(button.dataset.code, true));
  });
}

async function loadChartForSelected() {
  if (!state.selectedCode || !state.run) return [];
  return fetchTable("stock_candidate_charts", {
    select: "date,code,close,high,low,return_pct,market_relative_return_pct,low_price_relative_return_pct",
    run_id: `eq.${state.run.run_id}`,
    code: `eq.${state.selectedCode}`,
    order: "date.asc",
  });
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
  els.chartMeta.textContent = `${rows[0].date} - ${rows[rows.length - 1].date} / close ${yen(values[values.length - 1])}`;
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
  const manual = latestManualAction(row.code);
  const manualText = manual ? `${manualActionLabel(manual.action_type)} / ${manual.created_at ? new Date(manual.created_at).toLocaleString("ja-JP") : "時刻不明"}` : "未記録";
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
    <div class="manual-panel">
      <strong>運用記録</strong>
      <p id="manualActionStatus">${manualText}</p>
      <div class="manual-grid">
        <label>約定/判断価格<input id="manualPriceInput" type="number" inputmode="decimal" value="${Number(row.close_price) || ""}" /></label>
        <label>株数<input id="manualQuantityInput" type="number" inputmode="numeric" placeholder="任意" /></label>
      </div>
      <textarea id="manualMemoInput" rows="2" placeholder="任意メモ。例: 寄りで買い、板薄いので見送り等"></textarea>
      <div class="manual-actions">
        <button class="primary-button" data-manual-action="BUY_EXECUTED" type="button">買った</button>
        <button class="ghost-button" data-manual-action="SKIP_DECIDED" type="button">見送った</button>
        <button class="ghost-button" data-manual-action="SELL_EXECUTED" type="button">決済した</button>
        <button class="ghost-button" data-manual-action="WATCH_ADDED" type="button">監視追加</button>
        <button class="ghost-button" data-manual-action="WATCH_REMOVED" type="button">監視解除</button>
        <button class="ghost-button" data-manual-action="MEMO" type="button">メモ保存</button>
      </div>
    </div>
    <div class="signal-box"><strong>シグナル</strong><br>${signalChainLabel(row.signal_chain || row.signal_name)}</div>
    <div class="signal-box"><strong>理由</strong><br>${row.reason || "-"}</div>
  `;
  els.candidateDetail.querySelectorAll("[data-manual-action]").forEach((button) => {
    button.addEventListener("click", () => saveManualAction(row, button.dataset.manualAction));
  });
  loadChartForSelected().then(drawChart).catch((error) => { els.chartMeta.textContent = error.message; });
}

function renderPortfolio() {
  const p = buildPortfolio();
  els.initialCashInput.value = Number(state.initialCash) || 100000;
  els.availableCash.textContent = yen(p.cash);
  els.totalEquity.textContent = yen(p.totalEquity);
  els.unrealizedPnl.textContent = yenSigned(p.unrealized);
  els.realizedPnl.textContent = yenSigned(p.realized);
  if (!p.holdings.length) {
    els.holdingsList.innerHTML = `<div class="empty-state">保有記録はまだありません。詳細画面で株数を入れて「買った」を保存してください。</div>`;
    return;
  }
  els.holdingsList.innerHTML = p.holdings.map((pos) => `
    <button class="candidate-card" data-code="${pos.code}" type="button">
      <div>
        <div class="card-title"><span class="code">${pos.code}</span><span class="name">${pos.name || ""}</span><span class="manual-badge">保有中</span></div>
        <div class="card-numbers">
          <span>数量 ${pos.qty > 0 ? number(pos.qty, 0) : "未入力"}</span>
          <span>平均 ${pos.avgPrice ? yen(pos.avgPrice) : "-"}</span>
          <span>現在 ${yen(pos.currentPrice)}</span>
          <span>評価 ${pos.marketValue ? yen(pos.marketValue) : "-"}</span>
          <span>損益 ${pos.unrealized == null ? "-" : yenSigned(pos.unrealized)} ${pos.unrealizedPct == null ? "" : `(${pctSigned(pos.unrealizedPct)})`}</span>
        </div>
      </div>
    </button>
  `).join("");
  els.holdingsList.querySelectorAll(".candidate-card").forEach((button) => button.addEventListener("click", () => selectCandidate(button.dataset.code, true)));
}

function renderWatchlist() {
  const rows = buildUserWatchlist();
  if (!rows.length) {
    els.watchlistList.innerHTML = `<div class="empty-state">ユーザー監視銘柄はまだありません。詳細画面から「監視追加」を押してください。</div>`;
    return;
  }
  els.watchlistList.innerHTML = rows.map(({ action, candidate }) => {
    const ep = expectedPrice(candidate);
    const gain = ep == null ? null : ep - Number(candidate.close_price);
    return `
      <button class="candidate-card" data-code="${action.code}" type="button">
        <div>
          <div class="card-title"><span class="code">${action.code}</span><span class="name">${candidate.name || action.name || ""}</span><span class="manual-badge">監視中</span></div>
          <div class="card-numbers">
            <span>値段 ${yen(candidate.close_price || action.action_price)}</span>
            <span>期待 ${number(candidate.expected_upside_pct)}%</span>
            <span>見込み +${yen(gain)}</span>
            <span>追加 ${action.created_at ? new Date(action.created_at).toLocaleDateString("ja-JP") : "-"}</span>
          </div>
        </div>
      </button>`;
  }).join("");
  els.watchlistList.querySelectorAll(".candidate-card").forEach((button) => button.addEventListener("click", () => selectCandidate(button.dataset.code, true)));
}

async function saveManualAction(row, actionType) {
  const status = document.querySelector("#manualActionStatus");
  const price = Number(document.querySelector("#manualPriceInput")?.value || row.close_price);
  const quantityRaw = document.querySelector("#manualQuantityInput")?.value;
  const quantity = quantityRaw ? Number(quantityRaw) : null;
  const memo = document.querySelector("#manualMemoInput")?.value || "";
  const payload = {
    run_id: state.run?.run_id || row.run_id,
    run_date: state.run?.run_date || row.run_date,
    code: String(row.code),
    name: row.name || null,
    action_type: actionType,
    trade_status: actionType === "BUY_EXECUTED" ? "BOUGHT" : actionType === "SELL_EXECUTED" ? "SOLD" : actionType === "SKIP_DECIDED" ? "SKIPPED" : actionType === "WATCH_ADDED" ? "WATCHING" : actionType === "WATCH_REMOVED" ? "UNWATCHED" : "MEMO",
    action_price: Number.isFinite(price) ? price : null,
    quantity: Number.isFinite(quantity) ? quantity : null,
    memo,
    client_id: getClientId(),
    candidate_payload: row,
  };
  try {
    if (status) status.textContent = "保存中...";
    const saved = await insertTable("stock_manual_actions", payload);
    state.manualActions = [...saved, ...state.manualActions];
    if (status) status.textContent = `${manualActionLabel(actionType)} を保存しました`;
    render();
  } catch (error) {
    if (status) status.textContent = `保存できませんでした: ${error.message}`;
  }
}

function render() {
  renderTabs();
  renderSummary();
  renderCandidates();
  renderDetail();
  renderPortfolio();
  renderWatchlist();
}

els.saveConfigButton.addEventListener("click", () => {
  const url = normalizeSupabaseUrl(els.supabaseUrlInput.value);
  const key = els.supabaseKeyInput.value.trim();
  if (!url || !key) return;
  saveConfig({ url, key });
  els.supabaseUrlInput.value = url;
  loadData().catch((error) => { showSetup(true); els.runStatus.textContent = error.message; });
});
els.clearConfigButton.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state.config = null;
  els.supabaseUrlInput.value = "";
  els.supabaseKeyInput.value = "";
  showSetup(true);
});
els.refreshButton.addEventListener("click", () => loadData().catch((error) => { els.runStatus.textContent = error.message; }));
els.actionFilter.addEventListener("change", () => { state.actionFilter = els.actionFilter.value; render(); });
els.tabButtons.forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.tab)));
els.saveCashButton.addEventListener("click", () => {
  const cash = Number(els.initialCashInput.value || 0);
  if (Number.isFinite(cash) && cash > 0) {
    state.initialCash = cash;
    localStorage.setItem(CASH_KEY, String(cash));
    renderPortfolio();
  }
});

async function initialize() {
  await clearOldServiceWorker();
  state.config = await loadPublicConfig();
  if (!state.config) state.config = loadManualConfig();
  showSetup(!state.config);
  loadData().catch((error) => {
    if (!state.config?.source || state.config.source !== "public") showSetup(true);
    els.runStatus.textContent = error.message;
  });
}
initialize();
