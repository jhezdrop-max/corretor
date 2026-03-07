import { APP_CONFIG } from "../config.js";
import { getContentConfig } from "../api/content.adapter.js";
import { getLiveTicker } from "../api/market.adapter.js";
import { createTrade, listTrades, resolveTrade } from "../api/trade.adapter.js";
import { getBalance } from "../api/wallet.adapter.js";
import { renderBannerBlock } from "../components/banner.js";
import { formatCurrency, formatDateTime } from "../store.js";
import { showToast } from "../components/toast.js";
import { updateHeaderBalance } from "../components/header.js";

const MARKET_TICK_MS = 700;
const DEFAULT_HISTORY_WINDOW = "1h";
const DEFAULT_CANDLE_INTERVAL = "5m";
const MIN_TRADE_AMOUNT = 2;
const ZOOM_FACTORS = [1, 1.4, 2];
const DEFAULT_ZOOM_INDEX = 2;
const TIP_WOBBLE_RATIO = 0.0018;
const TIMEFRAME_OPTIONS = [
  { key: "1h", label: "1 hora", seconds: 3600 },
  { key: "5h", label: "5 horas", seconds: 18000 },
  { key: "10h", label: "10 horas", seconds: 36000 },
  { key: "15h", label: "15 horas", seconds: 54000 },
  { key: "1d", label: "1 dia", seconds: 86400 },
  { key: "2d", label: "2 dias", seconds: 172800 },
];

function statusBadge(status) {
  if (status === "OPEN") return '<span class="badge badge-pending">OPEN</span>';
  if (status === "WIN") return '<span class="badge badge-win">WIN</span>';
  return '<span class="badge badge-loss">LOSS</span>';
}

function getSeriesLengthByTimeframe(timeframeKey) {
  if (timeframeKey === "1h") return 180;
  if (timeframeKey === "5h") return 260;
  if (timeframeKey === "10h") return 340;
  if (timeframeKey === "15h") return 420;
  if (timeframeKey === "1d") return 560;
  return 700;
}

function getCandleIntervalMs(intervalKey) {
  const available = Array.isArray(APP_CONFIG.candleIntervals) ? APP_CONFIG.candleIntervals : [];
  return available.find((item) => item.key === intervalKey)?.ms || 15 * 60 * 1000;
}

function getPriceDecimals(symbolConfig) {
  if (symbolConfig?.marketType === "crypto") {
    return Math.max(2, Math.min(6, Number(symbolConfig.precision || 2) + 2));
  }
  return Math.max(2, Number(symbolConfig?.precision || 2));
}

function buildCandles(points, tipWobble = 0) {
  if (points.length < 2) return [];
  const candles = [];

  for (let i = 1; i < points.length; i += 1) {
    const open = points[i - 1];
    const close = points[i];
    const delta = Math.abs(close - open);
    const wick = Math.max(delta * 0.35, Math.abs(open) * 0.00005, 0.0000005);
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;
    candles.push({ open, close, high, low });
  }

  if (tipWobble > 0 && candles.length) {
    const tip = candles[candles.length - 1];
    const amp = Math.max(Math.abs(tip.close) * tipWobble, 0.000001);
    const wobble = (Math.random() - 0.5) * amp * 2;
    const liveClose = tip.close + wobble;
    tip.close = liveClose;
    tip.high = Math.max(tip.high, liveClose);
    tip.low = Math.min(tip.low, liveClose);

    if (candles.length > 1) {
      const previousTip = candles[candles.length - 2];
      const previousAmp = Math.max(Math.abs(previousTip.close) * tipWobble * 0.45, 0.0000005);
      const previousWobble = (Math.random() - 0.5) * previousAmp * 2;
      const previousClose = previousTip.close + previousWobble;
      previousTip.close = previousClose;
      previousTip.high = Math.max(previousTip.high, previousClose);
      previousTip.low = Math.min(previousTip.low, previousClose);
    }
  }

  return candles;
}

function generateHistorySeries(seedPrice, size, symbolConfig) {
  const points = [Number(seedPrice || 1)];
  const volatility = symbolConfig?.marketType === "stock" ? 0.0011 : 0.0019;

  for (let i = 1; i < size; i += 1) {
    const previous = points[i - 1];
    const direction = Math.random() > 0.5 ? 1 : -1;
    const magnitude = Math.random() * volatility;
    const next = previous * (1 + direction * magnitude);
    points.push(Number(Math.max(next, 0.000001).toFixed(6)));
  }

  return points;
}

