import { APP_CONFIG } from "../config.js";
import { getContentConfig } from "../api/content.adapter.js";
import { getLiveTicker } from "../api/market.adapter.js";
import { createTrade, listTrades, resolveTrade } from "../api/trade.adapter.js";
import { getBalance } from "../api/wallet.adapter.js";
import { renderBannerBlock } from "../components/banner.js";
import { formatCurrency, formatDateTime } from "../store.js";
import { showToast } from "../components/toast.js";
import { updateHeaderBalance } from "../components/header.js";

const MARKET_TICK_MS = 900;
const RESOLVE_TICK_MS = 1200;
const MIN_TRADE_AMOUNT = 2;
const DEFAULT_HISTORY_WINDOW = "1h";
const DEFAULT_CANDLE_INTERVAL = "5m";
const DEFAULT_SENSITIVITY = "medium";

const TIMEFRAME_OPTIONS = [
  { key: "1h", label: "1 hora", seconds: 3600, points: 90 },
  { key: "2h", label: "2 horas", seconds: 7200, points: 98 },
  { key: "5h", label: "5 horas", seconds: 18000, points: 112 },
  { key: "10h", label: "10 horas", seconds: 36000, points: 128 },
  { key: "15h", label: "15 horas", seconds: 54000, points: 144 },
  { key: "1d", label: "1 dia", seconds: 86400, points: 164 },
  { key: "2d", label: "2 dias", seconds: 172800, points: 184 },
];

const SENSITIVITY_OPTIONS = [
  { key: "low", label: "Baixa" },
  { key: "medium", label: "Média" },
  { key: "high", label: "Alta" },
];

function statusBadge(status) {
  if (status === "OPEN") return '<span class="badge badge-pending">OPEN</span>';
  if (status === "WIN") return '<span class="badge badge-win">WIN</span>';
  return '<span class="badge badge-loss">LOSS</span>';
}

function getCandleIntervalMs(intervalKey) {
  const available = Array.isArray(APP_CONFIG.candleIntervals) ? APP_CONFIG.candleIntervals : [];
  return available.find((item) => item.key === intervalKey)?.ms || 5 * 60 * 1000;
}

function getPriceDecimals(symbolConfig) {
  const base = Number(symbolConfig?.precision || 2);
  if (symbolConfig?.marketType === "crypto") return Math.max(2, Math.min(6, base + 2));
  return Math.max(2, Math.min(4, base));
}

function findSymbolConfig(code) {
  return APP_CONFIG.symbols.find((item) => item.code === code) || APP_CONFIG.symbols[0];
}

function findSymbolConfigByLabel(label) {
  return APP_CONFIG.symbols.find((item) => item.label === label) || APP_CONFIG.symbols[0];
}

