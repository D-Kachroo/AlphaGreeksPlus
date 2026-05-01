const defaultContracts = [];

let latestAnalysis = null;
let scenarioTimer = null;
let analysisTimer = null;
let marketTapeState = "";
let latestMarketData = null;
let marketLookupTimer = null;
let marketLookupInFlight = "";

const MARKET_REFRESH_MS = 30 * 60 * 1000;
const BROWSER_MARKET_CACHE_KEY = "alphagreeks.marketCache.v1";

function $(id) {
  return document.getElementById(id);
}

function numberValue(id) {
  const value = String($(id).value).trim();

  return value === "" ? NaN : Number(value);
}

function formatMoney(value) {
  return Number.isFinite(value)
    ? value.toLocaleString(undefined, { style: "currency", currency: "USD" })
    : "-";
}

function formatPercent(value) {
  return Number.isFinite(value)
    ? value.toLocaleString(undefined, { style: "percent", minimumFractionDigits: 2 })
    : "-";
}

function formatSignedMoney(value) {
  return Number.isFinite(value) ? `${value > 0 ? "+" : ""}${formatMoney(value)}` : "-";
}

function formatSignedPercent(value) {
  return Number.isFinite(value) ? `${value > 0 ? "+" : ""}${formatPercent(value)}` : "-";
}

function formatCompact(value) {
  return Number.isFinite(value)
    ? value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })
    : "-";
}

function formatNumber(value, digits = 4) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const rounded = Number(value.toFixed(digits));
  return Math.abs(rounded) === 0 ? (0).toFixed(digits) : rounded.toFixed(digits);
}

function signedValue(value, suffix = "") {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "-";
  }

  return `${number > 0 ? "+" : ""}${value}${suffix}`;
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function currentSymbol() {
  return $("symbol").value.trim().toUpperCase();
}

function validLookupSymbol(symbol) {
  return /^[A-Z][A-Z.\-]{0,9}$/.test(String(symbol || "").trim().toUpperCase());
}

function readBrowserMarketCache() {
  try {
    return JSON.parse(window.localStorage.getItem(BROWSER_MARKET_CACHE_KEY) || "{}");
  } catch (_error) {
    return {};
  }
}

function writeBrowserMarketCache(cache) {
  try {
    window.localStorage.setItem(BROWSER_MARKET_CACHE_KEY, JSON.stringify(cache));
  } catch (_error) {
    // Ignore browser storage failures.
  }
}

function storeBrowserMarketData(data) {
  if (!data?.symbol) {
    return;
  }

  const cache = readBrowserMarketCache();
  cache[data.symbol] = {
    data,
    timestamp: Date.now(),
  };
  writeBrowserMarketCache(cache);
}

function loadBrowserMarketData(symbol) {
  const entry = readBrowserMarketCache()[symbol];

  if (!entry?.data) {
    return null;
  }

  return {
    ...entry.data,
    stale: true,
    cacheAgeMs: Date.now() - Number(entry.timestamp || Date.now()),
  };
}

function roundedInput(value, digits = 4) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function roundToIncrement(value, increment) {
  return Math.max(increment, Math.round(value / increment) * increment);
}

function strikeIncrement(price) {
  if (price < 25) {
    return 1;
  }

  if (price < 100) {
    return 2.5;
  }

  if (price < 250) {
    return 5;
  }

  return 10;
}

function roundStrike(value, increment) {
  return roundToIncrement(value, increment);
}

function estimatedMove(price, volatility, years, increment) {
  const safeVolatility = Number.isFinite(volatility) && volatility > 0 ? volatility : 0.2;
  return Math.max(increment, price * safeVolatility * Math.sqrt(years));
}