function renderCandles(container, points, axisState, tipWobble, intervalMs, symbolConfig) {
  const candles = buildCandles(points, tipWobble);
  if (!candles.length) {
    container.innerHTML = "";
    return null;
  }

  const stableCandles = candles.length > 6 ? candles.slice(0, -1) : candles;
  const stableAll = stableCandles.flatMap((candle) => [candle.low, candle.high]);
  const naturalAll = candles.flatMap((candle) => [candle.low, candle.high]);
  const naturalMin = Math.min(...stableAll);
  const naturalMax = Math.max(...stableAll);
  const latestClose = candles[candles.length - 1].close;
  const maxDistance = Math.max(latestClose - naturalMin, naturalMax - latestClose);
  const isCrypto = symbolConfig?.marketType === "crypto";
  const minHalfRange = Math.max(Math.abs(latestClose) * (isCrypto ? 0.00045 : 0.0025), isCrypto ? 0.00005 : 0.0001);
  const halfRange = Math.max(maxDistance * (isCrypto ? 1.05 : 1.12), minHalfRange);
  const targetMin = latestClose - halfRange;
  const targetMax = latestClose + halfRange;

  let min = targetMin;
  let max = targetMax;
  if (axisState) {
    const span = Math.max(axisState.max - axisState.min, 0.0000001);
    const guardRatio = isCrypto ? 0.12 : 0.17;
    const lowerGuard = axisState.min + span * guardRatio;
    const upperGuard = axisState.max - span * guardRatio;
    const outOfGuard = latestClose < lowerGuard || latestClose > upperGuard;
    if (outOfGuard) {
      const alpha = isCrypto ? 0.34 : 0.2;
      min = axisState.min + (targetMin - axisState.min) * alpha;
      max = axisState.max + (targetMax - axisState.max) * alpha;
    } else {
      min = axisState.min;
      max = axisState.max;
    }
  }

  min = Math.min(min, Math.min(...naturalAll));
  max = Math.max(max, Math.max(...naturalAll));

  const spread = Math.max(max - min, 0.0000001);

  container.innerHTML = candles
    .map((candle) => {
      const highPct = ((candle.high - min) / spread) * 100;
      const lowPct = ((candle.low - min) / spread) * 100;
      const openPct = ((candle.open - min) / spread) * 100;
      const closePct = ((candle.close - min) / spread) * 100;
      const wickBottom = Math.max(0, Math.min(lowPct, 100));
      const wickHeight = Math.max(2, highPct - lowPct);
      const bodyBottom = Math.max(0, Math.min(openPct, closePct));
      const bodyHeight = Math.max(1.2, Math.abs(closePct - openPct));
      const isUp = candle.close >= candle.open;

      return `
        <div class="chart-candle ${isUp ? "up" : "down"}">
          <div class="chart-wick" style="bottom:${wickBottom}%;height:${wickHeight}%;"></div>
          <div class="chart-body" style="bottom:${bodyBottom}%;height:${bodyHeight}%;"></div>
        </div>
      `;
    })
    .join("");

  return { candles, min, max, spread, latestClose, axis: { min, max }, intervalMs };
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
    <optgroup label="Acoes">
      ${buildOptions(stocks)}
    </optgroup>
  `;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

export async function renderTradeView(container) {
  let contentConfig = await getContentConfig();
  let wallet = await getBalance();
  let trades = await listTrades();
  let selectedSymbolCode = APP_CONFIG.symbols[0].code;
  let selectedHistoryWindow = DEFAULT_HISTORY_WINDOW;
  let selectedCandleInterval = DEFAULT_CANDLE_INTERVAL;
  let zoomIndex = DEFAULT_ZOOM_INDEX;
  let latestTicker = await getLiveTicker(findSymbolConfig(selectedSymbolCode));
  let maxSeriesLength = getSeriesLengthByTimeframe(selectedHistoryWindow);
  let chartSeries = generateHistorySeries(latestTicker.price, maxSeriesLength + 1, findSymbolConfig(selectedSymbolCode));
  let lastRender = null;
  let chartAxis = null;
  let viewOffset = 0;
  let followLatest = true;
  let marketTimer = null;
  let resolveTimer = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartOffset = 0;

  container.innerHTML = `
    <section class="main-content anim-fade-up">
      <div class="grid-2 trade-grid">
        <article class="section-card">
          <div class="section-header">
            <h3>Painel de Mercado (Preco ao Vivo)</h3>
            <span class="badge badge-pending" id="market-source">${latestTicker.source.toUpperCase()}</span>
          </div>
          <div class="metric-inline" style="margin-bottom:0.8rem;">
            <div class="metric-item">
              <small>Preco real do ativo</small>
              <strong class="mono" id="market-price">${latestTicker.price}</strong>
            </div>
            <div class="metric-item">
              <small>Variacao tick</small>
              <strong class="mono" id="market-variation">0.00%</strong>
            </div>
            <div class="metric-item">
              <small>Saldo</small>
              <strong class="mono" id="trade-balance">${formatCurrency(wallet.available)}</strong>
            </div>
          </div>
          <div class="chart-topbar mono" id="chart-ohlc">OHLC: -</div>
          <div class="chart" id="market-chart">
            <div class="chart-grid-layer" id="market-chart-grid"></div>
            <div class="chart-candles-layer" id="market-chart-candles"></div>
            <div class="chart-order-lines" id="market-chart-order-lines"></div>
            <div class="chart-side-layer" id="market-chart-side">
              <div class="chart-price-scale mono" id="chart-price-scale"></div>
              <div class="chart-live-price mono" id="chart-live-price"></div>
            </div>
            <div class="chart-crosshair-x hidden" id="crosshair-x"></div>
            <div class="chart-crosshair-y hidden" id="crosshair-y"></div>
            <div class="chart-tooltip hidden" id="chart-tooltip"></div>
          </div>
          <div class="chart-controls">
            <div class="chart-intervals" id="chart-intervals">
              ${(APP_CONFIG.candleIntervals || [])
                .map(
                  (option) => `
                <button
                  type="button"
                  class="btn btn-secondary chart-control-btn ${option.key === selectedCandleInterval ? "active" : ""}"
                  data-interval="${option.key}"
                >
                  ${option.label}
                </button>
              `,
                )
                .join("")}
            </div>
            <div class="chart-zoom-controls">
              <button type="button" class="btn btn-secondary chart-control-btn" id="chart-zoom-out">-</button>
              <button type="button" class="btn btn-secondary chart-control-btn" id="chart-zoom-in">+</button>
              <button type="button" class="btn btn-secondary chart-control-btn" id="chart-reset">Reset</button>
              <button type="button" class="btn btn-secondary chart-control-btn active" id="chart-follow">Ao vivo</button>
              <small class="help-text mono" id="chart-zoom-label">Zoom 1.0x</small>
            </div>
            <div class="chart-timeframes" id="chart-timeframes">
              ${TIMEFRAME_OPTIONS.map(
                (option) => `
                <button
                  type="button"
                  class="btn btn-secondary chart-control-btn ${option.key === selectedHistoryWindow ? "active" : ""}"
                  data-timeframe="${option.key}"
                >
                  ${option.label}
                </button>
              `,
              ).join("")}
            </div>
          </div>
        </article>

        <article class="section-card trade-order-card">
          <div class="section-header">
            <h3>Nova Operacao Binaria</h3>
            <span class="help-text mono">Payout ${Math.round(APP_CONFIG.payoutRate * 100)}%</span>
          </div>
          <form id="trade-form" class="form-grid">
            <div class="field">
              <label for="trade-symbol">Ativo</label>
              <select class="select" id="trade-symbol">${groupedSymbolOptions(selectedSymbolCode)}</select>
            </div>
            <div class="field">
              <label for="trade-amount">Valor da ordem (R$)</label>
              <input class="input" id="trade-amount" type="number" min="${MIN_TRADE_AMOUNT}" step="0.01" required />
            </div>
            <div class="field">
              <label for="trade-expiry">Expiracao</label>
              <select class="select" id="trade-expiry">
                ${APP_CONFIG.expiries
                  .map((seconds) => `<option value="${seconds}">${seconds}s</option>`)
                  .join("")}
              </select>
            </div>
            <div class="inline-actions">
              <button type="button" class="btn btn-success" data-direction="CALL">CALL (Alta)</button>
              <button type="button" class="btn btn-danger" data-direction="PUT">PUT (Baixa)</button>
            </div>
          </form>
          <div id="trade-message" class="hidden" style="margin-top:1rem;"></div>
        </article>
      </div>

      ${renderBannerBlock(contentConfig, "trade_before_history")}

      <article class="section-card">
        <div class="section-header">
          <h3>Historico de Operacoes</h3>
          <small class="help-text">Resultado com preco de entrada e saida no vencimento.</small>
        </div>
        <div class="table-wrap">
          <table class="table" id="trades-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Ativo</th>
                <th>Direcao</th>
                <th>Valor</th>
                <th>Entrada</th>
                <th>Saida</th>
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
  const chartCandlesEl = container.querySelector("#market-chart-candles");
  const chartOrderLinesEl = container.querySelector("#market-chart-order-lines");
  const chartPriceScaleEl = container.querySelector("#chart-price-scale");
  const chartLivePriceEl = container.querySelector("#chart-live-price");
  const crosshairX = container.querySelector("#crosshair-x");
  const crosshairY = container.querySelector("#crosshair-y");
  const chartTooltip = container.querySelector("#chart-tooltip");
  const chartOhlc = container.querySelector("#chart-ohlc");
  const tradesTableBody = container.querySelector("#trades-table tbody");
  const messageBox = container.querySelector("#trade-message");
  const symbolSelect = container.querySelector("#trade-symbol");
  const directionButtons = [...container.querySelectorAll("[data-direction]")];
  const zoomInBtn = container.querySelector("#chart-zoom-in");
  const zoomOutBtn = container.querySelector("#chart-zoom-out");
  const resetBtn = container.querySelector("#chart-reset");
  const followBtn = container.querySelector("#chart-follow");
  const zoomLabel = container.querySelector("#chart-zoom-label");

  function showMessage(message, type = "error") {
    messageBox.textContent = message;
    messageBox.className = type === "success" ? "success-box" : type === "info" ? "info-box" : "error-box";
  }

  function refreshTradeAvailability() {
    const symbolConfig = findSymbolConfig(symbolSelect.value);
    const tradeEnabled = symbolConfig.marketType !== "stock";
    directionButtons.forEach((button) => {
      button.disabled = !tradeEnabled;
    });

    if (!tradeEnabled) {
      showMessage("Operações estão habilitadas apenas para criptomoedas. Ações ficam em modo visualização.", "info");
    } else if (messageBox.classList.contains("info-box")) {
      messageBox.className = "hidden";
      messageBox.textContent = "";
    }
  }

  function refreshWalletUI() {
    const tradeBalance = container.querySelector("#trade-balance");
    if (tradeBalance) tradeBalance.textContent = formatCurrency(wallet.available);
    updateHeaderBalance(wallet.available);
  }

  function refreshTradesTable() {
    if (!trades.length) {
      tradesTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="color:var(--text-2);">Nenhuma operacao registrada.</td>
        </tr>
      `;
      return;
    }

    tradesTableBody.innerHTML = trades
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
  }

  function getVisibleCount() {
    const zoomFactor = ZOOM_FACTORS[zoomIndex] || 1;
    return Math.max(40, Math.floor(maxSeriesLength / zoomFactor));
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

  function refreshFollowButton() {
    followBtn?.classList.toggle("active", followLatest);
  }

  function refreshZoomUI() {
    if (zoomLabel) zoomLabel.textContent = `Zoom ${ZOOM_FACTORS[zoomIndex].toFixed(1)}x`;
    if (zoomInBtn) zoomInBtn.disabled = zoomIndex >= ZOOM_FACTORS.length - 1;
    if (zoomOutBtn) zoomOutBtn.disabled = zoomIndex <= 0;
    refreshFollowButton();
  }

  function renderChart() {
    const symbolConfig = findSymbolConfig(selectedSymbolCode);
    const priceDecimals = getPriceDecimals(symbolConfig);
    const tipWobble = symbolConfig.marketType === "stock" ? TIP_WOBBLE_RATIO * 0.35 : TIP_WOBBLE_RATIO * 1.35;
    const intervalMs = getCandleIntervalMs(selectedCandleInterval);
    lastRender = renderCandles(chartCandlesEl, getVisibleSeries(), chartAxis, tipWobble, intervalMs, symbolConfig);
    if (!lastRender) {
      chartOhlc.textContent = "OHLC: -";
      if (chartPriceScaleEl) chartPriceScaleEl.innerHTML = "";
      if (chartOrderLinesEl) chartOrderLinesEl.innerHTML = "";
      if (chartLivePriceEl) {
        chartLivePriceEl.textContent = "";
        chartLivePriceEl.style.top = "50%";
      }
      return;
    }
    chartAxis = lastRender.axis;

    const levels = 6;
    const rows = [];
    for (let i = 0; i < levels; i += 1) {
      const ratio = i / (levels - 1);
      const price = lastRender.max - lastRender.spread * ratio;
      rows.push(`<div class="chart-price-row">${price.toFixed(priceDecimals)}</div>`);
    }
    if (chartPriceScaleEl) {
      chartPriceScaleEl.innerHTML = rows.join("");
    }
    if (chartLivePriceEl) {
      const markerPrice = Number(latestTicker.price || lastRender.latestClose);
      const markerPct = clamp(((lastRender.max - markerPrice) / lastRender.spread) * 100, 0, 100);
      chartLivePriceEl.style.top = `calc(${markerPct}% - 10px)`;
      chartLivePriceEl.textContent = `${markerPrice.toFixed(priceDecimals)}`;
    }

    const activeSymbolLabel = findSymbolConfig(selectedSymbolCode).label;
    const openTradesForSymbol = trades
      .filter((item) => item.status === "OPEN" && item.symbol === activeSymbolLabel)
      .slice(0, 4);
    if (chartOrderLinesEl) {
      chartOrderLinesEl.innerHTML = openTradesForSymbol
        .map((trade) => {
          const entryPrice = Number(trade.openPrice || 0);
          const topPct = clamp(((lastRender.max - entryPrice) / lastRender.spread) * 100, 0, 100);
          return `
            <div class="order-line" style="top:${topPct}%;">
              <span class="order-line-label">Entrada ${entryPrice.toFixed(priceDecimals)}</span>
            </div>
          `;
        })
        .join("");
    }

    chartOhlc.textContent = `Intervalo ${selectedCandleInterval} | Janela ${selectedHistoryWindow} | Ultimo ${Number(
      latestTicker.price || lastRender.latestClose,
    ).toFixed(priceDecimals)}`;
  }

  function markActiveTimeframe() {
    container.querySelectorAll("[data-timeframe]").forEach((button) => {
      button.classList.toggle("active", button.dataset.timeframe === selectedHistoryWindow);
    });
    container.querySelectorAll("[data-interval]").forEach((button) => {
      button.classList.toggle("active", button.dataset.interval === selectedCandleInterval);
    });
  }

  function hideCrosshair() {
    crosshairX?.classList.add("hidden");
    crosshairY?.classList.add("hidden");
    chartTooltip?.classList.add("hidden");
  }

  function updateCrosshair(mouseX, mouseY) {
    if (!lastRender?.candles?.length) return;

    const outerRect = chartEl.getBoundingClientRect();
    const candlesRect = chartCandlesEl.getBoundingClientRect();
    const x = clamp(mouseX - candlesRect.left, 0, candlesRect.width);
    const y = clamp(mouseY - candlesRect.top, 0, candlesRect.height);
    const index = clamp(Math.floor((x / candlesRect.width) * lastRender.candles.length), 0, lastRender.candles.length - 1);
    const candle = lastRender.candles[index];
    const symbolConfig = findSymbolConfig(selectedSymbolCode);
    const priceDecimals = getPriceDecimals(symbolConfig);
    const candleMs = lastRender.intervalMs || getCandleIntervalMs(selectedCandleInterval);
    const at = new Date(Date.now() - (lastRender.candles.length - 1 - index) * candleMs);
    const yPrice = lastRender.min + ((candlesRect.height - y) / candlesRect.height) * lastRender.spread;

    crosshairX?.classList.remove("hidden");
    crosshairY?.classList.remove("hidden");
    chartTooltip?.classList.remove("hidden");

    const layerOffsetX = candlesRect.left - outerRect.left;
    const layerOffsetY = candlesRect.top - outerRect.top;
    crosshairX.style.left = `${x + layerOffsetX}px`;
    crosshairY.style.top = `${y + layerOffsetY}px`;

    const tooltipX = x > candlesRect.width - 170 ? x - 165 : x + 10;
    const tooltipY = y > candlesRect.height - 90 ? y - 80 : y + 10;
    chartTooltip.style.left = `${tooltipX + layerOffsetX}px`;
    chartTooltip.style.top = `${tooltipY + layerOffsetY}px`;
    chartTooltip.innerHTML = `
      <div>${at.toLocaleString("pt-BR")}</div>
      <div>O: ${candle.open.toFixed(priceDecimals)}</div>
      <div>H: ${candle.high.toFixed(priceDecimals)}</div>
      <div>L: ${candle.low.toFixed(priceDecimals)}</div>
      <div>C: ${candle.close.toFixed(priceDecimals)}</div>
      <div>P: ${yPrice.toFixed(priceDecimals)}</div>
    `;

    chartOhlc.textContent = `OHLC  O:${candle.open.toFixed(priceDecimals)}  H:${candle.high.toFixed(priceDecimals)}  L:${candle.low.toFixed(priceDecimals)}  C:${candle.close.toFixed(priceDecimals)}`;
  }

  async function rebuildChartSeries() {
    const symbolConfig = findSymbolConfig(selectedSymbolCode);
    latestTicker = await getLiveTicker(symbolConfig);
    maxSeriesLength = getSeriesLengthByTimeframe(selectedHistoryWindow);
    chartSeries = generateHistorySeries(latestTicker.price, maxSeriesLength + 1, symbolConfig);
    chartAxis = null;
    viewOffset = 0;
    followLatest = true;
    refreshZoomUI();

    const priceEl = container.querySelector("#market-price");
    const sourceEl = container.querySelector("#market-source");
    if (priceEl) priceEl.textContent = latestTicker.price.toFixed(getPriceDecimals(symbolConfig));
    if (sourceEl) sourceEl.textContent = latestTicker.source.toUpperCase();

    renderChart();
  }

  async function refreshTicker() {
    const symbolConfig = findSymbolConfig(selectedSymbolCode);
    const previous = latestTicker?.price || 0;
    latestTicker = await getLiveTicker(symbolConfig);

    const next = latestTicker.price;

    const variation = previous > 0 ? ((next - previous) / previous) * 100 : 0;
    chartSeries = [...chartSeries, next].slice(-(maxSeriesLength + 1));
    if (followLatest) viewOffset = 0;

    const priceEl = container.querySelector("#market-price");
    const variationEl = container.querySelector("#market-variation");
    const sourceEl = container.querySelector("#market-source");
    if (priceEl) priceEl.textContent = latestTicker.price.toFixed(getPriceDecimals(symbolConfig));
    if (variationEl) {
      variationEl.textContent = `${variation.toFixed(3)}%`;
      variationEl.style.color = variation >= 0 ? "var(--gain)" : "var(--loss)";
    }
    if (sourceEl) sourceEl.textContent = latestTicker.source.toUpperCase();

    renderChart();
  }

  async function resolveDueTrades() {
    const openTrades = trades.filter((trade) => trade.status === "OPEN");
    if (!openTrades.length) return;

    for (const trade of openTrades) {
      const symbolConfig = findSymbolConfigByLabel(trade.symbol);
      const ticker = await getLiveTicker(symbolConfig);
      const resolved = await resolveTrade({ tradeId: trade.tradeId, currentPrice: ticker.price });
      if (resolved.status !== "OPEN") {
        showToast(
          `Operacao ${resolved.tradeId.slice(0, 6)} finalizada: ${resolved.status}`,
          resolved.status === "WIN" ? "success" : "error",
        );
      }
    }

    wallet = await getBalance();
    refreshWalletUI();
    await syncTrades();
  }

  async function openTrade(direction) {
    const symbolCode = symbolSelect.value;
    const symbolConfig = findSymbolConfig(symbolCode);
    const amount = Number(container.querySelector("#trade-amount").value);
    const expirySeconds = Number(container.querySelector("#trade-expiry").value);

    if (symbolConfig.marketType === "stock") {
      showMessage("Trade bloqueado para ações. Selecione um ativo de Cripto para operar.", "error");
      return;
    }

    if (!amount || amount < MIN_TRADE_AMOUNT) {
      showMessage("Valor minimo da ordem: R$ 2,00.");
      return;
    }

    try {
      const live = await getLiveTicker(symbolConfig);
      await createTrade({
        symbol: symbolConfig.label,
        amount,
        direction,
        expirySeconds,
        openPrice: live.price,
      });
      wallet = await getBalance();
      refreshWalletUI();
      await syncTrades();
      showMessage("Operacao aberta com sucesso.", "success");
      showToast(`Ordem ${direction} enviada para ${symbolConfig.label}.`, "success");
    } catch (error) {
      showMessage(error.message || "Nao foi possivel abrir operacao.");
    }
  }

  const onChartMouseMove = (event) => {
    if (isDragging) {
      const deltaX = event.clientX - dragStartX;
      const candlesDelta = Math.round((deltaX / Math.max(chartEl.clientWidth, 1)) * getVisibleCount());
      const targetOffset = dragStartOffset - candlesDelta;
      viewOffset = clamp(targetOffset, 0, getMaxOffset());
      followLatest = viewOffset === 0;
      refreshFollowButton();
      renderChart();
      return;
    }
    updateCrosshair(event.clientX, event.clientY);
  };

  const onWindowMouseMove = (event) => {
    if (!isDragging) return;
    const deltaX = event.clientX - dragStartX;
    const candlesDelta = Math.round((deltaX / Math.max(chartEl.clientWidth, 1)) * getVisibleCount());
    const targetOffset = dragStartOffset - candlesDelta;
    viewOffset = clamp(targetOffset, 0, getMaxOffset());
    followLatest = viewOffset === 0;
    refreshFollowButton();
    renderChart();
  };

  const onChartMouseDown = (event) => {
    isDragging = true;
    dragStartX = event.clientX;
    dragStartOffset = viewOffset;
    chartEl.classList.add("dragging");
  };

  const onWindowMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    chartEl.classList.remove("dragging");
  };

  const onChartWheel = (event) => {
    event.preventDefault();
    const prev = zoomIndex;
    zoomIndex = clamp(zoomIndex + (event.deltaY > 0 ? -1 : 1), 0, ZOOM_FACTORS.length - 1);
    if (zoomIndex !== prev) {
      refreshZoomUI();
      renderChart();
    }
  };

  symbolSelect.addEventListener("change", async () => {
    selectedSymbolCode = symbolSelect.value;
    refreshTradeAvailability();
    await rebuildChartSeries();
  });

  container.querySelectorAll("[data-timeframe]").forEach((button) => {
    button.addEventListener("click", async () => {
      selectedHistoryWindow = button.dataset.timeframe || DEFAULT_HISTORY_WINDOW;
      markActiveTimeframe();
      await rebuildChartSeries();
    });
  });

  container.querySelectorAll("[data-interval]").forEach((button) => {
    button.addEventListener("click", async () => {
      selectedCandleInterval = button.dataset.interval || DEFAULT_CANDLE_INTERVAL;
      markActiveTimeframe();
      await rebuildChartSeries();
    });
  });

  zoomInBtn?.addEventListener("click", () => {
    if (zoomIndex >= ZOOM_FACTORS.length - 1) return;
    zoomIndex += 1;
    refreshZoomUI();
    renderChart();
  });

  zoomOutBtn?.addEventListener("click", () => {
    if (zoomIndex <= 0) return;
    zoomIndex -= 1;
    refreshZoomUI();
    renderChart();
  });

  resetBtn?.addEventListener("click", () => {
    zoomIndex = 0;
    viewOffset = 0;
    followLatest = true;
    refreshZoomUI();
    renderChart();
  });

  followBtn?.addEventListener("click", () => {
    followLatest = !followLatest;
    if (followLatest) viewOffset = 0;
    refreshFollowButton();
    renderChart();
  });

  chartEl.addEventListener("mousemove", onChartMouseMove);
  chartEl.addEventListener("mouseleave", hideCrosshair);
  chartEl.addEventListener("mousedown", onChartMouseDown);
  chartEl.addEventListener("wheel", onChartWheel, { passive: false });
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", onWindowMouseUp);

  container.querySelectorAll("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => openTrade(button.dataset.direction));
  });

  markActiveTimeframe();
  refreshZoomUI();
  refreshTradeAvailability();
  await syncTrades();
  await rebuildChartSeries();
  await refreshTicker();

  marketTimer = setInterval(refreshTicker, MARKET_TICK_MS);
  resolveTimer = setInterval(resolveDueTrades, 1500);

  return () => {
    if (marketTimer) clearInterval(marketTimer);
    if (resolveTimer) clearInterval(resolveTimer);
    window.removeEventListener("mousemove", onWindowMouseMove);
    window.removeEventListener("mouseup", onWindowMouseUp);
  };
}