function groupedSymbolOptions(selectedCode) {
  const crypto = APP_CONFIG.symbols.filter((symbol) => symbol.marketType === "crypto");
  const stocks = APP_CONFIG.symbols.filter((symbol) => symbol.marketType === "stock");

  const buildOptions = (symbols) =>
    symbols
      .map(
        (symbol) =>
          `<option value="${symbol.code}" ${selectedCode === symbol.code ? "selected" : ""}>${symbol.label}</option>`,
      )
      .join("");

  return `
    <optgroup label="Cripto">
      ${buildOptions(crypto)}
    </optgroup>
    <optgroup label="Ações (somente visualização)">
      ${buildOptions(stocks)}
    </optgroup>
  `;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function timeframePointCount(key) {
  return TIMEFRAME_OPTIONS.find((item) => item.key === key)?.points || 90;
}

function generateHistorySeries(seedPrice, size, symbolConfig) {
  const points = [Number(seedPrice || 1)];
  const volatility = symbolConfig?.marketType === "stock" ? 0.00035 : 0.00075;

  for (let i = 1; i < size; i += 1) {
    const previous = points[i - 1];
    const direction = Math.random() > 0.5 ? 1 : -1;
    const magnitude = Math.random() * volatility;
    const next = previous * (1 + direction * magnitude);
    points.push(Number(Math.max(next, 0.0000001).toFixed(8)));
  }

  return points;
}

function buildCandles(points) {
  if (!Array.isArray(points) || points.length < 2) return [];

  const candles = [];
  for (let i = 1; i < points.length; i += 1) {
    const open = Number(points[i - 1]);
    const close = Number(points[i]);
    const body = Math.abs(close - open);
    const wickBase = Math.max(body * 0.42, Math.abs(close) * 0.00003, 0.000001);
    const high = Math.max(open, close) + wickBase;
    const low = Math.min(open, close) - wickBase;
    candles.push({ open, high, low, close });
  }

  return candles;
}

function cropPointsForDisplay(points, maxPoints) {
  if (!Array.isArray(points) || !points.length) return [];
  const safeMax = Math.max(18, Math.floor(maxPoints));
  if (points.length <= safeMax) return points;
  return points.slice(points.length - safeMax);
}

function computeAxis(
  candles,
  latestPrice,
  currentAxis,
  symbolConfig,
  extraLevels = [],
  historyWindow = "1h",
  sensitivity = DEFAULT_SENSITIVITY,
) {
  const windowCandles = candles.slice(-Math.min(candles.length, 56));
  const allLevels = windowCandles.flatMap((candle) => [candle.low, candle.high]);
  allLevels.push(Number(latestPrice || 0));
  extraLevels.forEach((value) => {
    if (Number.isFinite(value)) allLevels.push(Number(value));
  });

  const validLevels = allLevels.filter((value) => Number.isFinite(value) && value > 0);
  const fallback = Number(latestPrice || 1);

  const current = Number.isFinite(latestPrice) && latestPrice > 0 ? latestPrice : fallback;
  const rawMin = validLevels.length ? Math.min(...validLevels) : fallback;
  const rawMax = validLevels.length ? Math.max(...validLevels) : fallback;

  const distance = Math.max(current - rawMin, rawMax - current);
  const isCrypto = symbolConfig?.marketType === "crypto";
  const windowScaleMap = { "1h": 1, "2h": 1.04, "5h": 1.08, "10h": 1.13, "15h": 1.18, "1d": 1.24, "2d": 1.32 };
  const windowScale = windowScaleMap[historyWindow] || 1;
  const axisSensitivityScaleMap = { low: 1.22, medium: 1, high: 0.8 };
  const axisSensitivityScale = axisSensitivityScaleMap[sensitivity] || 1;
  const minHalfRange = Math.max(current * (isCrypto ? 0.00032 : 0.0012), isCrypto ? 10 : 0.8);
  const maxHalfRange = Math.max(current * (isCrypto ? 0.00155 : 0.0052), isCrypto ? 110 : 7);
  const scaledDistance = distance * windowScale * axisSensitivityScale;
  const targetHalfRange = clamp(Math.max(scaledDistance * 1.35, minHalfRange), minHalfRange, maxHalfRange);

  let min = current - targetHalfRange;
  let max = current + targetHalfRange;

  if (currentAxis && Number.isFinite(currentAxis.min) && Number.isFinite(currentAxis.max)) {
    const alpha = isCrypto ? 0.26 : 0.18;
    min = currentAxis.min + (min - currentAxis.min) * alpha;
    max = currentAxis.max + (max - currentAxis.max) * alpha;
  }

  if (rawMin < min) min = rawMin - targetHalfRange * 0.06;
  if (rawMax > max) max = rawMax + targetHalfRange * 0.06;

  const spread = Math.max(max - min, 0.0000001);
  return { min, max, spread };
}

function renderCandlesHtml(candles, axis) {
  return candles
    .map((candle) => {
      const highPct = ((candle.high - axis.min) / axis.spread) * 100;
      const lowPct = ((candle.low - axis.min) / axis.spread) * 100;
      const openPct = ((candle.open - axis.min) / axis.spread) * 100;
      const closePct = ((candle.close - axis.min) / axis.spread) * 100;

      const safeHigh = clamp(highPct, 0, 100);
      const safeLow = clamp(lowPct, 0, 100);
      const safeOpen = clamp(openPct, 0, 100);
      const safeClose = clamp(closePct, 0, 100);
      const wickBottom = Math.min(safeLow, safeHigh);
      const wickHeight = clamp(Math.max(1.2, Math.abs(safeHigh - safeLow)), 1.2, 40);
      const bodyBottom = Math.min(safeOpen, safeClose);
      const bodyHeight = clamp(Math.max(1.4, Math.abs(safeClose - safeOpen)), 1.4, 26);
      const dir = candle.close >= candle.open ? "up" : "down";

      return `
        <div class="tradepro-candle ${dir}">
          <div class="tradepro-wick" style="bottom:${wickBottom}%;height:${wickHeight}%;"></div>
          <div class="tradepro-body" style="bottom:${bodyBottom}%;height:${bodyHeight}%;"></div>
        </div>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function renderTradeView(container) {
  const contentConfig = await getContentConfig();
  let wallet = await getBalance();
  let trades = await listTrades();

  let selectedSymbolCode = APP_CONFIG.symbols[0]?.code || "BTCUSD";
  let selectedHistoryWindow = DEFAULT_HISTORY_WINDOW;
  let selectedCandleInterval = DEFAULT_CANDLE_INTERVAL;
  let selectedSensitivity = DEFAULT_SENSITIVITY;

  let latestTicker = await getLiveTicker(findSymbolConfig(selectedSymbolCode));
  let maxSeriesLength = timeframePointCount(selectedHistoryWindow);
  let chartSeries = generateHistorySeries(latestTicker.price, maxSeriesLength + 1, findSymbolConfig(selectedSymbolCode));

  let chartAxis = null;
  let lastRender = null;
  let followLatest = true;
  let viewOffset = 0;
  let marketTimer = null;
  let resolveTimer = null;
  let staleTicks = 0;
  let ticksSinceRebuild = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartOffset = 0;

  container.innerHTML = `
    <section class="main-content anim-fade-up tradepro-page">
      <div class="tradepro-grid">
        <article class="section-card tradepro-market-card">
          <div class="section-header tradepro-market-head">
            <h3 class="tradepro-title-wrap">
              <span>Painel de Mercado (Preço ao Vivo)</span>
              <img src="./assets/bye-trade-logo.png" alt="Bye Trader" class="tradepro-title-logo" />
            </h3>
            <span class="badge badge-pending" id="market-source-badge">${escapeHtml(String(latestTicker.source || "MARKET")).toUpperCase()}</span>
          </div>

          <div class="metric-inline tradepro-kpis">
            <div class="metric-item">
              <small>Preço real do ativo</small>
              <strong class="mono" id="market-price">${Number(latestTicker.price || 0).toFixed(getPriceDecimals(findSymbolConfig(selectedSymbolCode)))}</strong>
            </div>
            <div class="metric-item">
              <small>Variação tick</small>
              <strong class="mono" id="market-variation">0.000%</strong>
            </div>
            <div class="metric-item">
              <small>Saldo</small>
              <strong class="mono" id="trade-balance">${formatCurrency(wallet.available)}</strong>
            </div>
          </div>

          <div class="chart-topbar mono" id="chart-ohlc">Carregando OHLC...</div>

          <div class="chart" id="market-chart">
            <div class="chart-grid-layer"></div>
            <div class="chart-candles-layer" id="market-chart-candles"></div>
            <div class="chart-order-lines" id="market-chart-order-lines"></div>
            <div class="chart-side-layer">
              <div class="chart-price-scale mono" id="chart-price-scale"></div>
              <div class="chart-live-price mono" id="chart-live-price"></div>
            </div>
            <div class="chart-crosshair-x hidden" id="crosshair-x"></div>
            <div class="chart-crosshair-y hidden" id="crosshair-y"></div>
            <div class="chart-tooltip hidden" id="chart-tooltip"></div>
          </div>

          <div class="chart-controls tradepro-controls">
            <div class="chart-intervals">
              ${(APP_CONFIG.candleIntervals || [])
                .map(
                  (item) => `<button type="button" class="btn btn-secondary chart-control-btn ${item.key === selectedCandleInterval ? "active" : ""}" data-interval="${item.key}">${item.label}</button>`,
                )
                .join("")}
            </div>

            <div class="chart-zoom-controls">
              <button type="button" class="btn btn-secondary chart-control-btn" id="chart-reset">Reset</button>
              <button type="button" class="btn btn-secondary chart-control-btn active" id="chart-follow">Ao vivo</button>
              <button type="button" class="btn btn-secondary chart-control-btn" id="chart-fullscreen">Tela cheia</button>
            </div>

            <div class="chart-sensitivity">
              ${SENSITIVITY_OPTIONS.map(
                (item) =>
                  `<button type="button" class="btn btn-secondary chart-control-btn ${item.key === selectedSensitivity ? "active" : ""}" data-sensitivity="${item.key}">${item.label}</button>`,
              ).join("")}
            </div>

            <div class="chart-timeframes">
              ${TIMEFRAME_OPTIONS.map(
                (item) => `<button type="button" class="btn btn-secondary chart-control-btn ${item.key === selectedHistoryWindow ? "active" : ""}" data-timeframe="${item.key}">${item.label}</button>`,
              ).join("")}
            </div>
          </div>
        </article>

        <article class="section-card tradepro-order-card">
          <div class="section-header">
            <h3>Nova Operação Binária</h3>
            <small class="help-text mono">Payout ${Math.round(APP_CONFIG.payoutRate * 100)}%</small>
          </div>

          <form id="trade-form" class="form-grid">
            <div class="field">
              <label for="trade-symbol">Ativo</label>
              <select class="select" id="trade-symbol">${groupedSymbolOptions(selectedSymbolCode)}</select>
            </div>

            <div class="field">
              <label for="trade-amount">Valor da ordem (R$)</label>
              <input class="input" id="trade-amount" type="number" min="${MIN_TRADE_AMOUNT}" step="0.01" placeholder="${MIN_TRADE_AMOUNT}.00" required />
            </div>

            <div class="inline-actions tradepro-quick-amounts">
              <button type="button" class="btn btn-secondary" data-quick-amount="10">R$10</button>
              <button type="button" class="btn btn-secondary" data-quick-amount="25">R$25</button>
              <button type="button" class="btn btn-secondary" data-quick-amount="50">R$50</button>
              <button type="button" class="btn btn-secondary" data-quick-amount="100">R$100</button>
            </div>

            <div class="field">
              <label for="trade-expiry">Expiração</label>
              <select class="select" id="trade-expiry">
                ${APP_CONFIG.expiries.map((seconds) => `<option value="${seconds}">${seconds}s</option>`).join("")}
              </select>
            </div>

            <div class="section-card tradepro-mini-card">
              <small class="help-text">Retorno potencial estimado</small>
              <strong class="mono" id="trade-potential-return">${formatCurrency(0)}</strong>
            </div>

            <div class="inline-actions tradepro-order-actions">
              <button type="button" class="btn btn-success" data-direction="CALL">CALL (Alta)</button>
              <button type="button" class="btn btn-danger" data-direction="PUT">PUT (Baixa)</button>
            </div>
          </form>

          <div id="trade-message" class="hidden" style="margin-top:0.8rem;"></div>
          <div id="trade-outcome" class="hidden" style="margin-top:0.8rem;"></div>

          <div class="section-card tradepro-mini-card" style="margin-top:0.8rem;">
            <div class="section-header" style="margin-bottom:0.45rem;">
              <h3 style="font-size:0.95rem;">Operações em aberto</h3>
            </div>
            <div id="trade-open-list" class="tradepro-open-list"></div>
          </div>
        </article>
      </div>

      ${renderBannerBlock(contentConfig, "trade_before_history")}

      <article class="section-card">
        <div class="section-header">
          <h3>Histórico de Operações</h3>
          <small class="help-text">Entrada, saída e resultado da operação.</small>
        </div>
        <div class="table-wrap">
          <table class="table" id="trades-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Ativo</th>
                <th>Direção</th>
                <th>Valor</th>
                <th>Entrada</th>
                <th>Saída</th>
                <th>Status</th>
                <th>Retorno</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </article>
    </section>
  `;

  const chartEl = container.querySelector("#market-chart");
  const tradeGridEl = container.querySelector(".tradepro-grid");
  const chartCandlesEl = container.querySelector("#market-chart-candles");
  const chartOrderLinesEl = container.querySelector("#market-chart-order-lines");
  const chartPriceScaleEl = container.querySelector("#chart-price-scale");
  const chartLivePriceEl = container.querySelector("#chart-live-price");
  const crosshairX = container.querySelector("#crosshair-x");
  const crosshairY = container.querySelector("#crosshair-y");
  const chartTooltip = container.querySelector("#chart-tooltip");
  const chartOhlcEl = container.querySelector("#chart-ohlc");
  const marketPriceEl = container.querySelector("#market-price");
  const marketVariationEl = container.querySelector("#market-variation");
  const marketSourceBadge = container.querySelector("#market-source-badge");
  const tradeBalanceEl = container.querySelector("#trade-balance");
  const messageEl = container.querySelector("#trade-message");
  const outcomeEl = container.querySelector("#trade-outcome");
  const openListEl = container.querySelector("#trade-open-list");
  const tradesTbody = container.querySelector("#trades-table tbody");
  const symbolSelect = container.querySelector("#trade-symbol");
  const amountInput = container.querySelector("#trade-amount");
  const expirySelect = container.querySelector("#trade-expiry");
  const potentialReturnEl = container.querySelector("#trade-potential-return");
  const followBtn = container.querySelector("#chart-follow");
  const resetBtn = container.querySelector("#chart-reset");
  const fullscreenBtn = container.querySelector("#chart-fullscreen");

  function showMessage(text, type = "error") {
    messageEl.textContent = text;
    messageEl.className = type === "success" ? "success-box" : type === "info" ? "info-box" : "error-box";
  }

  function showOutcome(text, type = "error") {
    outcomeEl.textContent = text;
    outcomeEl.className = type === "success" ? "success-box" : "error-box";
  }

  function updatePotentialReturn() {
    const amount = Number(amountInput.value || 0);
    const payout = amount * Number(APP_CONFIG.payoutRate || 0.8);
    potentialReturnEl.textContent = formatCurrency(Math.max(0, payout));
  }

  function updateWalletUi() {
    if (tradeBalanceEl) tradeBalanceEl.textContent = formatCurrency(wallet.available);
    updateHeaderBalance(wallet.available);
  }

  function getVisibleCount() {
    return timeframePointCount(selectedHistoryWindow);
  }

  function getMaxOffset() {
    const visible = getVisibleCount();
    return Math.max(0, chartSeries.length - (visible + 1));
  }

  function getVisibleSeries() {
    const visible = getVisibleCount();
    const maxOffset = getMaxOffset();
    viewOffset = clamp(viewOffset, 0, maxOffset);

    const endExclusive = chartSeries.length - viewOffset;
    const start = Math.max(0, endExclusive - (visible + 1));
    return chartSeries.slice(start, endExclusive);
  }

  function currentOpenTradeForSymbol() {
    const activeLabel = findSymbolConfig(selectedSymbolCode).label;
    return trades
      .filter((item) => item.status === "OPEN" && item.symbol === activeLabel)
      .sort((a, b) => Number(b.openedAt || 0) - Number(a.openedAt || 0))[0];
  }

  function refreshOpenList() {
    const openTrades = trades
      .filter((item) => item.status === "OPEN")
      .sort((a, b) => Number(b.openedAt || 0) - Number(a.openedAt || 0))
      .slice(0, 6);

    if (!openTrades.length) {
      openListEl.innerHTML = '<small class="help-text">Sem operações abertas no momento.</small>';
      return;
    }

    const now = Date.now();
    openListEl.innerHTML = openTrades
      .map((trade) => {
        const remainingMs = Math.max(0, Number(trade.expiresAt || 0) - now);
        const remaining = `${(remainingMs / 1000).toFixed(1)}s`;
        return `
          <div class="tradepro-open-item">
            <div>
              <strong>${trade.symbol}</strong>
              <small class="help-text">${trade.direction} · ${formatCurrency(trade.amount)}</small>
            </div>
            <span class="mono">${remaining}</span>
          </div>
        `;
      })
      .join("");
  }

  function refreshTradesTable() {
    if (!trades.length) {
      tradesTbody.innerHTML = '<tr><td colspan="8" style="color:var(--text-2);">Nenhuma operação registrada.</td></tr>';
      return;
    }

    tradesTbody.innerHTML = trades
      .slice()
      .sort((a, b) => Number(b.openedAt || 0) - Number(a.openedAt || 0))
      .map(
        (trade) => `
          <tr>
            <td>${formatDateTime(trade.openedAt)}</td>
            <td>${trade.symbol}</td>
            <td>${trade.direction}</td>
            <td class="mono">${formatCurrency(trade.amount)}</td>
            <td class="mono">${trade.openPrice ? Number(trade.openPrice).toFixed(6) : "-"}</td>
            <td class="mono">${trade.closePrice ? Number(trade.closePrice).toFixed(6) : "-"}</td>
            <td>${statusBadge(trade.status)}</td>
            <td class="mono">${trade.status === "WIN" ? formatCurrency(trade.payoutAmount) : trade.status === "LOSS" ? formatCurrency(0) : "-"}</td>
          </tr>
        `,
      )
      .join("");
  }

  async function syncTrades() {
    trades = await listTrades();
    refreshTradesTable();
    refreshOpenList();
  }

  function markControls() {
    container.querySelectorAll("[data-timeframe]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.timeframe === selectedHistoryWindow);
    });

    container.querySelectorAll("[data-interval]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.interval === selectedCandleInterval);
    });
    container.querySelectorAll("[data-sensitivity]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.sensitivity === selectedSensitivity);
    });

    followBtn?.classList.toggle("active", followLatest);
    if (fullscreenBtn) fullscreenBtn.textContent = document.fullscreenElement ? "Sair tela cheia" : "Tela cheia";
  }

  function renderOrderLine(axis, priceDecimals) {
    const openTrade = currentOpenTradeForSymbol();
    if (!openTrade) {
      chartOrderLinesEl.innerHTML = "";
      return;
    }

    const entryPrice = Number(openTrade.openPrice || 0);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      chartOrderLinesEl.innerHTML = "";
      return;
    }

    const topPct = clamp(((axis.max - entryPrice) / axis.spread) * 100, 1.5, 98.5);
    chartOrderLinesEl.innerHTML = `
      <div class="order-line" style="top:${topPct}%;"></div>
      <span class="order-line-label" style="top:calc(${topPct}% - 10px);">Entrada ${entryPrice.toFixed(priceDecimals)}</span>
    `;
  }

  function renderPriceScale(axis, priceDecimals) {
    const levels = 8;
    const rows = [];
    for (let i = 0; i < levels; i += 1) {
      const ratio = i / (levels - 1);
      const value = axis.max - axis.spread * ratio;
      rows.push(`<div class="chart-price-row">${value.toFixed(priceDecimals)}</div>`);
    }
    chartPriceScaleEl.innerHTML = rows.join("");
  }

  function renderChart() {
    const symbolConfig = findSymbolConfig(selectedSymbolCode);
    const priceDecimals = getPriceDecimals(symbolConfig);
    const pointsRaw = getVisibleSeries();
    const chartWidth = chartCandlesEl?.clientWidth || 900;
    const maxRenderCandles = Math.max(28, Math.floor(chartWidth / 19));
    const points = cropPointsForDisplay(pointsRaw, maxRenderCandles + 1);
    const candles = buildCandles(points);

    if (!candles.length) {
      chartCandlesEl.innerHTML = "";
      chartOrderLinesEl.innerHTML = "";
      chartPriceScaleEl.innerHTML = "";
      chartLivePriceEl.textContent = "";
      chartOhlcEl.textContent = "Sem dados de mercado";
      return;
    }

    const openTrade = currentOpenTradeForSymbol();
    const axis = computeAxis(
      candles,
      Number(latestTicker.price || candles[candles.length - 1].close),
      chartAxis,
      symbolConfig,
      openTrade ? [Number(openTrade.openPrice || 0)] : [],
      selectedHistoryWindow,
      selectedSensitivity,
    );
    chartAxis = axis;

    chartCandlesEl.innerHTML = renderCandlesHtml(candles, axis);
    renderOrderLine(axis, priceDecimals);
    renderPriceScale(axis, priceDecimals);

    const livePrice = Number(latestTicker.price || candles[candles.length - 1].close);
    const markerPct = clamp(((axis.max - livePrice) / axis.spread) * 100, 0, 100);
    chartLivePriceEl.style.top = `calc(${markerPct}% - 10px)`;
    chartLivePriceEl.textContent = livePrice.toFixed(priceDecimals);

    const c = candles[candles.length - 1];
    chartOhlcEl.textContent = `Intervalo ${selectedCandleInterval} | Janela ${selectedHistoryWindow} | O ${c.open.toFixed(priceDecimals)} H ${c.high.toFixed(priceDecimals)} L ${c.low.toFixed(priceDecimals)} C ${c.close.toFixed(priceDecimals)}`;

    lastRender = { candles, axis, priceDecimals };
  }

  function hideCrosshair() {
    crosshairX.classList.add("hidden");
    crosshairY.classList.add("hidden");
    chartTooltip.classList.add("hidden");
  }

  function updateCrosshair(clientX, clientY) {
    if (!lastRender?.candles?.length) return;

    const outerRect = chartEl.getBoundingClientRect();
    const candlesRect = chartCandlesEl.getBoundingClientRect();
    const x = clamp(clientX - candlesRect.left, 0, candlesRect.width);
    const y = clamp(clientY - candlesRect.top, 0, candlesRect.height);

    const idx = clamp(Math.floor((x / Math.max(candlesRect.width, 1)) * lastRender.candles.length), 0, lastRender.candles.length - 1);
    const candle = lastRender.candles[idx];

    crosshairX.classList.remove("hidden");
    crosshairY.classList.remove("hidden");
    chartTooltip.classList.remove("hidden");

    const offsetX = candlesRect.left - outerRect.left;
    const offsetY = candlesRect.top - outerRect.top;

    crosshairX.style.left = `${x + offsetX}px`;
    crosshairY.style.top = `${y + offsetY}px`;

    const priceAtY = lastRender.axis.min + ((candlesRect.height - y) / Math.max(candlesRect.height, 1)) * lastRender.axis.spread;
    const candleMs = getCandleIntervalMs(selectedCandleInterval);
    const at = new Date(Date.now() - (lastRender.candles.length - 1 - idx) * candleMs);

    chartTooltip.style.left = `${x + offsetX + 12}px`;
    chartTooltip.style.top = `${y + offsetY + 12}px`;
    chartTooltip.innerHTML = `
      <div>${at.toLocaleString("pt-BR")}</div>
      <div>O: ${candle.open.toFixed(lastRender.priceDecimals)}</div>
      <div>H: ${candle.high.toFixed(lastRender.priceDecimals)}</div>
      <div>L: ${candle.low.toFixed(lastRender.priceDecimals)}</div>
      <div>C: ${candle.close.toFixed(lastRender.priceDecimals)}</div>
      <div>P: ${priceAtY.toFixed(lastRender.priceDecimals)}</div>
    `;
  }

  async function rebuildChartSeries() {
    const symbolConfig = findSymbolConfig(selectedSymbolCode);
    latestTicker = await getLiveTicker(symbolConfig);
    maxSeriesLength = timeframePointCount(selectedHistoryWindow);
    chartSeries = generateHistorySeries(latestTicker.price, maxSeriesLength + 1, symbolConfig);
    chartAxis = null;
    viewOffset = 0;
    followLatest = true;
    staleTicks = 0;
    ticksSinceRebuild = 0;

    const priceDecimals = getPriceDecimals(symbolConfig);
    marketPriceEl.textContent = Number(latestTicker.price || 0).toFixed(priceDecimals);
    marketSourceBadge.textContent = String(latestTicker.source || "market").toUpperCase();
    renderChart();
    markControls();
  }

  async function refreshTicker() {
    const symbolConfig = findSymbolConfig(selectedSymbolCode);
    const previous = Number(latestTicker?.price || 0);

    latestTicker = await getLiveTicker(symbolConfig);
    let next = Number(latestTicker.price || previous || 0);

    if (previous > 0) {
      ticksSinceRebuild += 1;
      const hardJump = Math.max(previous * 0.003, 35);
      const diff = next - previous;
      if (Math.abs(diff) > hardJump) {
        next = previous + Math.sign(diff) * hardJump;
        latestTicker = { ...latestTicker, price: next };
      }

      const isWarmup = ticksSinceRebuild <= 24;
      const sensMap = {
        low: { warmupRatio: 0.00000062, warmupFloor: 0.032, normalRatio: 0.00000026, normalFloor: 0.012, synthWarm: 0.18, synthNormal: 0.09, hit: 2 },
        medium: { warmupRatio: 0.0000009, warmupFloor: 0.045, normalRatio: 0.00000038, normalFloor: 0.018, synthWarm: 0.28, synthNormal: 0.14, hit: 1 },
        high: { warmupRatio: 0.0000012, warmupFloor: 0.065, normalRatio: 0.00000056, normalFloor: 0.028, synthWarm: 0.42, synthNormal: 0.22, hit: 1 },
      };
      const sens = sensMap[selectedSensitivity] || sensMap.medium;
      const minMove = Math.max(
        previous * (isWarmup ? sens.warmupRatio : sens.normalRatio),
        isWarmup ? sens.warmupFloor : sens.normalFloor,
      );
      if (Math.abs(next - previous) < minMove) {
        staleTicks += 1;
        if (staleTicks >= (isWarmup ? sens.hit : Math.max(2, sens.hit))) {
          const synthetic = Math.max(
            previous * (isWarmup ? sens.warmupRatio * 7 : sens.normalRatio * 8),
            isWarmup ? sens.synthWarm : sens.synthNormal,
          ) * (Math.random() > 0.5 ? 1 : -1);
          next = previous + synthetic;
          latestTicker = { ...latestTicker, price: next };
          staleTicks = 0;
        }
      } else {
        staleTicks = 0;
      }
    }

    const variation = previous > 0 ? ((next - previous) / previous) * 100 : 0;
    const lastSeriesPrice = Number(chartSeries[chartSeries.length - 1] || next);
    const desyncThreshold = Math.max(Math.abs(next) * 0.0012, 12);
    if (Math.abs(next - lastSeriesPrice) > desyncThreshold) {
      // Reancora a série quando ela abre com histórico mock distante do preço real,
      // evitando "buraco" visual no meio do gráfico.
      chartSeries = generateHistorySeries(next, maxSeriesLength + 1, symbolConfig);
      chartSeries[chartSeries.length - 1] = next;
      chartAxis = null;
      staleTicks = 0;
      ticksSinceRebuild = 0;
    } else {
      chartSeries = [...chartSeries, next].slice(-(maxSeriesLength + 1));
    }
    if (followLatest) viewOffset = 0;

    const priceDecimals = getPriceDecimals(symbolConfig);
    marketPriceEl.textContent = next.toFixed(priceDecimals);
    marketSourceBadge.textContent = String(latestTicker.source || "market").toUpperCase();
    marketVariationEl.textContent = `${variation.toFixed(3)}%`;
    marketVariationEl.style.color = variation >= 0 ? "var(--gain)" : "var(--loss)";

    renderChart();
    refreshOpenList();
  }

  async function resolveDueTrades() {
    const openTrades = trades.filter((trade) => trade.status === "OPEN");
    if (!openTrades.length) return;

    for (const trade of openTrades) {
      const symbolConfig = findSymbolConfigByLabel(trade.symbol);
      const ticker = await getLiveTicker(symbolConfig);
      const resolved = await resolveTrade({ tradeId: trade.tradeId, currentPrice: Number(ticker.price) });

      if (resolved.status !== "OPEN") {
        const text = resolved.status === "WIN" ? `WIN · Retorno ${formatCurrency(resolved.payoutAmount || 0)}` : "LOSS · Operação encerrada";
        showOutcome(text, resolved.status === "WIN" ? "success" : "error");
        showToast(`Operação ${resolved.tradeId.slice(0, 6)} finalizada: ${resolved.status}`, resolved.status === "WIN" ? "success" : "error");
      }
    }

    wallet = await getBalance();
    updateWalletUi();
    await syncTrades();
    renderChart();
  }

  function ensureTradable() {
    const symbol = findSymbolConfig(symbolSelect.value);
    return symbol.marketType !== "stock";
  }

  async function openTrade(direction) {
    const symbolCode = symbolSelect.value;
    const symbolConfig = findSymbolConfig(symbolCode);

    if (symbolConfig.marketType === "stock") {
      showMessage("Ações estão em visualização. Para operar, selecione um ativo de Cripto.", "info");
      return;
    }

    const amount = Number(amountInput.value || 0);
    if (!amount || amount < MIN_TRADE_AMOUNT) {
      showMessage(`Valor mínimo da ordem: R$ ${MIN_TRADE_AMOUNT.toFixed(2).replace('.', ',')}.`);
      return;
    }

    const expirySeconds = Number(expirySelect.value || 0);
    const openPrice = Number(latestTicker?.price || 0);
    if (!Number.isFinite(openPrice) || openPrice <= 0) {
      showMessage("Preço de mercado indisponível. Tente novamente.");
      return;
    }

    try {
      await createTrade({
        symbol: symbolConfig.label,
        amount,
        direction,
        expirySeconds,
        openPrice,
      });

      showMessage("Operação aberta com sucesso.", "success");
      showToast(`Ordem ${direction} enviada para ${symbolConfig.label}.`, "success");

      wallet = await getBalance();
      updateWalletUi();
      await syncTrades();
      renderChart();
    } catch (error) {
      showMessage(error?.message || "Falha ao criar operação.");
    }
  }

  function onChartMouseDown(event) {
    isDragging = true;
    dragStartX = event.clientX;
    dragStartOffset = viewOffset;
    chartEl.classList.add("dragging");
  }

  function onWindowMouseMove(event) {
    if (!isDragging) return;
    const dx = event.clientX - dragStartX;
    const candlesDelta = Math.round((dx / Math.max(chartEl.clientWidth, 1)) * getVisibleCount());
    viewOffset = clamp(dragStartOffset - candlesDelta, 0, getMaxOffset());
    followLatest = viewOffset === 0;
    markControls();
    renderChart();
  }

  function onWindowMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    chartEl.classList.remove("dragging");
  }

  symbolSelect.addEventListener("change", async () => {
    selectedSymbolCode = symbolSelect.value;
    if (!ensureTradable()) {
      showMessage("Ações estão em modo visualização nesta etapa.", "info");
    } else if (messageEl.classList.contains("info-box")) {
      messageEl.className = "hidden";
      messageEl.textContent = "";
    }
    await rebuildChartSeries();
  });

  amountInput.addEventListener("input", updatePotentialReturn);

  container.querySelectorAll("[data-quick-amount]").forEach((btn) => {
    btn.addEventListener("click", () => {
      amountInput.value = String(btn.dataset.quickAmount || "");
      updatePotentialReturn();
    });
  });

  container.querySelectorAll("[data-timeframe]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      selectedHistoryWindow = btn.dataset.timeframe || DEFAULT_HISTORY_WINDOW;
      await rebuildChartSeries();
      markControls();
    });
  });

  container.querySelectorAll("[data-interval]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      selectedCandleInterval = btn.dataset.interval || DEFAULT_CANDLE_INTERVAL;
      renderChart();
      markControls();
    });
  });

  container.querySelectorAll("[data-sensitivity]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedSensitivity = btn.dataset.sensitivity || DEFAULT_SENSITIVITY;
      staleTicks = 0;
      ticksSinceRebuild = 0;
      renderChart();
      markControls();
    });
  });

  container.querySelectorAll("[data-direction]").forEach((btn) => {
    btn.addEventListener("click", () => openTrade(btn.dataset.direction));
  });

  followBtn?.addEventListener("click", () => {
    followLatest = !followLatest;
    if (followLatest) viewOffset = 0;
    markControls();
    renderChart();
  });

  resetBtn?.addEventListener("click", async () => {
    chartAxis = null;
    viewOffset = 0;
    followLatest = true;
    await rebuildChartSeries();
  });

  fullscreenBtn?.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await tradeGridEl.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      showToast(error?.message || "Falha ao alternar tela cheia", "error");
    } finally {
      markControls();
    }
  });

  chartEl.addEventListener("mousemove", (event) => {
    if (isDragging) return;
    updateCrosshair(event.clientX, event.clientY);
  });
  chartEl.addEventListener("mouseleave", hideCrosshair);
  chartEl.addEventListener("mousedown", onChartMouseDown);
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", onWindowMouseUp);
  document.addEventListener("fullscreenchange", markControls);

  await syncTrades();
  updatePotentialReturn();
  updateWalletUi();
  markControls();
  renderChart();
  await refreshTicker();

  marketTimer = setInterval(refreshTicker, MARKET_TICK_MS);
  resolveTimer = setInterval(resolveDueTrades, RESOLVE_TICK_MS);

  return () => {
    if (marketTimer) clearInterval(marketTimer);
    if (resolveTimer) clearInterval(resolveTimer);

    window.removeEventListener("mousemove", onWindowMouseMove);
    window.removeEventListener("mouseup", onWindowMouseUp);
    document.removeEventListener("fullscreenchange", markControls);
  };
}