function generatedContractsFromMarket(price, volatility) {
  if (!Number.isFinite(price) || price <= 0) {
    return [];
  }

  const increment = strikeIncrement(price);
  const atTheMoney = roundToIncrement(price, increment);
  const quarterMove = estimatedMove(price, volatility, 0.25, increment);
  const halfYearMove = estimatedMove(price, volatility, 0.5, increment);
  const callMidStrike = Math.max(
    atTheMoney + increment,
    roundStrike(atTheMoney + quarterMove * 0.35, increment)
  );
  const callFarStrike = Math.max(
    callMidStrike + increment,
    roundStrike(atTheMoney + halfYearMove * 0.75, increment)
  );
  const putMidStrike = Math.max(
    increment,
    Math.min(atTheMoney - increment, roundStrike(atTheMoney - quarterMove * 0.35, increment))
  );
  const putFarStrike = Math.max(
    increment,
    Math.min(putMidStrike - increment, roundStrike(atTheMoney - halfYearMove * 0.75, increment))
  );
  const spotPrice = roundedInput(price, 2);
  const optionVolatility = roundedInput(Number.isFinite(volatility) && volatility > 0 ? volatility : 0.2, 4);
  const base = {
    spotPrice,
    riskFreeRate: 0.05,
    volatility: optionVolatility,
    dividendYield: 0,
  };

  return [
    { ...base, type: "call", strikePrice: roundedInput(atTheMoney, 2), timeToExpirationYears: 0.25 },
    { ...base, type: "call", strikePrice: roundedInput(callMidStrike, 2), timeToExpirationYears: 0.5 },
    { ...base, type: "call", strikePrice: roundedInput(callFarStrike, 2), timeToExpirationYears: 0.5 },
    { ...base, type: "put", strikePrice: roundedInput(putMidStrike, 2), timeToExpirationYears: 0.5 },
    { ...base, type: "put", strikePrice: roundedInput(putFarStrike, 2), timeToExpirationYears: 0.75 },
  ];
}

function setRunStatus(text) {
  if (text) {
    console.debug(text);
  }
}

function setApiStatus(text, state = "live") {
  const status = $("apiStatus");

  if (!status) {
    return;
  }

  status.classList.remove("status-live", "status-cached", "status-offline");
  status.classList.add(`status-${state}`);
  status.innerHTML = `${text}<i></i>`;
}

function signalDirectionText(mispricingPercent) {
  if (mispricingPercent > 0) {
    return "Bullish";
  }

  if (mispricingPercent < 0) {
    return "Bearish";
  }

  return "Neutral";
}

function signalStrengthText(mispricingPercent) {
  const edge = Math.abs(mispricingPercent);

  if (edge >= 0.15) {
    return "Strong";
  }

  if (edge >= 0.05) {
    return "Medium";
  }

  if (edge > 0) {
    return "Low";
  }

  return "Neutral";
}

function tradeSignalText(result) {
  const trade = result.bestTrade;
  const alpha = result.alpha;

  if (!trade) {
    return "No Trade";
  }

  const scoreText = formatNumber(trade.score, 1);

  if ((alpha?.confidence ?? 0) < 0.25) {
    return `Low Confidence (${scoreText})`;
  }

  if (trade.score < 0) {
    return `Avoid (${scoreText})`;
  }

  const strength = signalStrengthText(alpha?.mispricingPercent ?? 0);

  if (strength === "Neutral") {
    return `Neutral (${scoreText})`;
  }

  return `${strength} ${signalDirectionText(alpha?.mispricingPercent ?? 0)} (${scoreText})`;
}

function tradeSignalClass(result) {
  const trade = result.bestTrade;
  const alpha = result.alpha;

  if (!trade || trade.score < 0) {
    return "signal-avoid";
  }

  if ((alpha?.confidence ?? 0) < 0.25) {
    return "signal-low";
  }

  return (alpha?.mispricingPercent ?? 0) >= 0 ? "signal-bullish" : "signal-bearish";
}

function tradeSignalCardClass(result) {
  const signalClass = tradeSignalClass(result);

  if (signalClass === "signal-bullish") {
    return "signal-card-bullish";
  }

  if (signalClass === "signal-bearish") {
    return "signal-card-bearish";
  }

  if (signalClass === "signal-low") {
    return "signal-card-low";
  }

  return "signal-card-avoid";
}

function setTradeSignalMetric(metric, result) {
  const trade = result.bestTrade;
  const alpha = result.alpha;

  metric.replaceChildren();

  if (trade && (alpha?.confidence ?? 0) < 0.25) {
    const score = document.createElement("span");
    score.className = "signal-score";
    score.textContent = `(${formatNumber(trade.score, 1)})`;
    metric.append(document.createTextNode("Low Confidence"), score);
    return;
  }

  metric.textContent = tradeSignalText(result);
}

async function loadHealthStatus() {
  try {
    await fetch("/api/health");
    setApiStatus("Online", "live");
  } catch (_error) {
    setApiStatus("Offline", "offline");
  }
}

