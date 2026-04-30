const fs = require("fs");
const path = require("path");

const BASE_URL = "https://www.alphavantage.co/query";
const TRADING_DAYS_PER_YEAR = 252;
// Alpha Vantage free data is tightly rate-limited and this app primarily uses
// daily history, so a longer cache window keeps the public demo usable.
const CACHE_MS = 12 * 60 * 60 * 1000;
const CACHE_PATH = path.join(__dirname, "..", "..", "data", "market-cache.json");

const marketCache = new Map();

function ensureCacheDirectory() {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
}

function loadPersistentCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) {
      return;
    }

    const payload = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));

    Object.entries(payload).forEach(([symbol, entry]) => {
      if (entry?.data && Number.isFinite(entry?.timestamp)) {
        marketCache.set(symbol, entry);
      }
    });
  } catch (_error) {
    // Ignore cache boot errors and keep the live app running.
  }
}

function persistCache() {
  try {
    ensureCacheDirectory();
    fs.writeFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(marketCache), null, 2));
  } catch (_error) {
    // Ignore cache write errors; live fetches are still the primary source.
  }
}

function apiKeys() {
  const rawKeys = process.env.ALPHA_VANTAGE_API_KEY;

  if (!rawKeys) {
    const error = new Error("ALPHA_VANTAGE_API_KEY is required.");
    error.statusCode = 500;
    throw error;
  }

  const keys = rawKeys
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    const error = new Error("ALPHA_VANTAGE_API_KEY is required.");
    error.statusCode = 500;
    throw error;
  }

  return keys;
}

async function fetchAlphaVantage(params) {
  const keys = apiKeys();
  let lastError = null;

  for (const apiKey of keys) {
    const url = new URL(BASE_URL);

    Object.entries({ ...params, apikey: apiKey }).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const response = await fetch(url);

    if (!response.ok) {
      const error = new Error(`Alpha Vantage request failed with status ${response.status}.`);
      error.statusCode = 502;
      throw error;
    }

    const payload = await response.json();

    if (payload["Error Message"]) {
      const error = new Error("Alpha Vantage did not find market data for this symbol.");
      error.statusCode = 400;
      throw error;
    }

    if (payload.Note || payload.Information) {
      lastError = new Error(
        payload.Information
          ? "Alpha Vantage daily request limit reached. Please try again later."
          : "Alpha Vantage request limit reached. Please wait and try again."
      );
      lastError.statusCode = 429;
      continue;
    }

    return payload;
  }

  throw lastError;
}

