(function () {
  const APP_FIX_VERSION = "2";
  const STORAGE_KEY = "stock-system-pwa-config";
  const PUBLIC_CONFIG_PATH = `public-config.json?v=16-${APP_FIX_VERSION}`;
  const DESIRED_DETAIL_ORDER = [
    "総合判断",
    "スコア",
    "期待値",
    "期待日数",
    "現在価格",
    "期待到達価格",
    "見込み上昇値",
    "下落リスク",
  ];

  let configCache = null;
  let lastChartKey = "";

  function normalizeSupabaseUrl(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";
    try {
      return new URL(raw).origin;
    } catch {
      return raw.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "").replace(/\/+$/, "");
    }
  }

  async function loadConfig() {
    if (configCache) return configCache;
    try {
      const res = await fetch(PUBLIC_CONFIG_PATH, { cache: "no-store" });
      if (res.ok) {
        const publicConfig = await res.json();
        const url = normalizeSupabaseUrl(publicConfig.supabaseUrl || publicConfig.url);
        const key = String(publicConfig.supabaseKey || publicConfig.key || "").trim();
        if (url && key) {
          configCache = { url, key };
          return configCache;
        }
      }
    } catch {}

    try {
      const manualConfig = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      const url = normalizeSupabaseUrl(manualConfig?.url);
      const key = String(manualConfig?.key || "").trim();
      if (url && key) {
        configCache = { url, key };
        return configCache;
      }
    } catch {}
    return null;
  }

  async function fetchTable(table, params) {
    const config = await loadConfig();
    if (!config) throw new Error("Supabase接続設定がありません。");
    const url = new URL(`${config.url}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
    const res = await fetch(url, {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    return res.json();
  }

  function getSelectedCode() {
    return document.querySelector("#candidateDetail .code")?.textContent?.trim() || "";
  }

  function getCurrentRunId() {
    const text = document.querySelector("#runStatus")?.textContent || "";
    const match = text.match(/run_id:\s*([^\s/]+)/);
    return match ? match[1] : "";
  }

  function yen(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n).toLocaleString("ja-JP") : "-";
  }

  function closeValue(row) {
    return Number(row.close ?? row.close_price);
  }

  function drawChart(rows) {
    const canvas = document.querySelector("#priceChart");
    const meta = document.querySelector("#chartMeta");
    if (!canvas || !meta) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = rect.width || 360;
    const cssHeight = 220;
    canvas.width = Math.max(320, Math.floor(cssWidth * dpr));
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const values = rows.map(closeValue).filter(Number.isFinite);
    if (!rows.length || !values.length) {
      meta.textContent = "チャートデータがありません。";
      return;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pad = 16;
    const w = cssWidth;
    const h = cssHeight;

    ctx.strokeStyle = "#d9e0e8";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
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
      const y = h - pad - ((closeValue(row) - min) / span) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    meta.textContent = `${rows[0].date} - ${rows[rows.length - 1].date} / 終値 ${yen(values[values.length - 1])}`;
  }

  async function loadChartRows(code) {
    const select = "date,code,open,high,low,close,return_pct,market_relative_return_pct,low_price_relative_return_pct";
    const runId = getCurrentRunId();
    if (runId) {
      const currentRows = await fetchTable("stock_candidate_charts", {
        select,
        run_id: `eq.${runId}`,
        code: `eq.${code}`,
        order: "date.asc",
      });
      if (currentRows.length) return currentRows;
    }
    const latestRows = await fetchTable("stock_candidate_charts", {
      select,
      code: `eq.${code}`,
      order: "date.desc",
      limit: "60",
    });
    return latestRows.reverse();
  }

  async function refreshChart() {
    const code = getSelectedCode();
    const runId = getCurrentRunId();
    const key = `${runId}:${code}`;
    if (!code || key === lastChartKey) return;
    lastChartKey = key;
    try {
      const rows = await loadChartRows(code);
      drawChart(rows);
    } catch (error) {
      const meta = document.querySelector("#chartMeta");
      if (meta) meta.textContent = error.message;
    }
  }

  function reorderDetailItems() {
    const grid = document.querySelector(".detail-grid");
    if (!grid) return;
    const items = Array.from(grid.querySelectorAll(".detail-item"));
    if (!items.length) return;

    for (const item of items) {
      const label = item.querySelector("span");
      if (label?.textContent?.trim() === "値段") label.textContent = "現在価格";
    }

    const byLabel = new Map(items.map((item) => [item.querySelector("span")?.textContent?.trim(), item]));
    const ordered = [];
    for (const label of DESIRED_DETAIL_ORDER) {
      const item = byLabel.get(label);
      if (item && !ordered.includes(item)) ordered.push(item);
    }
    for (const item of items) {
      if (!ordered.includes(item)) ordered.push(item);
    }

    const currentSignature = items.map((item) => item.querySelector("span")?.textContent?.trim()).join("|");
    const nextSignature = ordered.map((item) => item.querySelector("span")?.textContent?.trim()).join("|");
    if (currentSignature !== nextSignature && ordered.length === items.length) {
      ordered.forEach((item) => grid.appendChild(item));
    }
  }

  function refreshFixes() {
    reorderDetailItems();
    refreshChart();
  }

  const observer = new MutationObserver(() => {
    window.setTimeout(refreshFixes, 50);
  });

  window.addEventListener("DOMContentLoaded", () => {
    observer.observe(document.body, { childList: true, subtree: true });
    refreshFixes();
  });
  window.addEventListener("resize", () => {
    lastChartKey = "";
    refreshChart();
  });
})();