function updateContractMarketInputs(marketPrice, volatility) {
  if (document.querySelectorAll(".contract-row").length === 0) {
    generatedContractsFromMarket(marketPrice, volatility).forEach(addContract);
    return;
  }

  document.querySelectorAll(".contract-row").forEach((row) => {
    const spotInput = row.querySelector('[data-field="spotPrice"]');
    const volatilityInput = row.querySelector('[data-field="volatility"]');

    if (spotInput && Number.isFinite(marketPrice) && marketPrice > 0) {
      spotInput.value = roundedInput(marketPrice, 2);
    }

    if (volatilityInput && Number.isFinite(volatility) && volatility > 0) {
      volatilityInput.value = roundedInput(volatility, 4);
    }
  });
}

function applyMarketData(data) {
  if (!data || data.symbol !== currentSymbol()) {
    return false;
  }

  const previousSymbol = latestMarketData?.symbol;
  latestMarketData = data;

  if (previousSymbol && previousSymbol !== data.symbol) {
    resetContracts();
  }

  if (Number.isFinite(data.lastPrice) && data.lastPrice > 0) {
    $("marketPrice").value = roundedInput(data.lastPrice, 2);
  }

  if (Number.isFinite(data.expectedReturn)) {
    $("expectedReturn").value = roundedInput(data.expectedReturn, 4);
  }

  if (Number.isFinite(data.volatility) && data.volatility > 0) {
    $("signalVolatility").value = roundedInput(data.volatility, 4);
  }

  storeBrowserMarketData(data);
  setApiStatus(data.stale ? "Cached" : "Online", data.stale ? "cached" : "live");

  updateContractMarketInputs(data.lastPrice, data.volatility);
  updateDeskWidgets();
  updateMarketTape();
  return true;
}