function numberFromField(source, key) {
  const value = Number(source?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function percentFromField(source, key) {
  const value = Number(String(source?.[key] || "0").replace("%", ""));
  return Number.isFinite(value) ? value / 100 : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseDailyCloses(payload) {
  const series = payload["Time Series (Daily)"] || payload["Time Series (Daily Adjusted)"] || {};

  return Object.entries(series)
    .map(([date, row]) => ({
      date,
      close: numberFromField(row, "5. adjusted close") || numberFromField(row, "4. close"),
      volume: numberFromField(row, "6. volume") || numberFromField(row, "5. volume"),
    }))
    .filter((point) => point.close > 0)
    .sort((left, right) => (left.date < right.date ? 1 : -1));
}

function annualizedTrailingReturn(points) {
  if (points.length < 2) {
    return NaN;
  }

  const newest = points[0];
  const oldest = points[Math.min(points.length - 1, 63)];
  const periods = Math.max(1, points.indexOf(oldest));

  if (!newest.close || !oldest.close) {
    return NaN;
  }

  return Math.pow(newest.close / oldest.close, TRADING_DAYS_PER_YEAR / periods) - 1;
}

function estimateReturnAndVolatility(points, quoteChangePercent) {
  const returns = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const today = points[index].close;
    const yesterday = points[index + 1].close;

    if (today > 0 && yesterday > 0) {
      returns.push(today / yesterday - 1);
    }
  }

  if (returns.length < 2) {
    return {
      // If Alpha Vantage rate-limits daily history, the live quote is still useful,
      // but one day of movement should stay a modest directional fallback.
      expectedReturn: clamp(quoteChangePercent, -0.25, 0.25),
      volatility: 0.2,
    };
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const averageReturn = mean * TRADING_DAYS_PER_YEAR;
  const momentumReturn = annualizedTrailingReturn(points);
  const expectedReturn = Number.isFinite(momentumReturn)
    ? 0.65 * momentumReturn + 0.35 * averageReturn
    : averageReturn;

  return {
    expectedReturn: clamp(expectedReturn, -1, 1),
    volatility: clamp(Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR), 0.01, 2),
  };
}

function buildMarketSnapshot(symbol, quotePayload, dailyPayload) {
  const quote = quotePayload["Global Quote"] || {};
  const dailyPoints = parseDailyCloses(dailyPayload);
  const latestDaily = dailyPoints[0] || {};
  const previousDaily = dailyPoints[1] || {};
  const lastPrice = numberFromField(quote, "05. price") || latestDaily.close || 0;
  const previousClose = numberFromField(quote, "08. previous close") || previousDaily.close || 0;
  const changePercent =
    percentFromField(quote, "10. change percent") ||
    (previousClose > 0 ? (lastPrice - previousClose) / previousClose : 0);
  const metrics = estimateReturnAndVolatility(dailyPoints, changePercent);

  return {
    symbol,
    lastPrice,
    previousClose,
    changePercent,
    volume: numberFromField(quote, "06. volume") || latestDaily.volume || 0,
    latestTradingDay: quote["07. latest trading day"] || latestDaily.date || "",
    expectedReturn: metrics.expectedReturn,
    volatility: metrics.volatility,
    expectedReturnSource: dailyPoints.length >= 2 ? "Alpha Vantage daily history" : "Alpha Vantage quote change",
    source: "Alpha Vantage",
    fetchedAt: new Date().toISOString(),
    stale: false,
  };
}

function staleSnapshot(entry, reason) {
  return {
    ...entry.data,
    stale: true,
    staleReason: reason,
    cacheAgeMs: Date.now() - entry.timestamp,
  };
}

async function fetchMarketData(symbol) {
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();

  if (!normalizedSymbol) {
    const error = new Error("symbol is required.");
    error.statusCode = 400;
    throw error;
  }

  const cached = marketCache.get(normalizedSymbol);

  if (cached && Date.now() - cached.timestamp < CACHE_MS) {
    return {
      ...cached.data,
      stale: false,
      cacheAgeMs: Date.now() - cached.timestamp,
    };
  }

  let dailyPayload = {};
  let quotePayload = {};
  let dailyError = null;

  try {
    dailyPayload = await fetchAlphaVantage({
      function: "TIME_SERIES_DAILY",
      symbol: normalizedSymbol,
      outputsize: "compact",
    });
  } catch (error) {
    dailyError = error;
  }

  if (dailyError) {
    if (cached?.data) {
      return staleSnapshot(cached, dailyError.message);
    }

    throw dailyError;
  }

  // The daily time series already contains price, volume, return, and volatility inputs.
  // Only use a second API call if daily history is unavailable for the symbol.
  if (parseDailyCloses(dailyPayload).length < 2) {
    try {
      quotePayload = await fetchAlphaVantage({
        function: "GLOBAL_QUOTE",
        symbol: normalizedSymbol,
      });
    } catch (quoteError) {
      if (cached?.data) {
        return staleSnapshot(cached, quoteError.message);
      }

      throw quoteError;
    }
  }

  const data = buildMarketSnapshot(normalizedSymbol, quotePayload, dailyPayload);

  if (!data.lastPrice) {
    const error = new Error(`No Alpha Vantage market data found for ${normalizedSymbol}.`);
    error.statusCode = 404;
    throw error;
  }

  marketCache.set(normalizedSymbol, {
    data,
    timestamp: Date.now(),
  });
  persistCache();

  return data;
}

loadPersistentCache();

module.exports = {
  fetchMarketData,
};