async function refreshMarketData(options = {}) {
  const symbol = currentSymbol();

  if (!symbol || !validLookupSymbol(symbol)) {
    return false;
  }

  if (!options.force && latestMarketData?.symbol === symbol) {
    return true;
  }

  if (marketLookupInFlight === symbol) {
    return false;
  }

  try {
    marketLookupInFlight = symbol;
    const response = await fetch(`/api/market/${encodeURIComponent(symbol)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Market data unavailable.");
    }

    if (applyMarketData(data) && options.runAnalysis !== false) {
      scheduleAnalysisRun();
    }

    return true;
  } catch (error) {
    const cachedData = loadBrowserMarketData(symbol);

    if (cachedData && applyMarketData(cachedData)) {
      if (options.runAnalysis !== false) {
        scheduleAnalysisRun();
      }

      return true;
    }

    setRunStatus(error.message);
    if (latestMarketData) {
      setApiStatus("Cached", "cached");
    } else {
      setApiStatus("Offline", "offline");
    }
    updateDeskWidgets();
    return false;
  } finally {
    if (marketLookupInFlight === symbol) {
      marketLookupInFlight = "";
    }
  }
}

function scheduleMarketLookup(delay = 0, options = {}) {
  window.clearTimeout(marketLookupTimer);
  marketLookupTimer = window.setTimeout(() => {
    refreshMarketData(options).catch((error) => setRunStatus(error.message));
  }, delay);
}

function clearMarketDerivedInputs() {
  latestMarketData = null;
  $("marketPrice").value = "";
  $("expectedReturn").value = "";
  $("signalVolatility").value = "";
  resetContracts();
  updateDeskWidgets();
  updateMarketTape();
  clearAnalysisOutputs();
}

function updateSliderLabels() {
  $("confidenceValue").textContent = Number($("confidence").value).toFixed(2);
  $("spotMoveValue").textContent = `${$("spotMovePercent").value}%`;
  $("volMoveValue").textContent = `${$("volatilityMovePercent").value}%`;
  $("daysValue").textContent = $("daysForward").value;
  $("rateMoveValue").textContent = `${$("rateMoveBasisPoints").value} bps`;
}

function tapeTone(value) {
  if (value > 0) {
    return "up";
  }

  if (value < 0) {
    return "down";
  }

  return "flat";
}

function createTapeCell(item) {
  const wrapper = document.createElement("span");
  const venue = document.createElement("i");
  const symbol = document.createElement("b");
  const price = document.createElement("em");
  const change = document.createElement("small");

  wrapper.className = "tape-cell";
  venue.textContent = item.venue;
  symbol.textContent = item.symbol;
  price.textContent = item.price;
  price.className = item.tone;
  change.textContent = item.change;
  change.className = item.tone;
  wrapper.append(venue, symbol, price, change);
  return wrapper;
}

function updateMarketTape() {
  const track = $("tapeTrack");

  if (!track) {
    return;
  }

  const symbol = $("symbol").value.trim().toUpperCase() || "SYMBOL";
  const spotMove = numberValue("spotMovePercent");
  const volMove = numberValue("volatilityMovePercent");
  const daysForward = numberValue("daysForward");
  const rateMove = numberValue("rateMoveBasisPoints");
  const confidence = numberValue("confidence");
  const marketPrice = numberValue("marketPrice");
  const fairValue = numberValue("fairValueEstimate");
  const hasMarketPrice = Number.isFinite(marketPrice) && marketPrice > 0;
  const priceGap = Number.isFinite(marketPrice) && marketPrice > 0 ? ((fairValue - marketPrice) / marketPrice) * 100 : NaN;
  const ivRank = Math.max(1, Math.min(99, Math.round(50 + volMove * 0.7)));
  const lastPrice = hasMarketPrice ? marketPrice * (1 + spotMove / 100) : NaN;
  const tsxPrice = hasMarketPrice ? marketPrice * 0.74 * (1 + spotMove / 220) : NaN;
  const spyChange = Number.isFinite(spotMove) ? spotMove * 0.42 : NaN;
  const qqqChange = Number.isFinite(spotMove) ? spotMove * 0.58 : NaN;
  const vixChange = Number.isFinite(volMove) ? volMove * 0.55 : NaN;
  const decayMode = daysForward > 90 ? "LOW DECAY" : daysForward > 30 ? "MID DECAY" : "FAST DECAY";
  const confidenceText = Number.isFinite(confidence) ? Math.round(confidence * 100) : NaN;
  const items = [
    {
      venue: "NYSE",
      symbol,
      price: hasMarketPrice ? formatMoney(lastPrice) : "-",
      change: signedValue(Number.isFinite(spotMove) ? spotMove.toFixed(2) : NaN, "%"),
      tone: tapeTone(spotMove),
    },
    {
      venue: "TSX",
      symbol: `${symbol}.TO`,
      price: hasMarketPrice ? formatMoney(tsxPrice) : "-",
      change: signedValue(Number.isFinite(spotMove) ? (spotMove / 2.2).toFixed(2) : NaN, "%"),
      tone: tapeTone(spotMove),
    },
    {
      venue: "ARCA",
      symbol: "SPY",
      price: hasMarketPrice ? formatMoney(marketPrice * 4.91 * (1 + spyChange / 100)) : "-",
      change: signedValue(Number.isFinite(spyChange) ? spyChange.toFixed(2) : NaN, "%"),
      tone: tapeTone(spyChange),
    },
    {
      venue: "NASDAQ",
      symbol: "QQQ",
      price: hasMarketPrice ? formatMoney(marketPrice * 4.22 * (1 + qqqChange / 100)) : "-",
      change: signedValue(Number.isFinite(qqqChange) ? qqqChange.toFixed(2) : NaN, "%"),
      tone: tapeTone(qqqChange),
    },
    {
      venue: "CBOE",
      symbol: "VIX",
      price: Number.isFinite(vixChange) ? `${Math.max(8, 18 + vixChange).toFixed(2)}` : "-",
      change: signedValue(Number.isFinite(vixChange) ? vixChange.toFixed(2) : NaN, "%"),
      tone: tapeTone(vixChange),
    },
    {
      venue: "OPRA",
      symbol: "IVR",
      price: `${ivRank}`,
      change: signedValue(volMove, "% VOL"),
      tone: ivRank >= 50 ? "up" : "down",
    },
    {
      venue: "RATES",
      symbol: "10Y",
      price: `${(4.35 + rateMove / 100).toFixed(2)}%`,
      change: signedValue(rateMove, " bps"),
      tone: tapeTone(rateMove),
    },
    {
      venue: "RISK",
      symbol: "CONF",
      price: Number.isFinite(confidenceText) ? `${confidenceText}%` : "-",
      change: Number.isFinite(priceGap) ? signedValue(priceGap.toFixed(1), "% GAP") : "-",
      tone: confidence >= 0.7 ? "up" : confidence >= 0.4 ? "flat" : "down",
    },
    {
      venue: "GREEKS",
      symbol: "THETA",
      price: decayMode,
      change: `${Number.isFinite(daysForward) ? daysForward : "-"}D`,
      tone: daysForward > 30 ? "flat" : "down",
    },
  ];
  const nextTapeState = JSON.stringify(items);

  if (nextTapeState === marketTapeState) {
    return;
  }

  marketTapeState = nextTapeState;
  track.replaceChildren();

  [0, 1].forEach(() => {
    const group = document.createElement("div");
    group.className = "tape-group";
    items.forEach((item) => group.appendChild(createTapeCell(item)));
    track.appendChild(group);
  });

  window.requestAnimationFrame(() => {
    const group = track.querySelector(".tape-group");

    if (group) {
      track.style.setProperty("--tape-duration", `${Math.max(28, group.scrollWidth / 48)}s`);
    }
  });
}

function updateDeskWidgets() {
  if (!$("deskClock")) {
    return;
  }

  const now = new Date();
  const symbol = currentSymbol() || "SYMBOL";
  const marketData = latestMarketData?.symbol === symbol ? latestMarketData : null;
  const livePrice = Number(marketData?.lastPrice);
  const marketPrice = Number.isFinite(livePrice) && livePrice > 0 ? livePrice : numberValue("marketPrice");
  const hasMarketPrice = Number.isFinite(marketPrice) && marketPrice > 0;
  const spread = hasMarketPrice ? Math.max(marketPrice * 0.0004, 0.01) : 0;
  const bid = marketPrice - spread / 2;
  const ask = marketPrice + spread / 2;
  const volume = Number(marketData?.volume) || (hasMarketPrice ? Math.round(marketPrice * 24680) : NaN);
  const optionCount = document.querySelectorAll(".contract-row").length;

  $("deskClock").textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  $("deskNbbo").textContent = hasMarketPrice ? `${symbol} ${formatMoney(bid)} x ${formatMoney(ask)}` : "-";
  $("deskSpread").textContent = hasMarketPrice ? formatMoney(spread) : "-";
  $("deskVolume").textContent = formatCompact(volume);
  $("deskOpenInterest").textContent = `${optionCount} Options`;
  updateMarketTape();
}

function setContractPlaceholders(row) {
  const placeholders = {
    spotPrice: "Stock price",
    strikePrice: "Strike price",
    riskFreeRate: "Risk-free rate",
    volatility: "Volatility",
    timeToExpirationYears: "Years",
    dividendYield: "Dividend yield",
  };

  Object.entries(placeholders).forEach(([field, label]) => {
    row.querySelector(`[data-field="${field}"]`).placeholder = label;
  });
}

function addContract(contract) {
  const template = $("contractTemplate");
  const row = template.content.firstElementChild.cloneNode(true);

  setContractPlaceholders(row);

  Object.entries(contract).forEach(([field, value]) => {
    const input = row.querySelector(`[data-field="${field}"]`);

    if (input) {
      input.value = value;
    }
  });

  row.querySelector('[data-action="remove"]').addEventListener("click", () => {
    row.remove();
    updateDeskWidgets();
    runAll();
  });

  $("contracts").appendChild(row);
  updateDeskWidgets();
}

function resetContracts() {
  $("contracts").replaceChildren();
  defaultContracts.forEach(addContract);
}

function readContracts() {
  return [...document.querySelectorAll(".contract-row")].map((row) => ({
    type: row.querySelector('[data-field="type"]').value,
    spotPrice: Number(row.querySelector('[data-field="spotPrice"]').value),
    strikePrice: Number(row.querySelector('[data-field="strikePrice"]').value),
    riskFreeRate: Number(row.querySelector('[data-field="riskFreeRate"]').value),
    volatility: Number(row.querySelector('[data-field="volatility"]').value),
    timeToExpirationYears: Number(row.querySelector('[data-field="timeToExpirationYears"]').value),
    dividendYield: Number(row.querySelector('[data-field="dividendYield"]').value),
  }));
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function hasCompleteContracts(contracts) {
  return (
    contracts.length > 0 &&
    contracts.every(
      (contract) =>
        contract.spotPrice > 0 &&
        contract.strikePrice > 0 &&
        contract.riskFreeRate >= 0 &&
        contract.volatility >= 0 &&
        contract.timeToExpirationYears > 0 &&
        contract.dividendYield >= 0
    )
  );
}

function hasAnalysisInputs() {
  return (
    Boolean(currentSymbol()) &&
    numberValue("marketPrice") > 0 &&
    numberValue("fairValueEstimate") > 0 &&
    Number.isFinite(numberValue("expectedReturn")) &&
    numberValue("signalVolatility") >= 0 &&
    Number.isFinite(numberValue("confidence")) &&
    hasCompleteContracts(readContracts())
  );
}

function buildAnalysisPayload() {
  const marketPrice = numberValue("marketPrice");

  return {
    signal: {
      symbol: $("symbol").value.trim().toUpperCase(),
      marketPrice,
      fairValueEstimate: numberValue("fairValueEstimate"),
      expectedReturn: numberValue("expectedReturn"),
      volatility: numberValue("signalVolatility"),
      confidence: numberValue("confidence"),
    },
    maxPremium: finiteOr(numberValue("maxPremium"), 0.0),
    maxAbsoluteDelta: finiteOr(numberValue("maxAbsoluteDelta"), 1.0),
    contracts: readContracts(),
  };
}

function contractForTrade(trade) {
  if (!trade) {
    return readContracts()[0];
  }

  return (
    readContracts().find(
      (contract) =>
        contract.type === trade.type &&
        Math.abs(contract.strikePrice - trade.strikePrice) < 1e-8 &&
        Math.abs(contract.timeToExpirationYears - trade.timeToExpirationYears) < 1e-8
    ) || readContracts()[0]
  );
}

function buildScenarioPayload() {
  const option = contractForTrade(latestAnalysis?.bestTrade);

  return {
    option,
    spotMovePercent: numberValue("spotMovePercent"),
    volatilityMovePercent: numberValue("volatilityMovePercent"),
    daysForward: numberValue("daysForward"),
    rateMoveBasisPoints: numberValue("rateMoveBasisPoints"),
  };
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Request failed.");
  }

  return result;
}

function updateAnalysisMetrics(result) {
  const alpha = result.alpha;
  const trade = result.bestTrade;
  const ratingMetric = $("ratingMetric");
  const ratingCard = ratingMetric.closest(".metric");
  const tradeMetric = $("tradeMetric");
  const tradeCard = tradeMetric.closest(".metric");

  setTradeSignalMetric(ratingMetric, result);
  ratingMetric.className = tradeSignalClass(result);
  ratingCard.classList.remove(
    "signal-card-bullish",
    "signal-card-bearish",
    "signal-card-low",
    "signal-card-avoid"
  );
  ratingCard.classList.add(tradeSignalCardClass(result));
  $("mispricingMetric").textContent = formatPercent(alpha?.mispricingPercent);
  updateAlphaPanel(alpha);

  if (!trade) {
    tradeMetric.textContent = "-";
    tradeMetric.className = "";
    tradeCard.classList.remove("call-card", "put-card");
    $("premiumMetric").textContent = "-";
    updateGreekRiskPanel(null);
    return;
  }

  tradeMetric.textContent = `${titleCase(trade.side)} ${titleCase(trade.type)} $${formatNumber(
    trade.strikePrice,
    0
  )}`;
  tradeMetric.className = trade.type === "call" ? "trade-call" : "trade-put";
  tradeCard.classList.toggle("call-card", trade.type === "call");
  tradeCard.classList.toggle("put-card", trade.type === "put");
  $("premiumMetric").textContent = formatMoney(trade.estimatedPremium);
  updateGreekRiskPanel(trade.greeks);
}

function updateAlphaPanel(alpha) {
  if (!$("alphaSignalMetric")) {
    return;
  }

  const marketPrice = numberValue("marketPrice");
  const fairValue = numberValue("fairValueEstimate");
  const expectedReturn = numberValue("expectedReturn");
  const confidence = Number(alpha?.confidence);
  const gap = Number.isFinite(marketPrice) && Number.isFinite(fairValue) ? fairValue - marketPrice : NaN;
  const gapPercent = Number.isFinite(gap) && marketPrice > 0 ? gap / marketPrice : NaN;
  const weightedEdge = Number.isFinite(gapPercent) && Number.isFinite(confidence) ? gapPercent * confidence : NaN;
  const safeMarket = Number.isFinite(marketPrice) ? marketPrice : 0;
  const safeFair = Number.isFinite(fairValue) ? fairValue : safeMarket;
  const low = Math.min(safeMarket, safeFair);
  const high = Math.max(safeMarket, safeFair);
  const range = Math.max(high - low, Math.abs(high) * 0.08, 1);
  const min = low - range * 0.25;
  const max = high + range * 0.25;
  const markerPosition = (value) => `${Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))}%`;
  const fillStart = Number.isFinite(marketPrice) ? Number(markerPosition(marketPrice).replace("%", "")) : 50;
  const fillEnd = Number.isFinite(fairValue) ? Number(markerPosition(fairValue).replace("%", "")) : 50;
  const positive = Number.isFinite(gap) ? gap >= 0 : true;

  $("alphaSignalMetric").textContent = formatSignedMoney(gap);
  $("alphaGapMetric").textContent = formatSignedPercent(weightedEdge);
  $("alphaConfidenceMetric").textContent = formatPercent(expectedReturn);
  $("alphaMarketPriceMetric").textContent = formatMoney(marketPrice);
  $("alphaFairValueMetric").textContent = formatMoney(fairValue);
  $("alphaGaugeMetric").textContent = formatSignedPercent(gapPercent);
  $("alphaCaption").textContent =
    Number.isFinite(gap)
      ? `${
          positive ? "Fair value is above market price" : "Fair value is below market price"
        }. Fair-value gap: ${formatSignedPercent(gapPercent)} = (Fair Value - Market Price) / Market Price.`
      : "-";
  $("alphaMarketMarker").style.left = Number.isFinite(marketPrice) ? markerPosition(marketPrice) : "50%";
  $("alphaFairMarker").style.left = Number.isFinite(fairValue) ? markerPosition(fairValue) : "50%";
  $("alphaMeterFill").style.marginLeft = `${Math.min(fillStart, fillEnd)}%`;
  $("alphaMeterFill").style.width = `${Math.abs(fillEnd - fillStart)}%`;
  $("alphaMeterFill").style.background = positive ? "var(--green)" : "var(--rose)";
  $("alphaFairMarker").style.background = positive ? "var(--green)" : "var(--rose)";
}

function updateGreekRiskPanel(greeks) {
  if (!$("greekDeltaView")) {
    return;
  }

  if (!greeks) {
    ["greekDeltaView", "greekGammaView", "greekThetaView", "greekVegaView", "greekRhoView"].forEach((id) => {
      $(id).textContent = "-";
    });
    return;
  }

  $("greekDeltaView").textContent = `${formatNumber(greeks.delta, 4)} / $1`;
  $("greekGammaView").textContent = `${formatNumber(greeks.gamma, 4)} / $1`;
  $("greekThetaView").textContent = `${formatNumber(greeks.theta, 4)} / day`;
  $("greekVegaView").textContent = `${formatNumber(greeks.vega, 4)} / 1%`;
  $("greekRhoView").textContent = `${formatNumber(greeks.rho, 4)} / 1%`;
}

function clearAnalysisOutputs() {
  latestAnalysis = null;
  ["ratingMetric", "mispricingMetric", "tradeMetric", "premiumMetric"].forEach((id) => {
    $(id).textContent = "-";
    $(id).className = "";
  });
  document.querySelectorAll(".metric").forEach((card) => {
    card.classList.remove(
      "call-card",
      "put-card",
      "signal-card-bullish",
      "signal-card-bearish",
      "signal-card-low",
      "signal-card-avoid"
    );
  });
  ["basePriceMetric", "stressedPriceMetric", "pnlMetric"].forEach((id) => {
    $(id).textContent = "-";
    $(id).className = "";
  });
  updateAlphaPanel(null);
  updateGreekRiskPanel(null);
  window.AlphaGreeksCharts.renderTradeScores([]);
  window.AlphaGreeksCharts.renderGreeksRadar(null);
  window.AlphaGreeksCharts.renderScenarioCharts(null);
}

function updateScenarioMetrics(result) {
  $("basePriceMetric").textContent = formatMoney(result.baseOptionPrice);
  $("stressedPriceMetric").textContent = formatMoney(result.stressedOptionPrice);
  $("pnlMetric").textContent = formatMoney(result.profitLoss);
  $("pnlMetric").className = result.profitLoss >= 0 ? "positive" : "negative";
}

async function runAnalysis() {
  if (!hasAnalysisInputs()) {
    clearAnalysisOutputs();
    return null;
  }

  setRunStatus("Analyzing");
  const result = await postJson("/api/analyze", buildAnalysisPayload());
  latestAnalysis = result;
  updateAnalysisMetrics(result);
  window.AlphaGreeksCharts.renderTradeScores(result.rankedTrades);
  window.AlphaGreeksCharts.renderGreeksRadar(result.bestTrade?.greeks);
  setRunStatus("Analysis Ready");
  return result;
}

async function runScenario() {
  if (!latestAnalysis?.bestTrade || !contractForTrade(latestAnalysis.bestTrade)) {
    return null;
  }

  setRunStatus("Simulating");
  const payload = buildScenarioPayload();
  const result = await postJson("/api/simulate", payload);
  updateScenarioMetrics(result);
  window.AlphaGreeksCharts.renderScenarioCharts(result, {
    option: payload.option,
    bestTrade: latestAnalysis.bestTrade,
    expectedReturn: numberValue("expectedReturn"),
    marketPrice: numberValue("marketPrice"),
    volatility: numberValue("signalVolatility"),
  });
  setRunStatus("Scenario Ready");
  return result;
}

function scheduleScenarioRun() {
  updateSliderLabels();
  updateMarketTape();
  window.clearTimeout(scenarioTimer);
  scenarioTimer = window.setTimeout(() => {
    runScenario().catch((error) => setRunStatus(error.message));
  }, 180);
}

function scheduleAnalysisRun() {
  updateSliderLabels();
  updateMarketTape();
  window.clearTimeout(analysisTimer);
  analysisTimer = window.setTimeout(runAll, 220);
}

async function runAll() {
  try {
    const analysis = await runAnalysis();

    if (!analysis) {
      return;
    }

    await runScenario();
  } catch (error) {
    setRunStatus(error.message);
  }
}

function bindEvents() {
  $("analysisForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      if (currentSymbol() && latestMarketData?.symbol !== currentSymbol()) {
        await refreshMarketData({ runAnalysis: false, force: true });
      }

      await runAnalysis();
      await runScenario();
    } catch (error) {
      setRunStatus(error.message);
    }
  });

  $("analysisForm").addEventListener("input", updateDeskWidgets);
  $("scenarioForm").addEventListener("input", updateMarketTape);
  $("symbol").addEventListener("input", () => {
    if (!currentSymbol() || latestMarketData?.symbol !== currentSymbol()) {
      clearMarketDerivedInputs();
    }
  });
  $("symbol").addEventListener("blur", () => scheduleMarketLookup(0, { force: true }));
  $("symbol").addEventListener("change", () => scheduleMarketLookup(0, { force: true }));

  $("scenarioForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await runScenario();
    } catch (error) {
      setRunStatus(error.message);
    }
  });

  $("addContractButton").addEventListener("click", () => {
    const marketPrice = numberValue("marketPrice");
    const volatility = numberValue("signalVolatility");

    addContract({
      type: "call",
      spotPrice: roundedInput(marketPrice, 2),
      strikePrice: roundedInput(marketPrice, 2),
      riskFreeRate: 0.05,
      volatility: roundedInput(volatility, 4),
      timeToExpirationYears: 1,
      dividendYield: 0,
    });
    runAll();
  });

  $("resetButton").addEventListener("click", () => {
    $("symbol").value = "";
    $("marketPrice").value = "";
    $("fairValueEstimate").value = "";
    $("expectedReturn").value = "";
    $("signalVolatility").value = "";
    $("confidence").value = 0.5;
    $("maxPremium").value = "";
    $("maxAbsoluteDelta").value = "";
    latestMarketData = null;
    resetContracts();
    updateSliderLabels();
    updateDeskWidgets();
    updateMarketTape();
    clearAnalysisOutputs();
  });

  $("confidence").addEventListener("input", scheduleAnalysisRun);

  [
    "marketPrice",
    "fairValueEstimate",
    "expectedReturn",
    "signalVolatility",
    "maxPremium",
    "maxAbsoluteDelta",
  ].forEach((id) => {
    $(id).addEventListener("input", scheduleAnalysisRun);
  });

  $("contracts").addEventListener("input", scheduleAnalysisRun);

  $("contracts").addEventListener("change", () => {
    updateDeskWidgets();
    runAll();
  });

  ["spotMovePercent", "volatilityMovePercent", "daysForward", "rateMoveBasisPoints"].forEach((id) => {
    $(id).addEventListener("input", scheduleScenarioRun);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  window.AlphaGreeksCharts.initializeCharts();
  resetContracts();
  updateSliderLabels();
  bindEvents();
  updateDeskWidgets();
  updateMarketTape();
  window.setInterval(updateDeskWidgets, 1000);
  window.setInterval(() => {
    if (document.visibilityState === "visible" && currentSymbol()) {
      refreshMarketData({ force: true }).catch((error) => setRunStatus(error.message));
    }
  }, MARKET_REFRESH_MS);
  await loadHealthStatus();
  clearAnalysisOutputs();
});
