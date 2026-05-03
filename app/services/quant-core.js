const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CORE_BINARY = path.join(__dirname, "..", "..", "core", "build", "alphagreeks");
const CORE_DIR = path.join(__dirname, "..", "..", "core");
let buildCorePromise = null;

function getNumber(source, camelKey, snakeKey = camelKey) {
  const value = source[camelKey] ?? source[snakeKey];
  const number = Number(value);

  if (!Number.isFinite(number)) {
    const error = new Error(`${camelKey} must be a finite number.`);
    error.statusCode = 400;
    throw error;
  }

  return number;
}

function normalizeOptionType(value) {
  const type = String(value ?? "").toLowerCase();

  if (type !== "call" && type !== "put") {
    const error = new Error("option type must be call or put.");
    error.statusCode = 400;
    throw error;
  }

  return type;
}

function optionLine(prefix, option) {
  return [
    prefix,
    normalizeOptionType(option.type),
    getNumber(option, "spotPrice", "spot_price"),
    getNumber(option, "strikePrice", "strike_price"),
    getNumber(option, "riskFreeRate", "risk_free_rate"),
    getNumber(option, "volatility"),
    getNumber(option, "timeToExpirationYears", "time_to_expiration_years"),
    getNumber(option, "dividendYield", "dividend_yield"),
  ].join("|");
}

function analyzePayload(payload) {
  const signal = payload.signal ?? {};
  const contracts = Array.isArray(payload.contracts) ? payload.contracts : [];

  if (contracts.length === 0) {
    const error = new Error("contracts must include at least one option.");
    error.statusCode = 400;
    throw error;
  }

  const symbol = String(signal.symbol ?? "").trim();

  if (!symbol) {
    const error = new Error("signal.symbol is required.");
    error.statusCode = 400;
    throw error;
  }

  return [
    [
      "signal",
      symbol,
      getNumber(signal, "marketPrice", "market_price"),
      getNumber(signal, "fairValueEstimate", "fair_value_estimate"),
      getNumber(signal, "expectedReturn", "expected_return"),
      getNumber(signal, "volatility"),
      getNumber(signal, "confidence"),
      getNumber(payload, "maxPremium", "max_premium"),
      getNumber(payload, "maxAbsoluteDelta", "max_absolute_delta"),
    ].join("|"),
    ...contracts.map((contract) => optionLine("contract", contract)),
  ].join("\n");
}

function simulatePayload(payload) {
  if (!payload.option) {
    const error = new Error("option is required.");
    error.statusCode = 400;
    throw error;
  }

  return [
    optionLine("option", payload.option),
    [
      "scenario",
      getNumber(payload, "spotMovePercent", "spot_move_percent"),
      getNumber(payload, "volatilityMovePercent", "volatility_move_percent"),
      getNumber(payload, "daysForward", "days_forward"),
      getNumber(payload, "rateMoveBasisPoints", "rate_move_basis_points"),
    ].join("|"),
  ].join("\n");
}

function bridgePayload(command, payload) {
  if (command === "analyze") {
    return analyzePayload(payload);
  }

  if (command === "simulate") {
    return simulatePayload(payload);
  }

  const error = new Error("unknown quant core command.");
  error.statusCode = 400;
  throw error;
}

function buildCoreBinary() {
  if (fs.existsSync(CORE_BINARY)) {
    return Promise.resolve();
  }

  if (buildCorePromise) {
    return buildCorePromise;
  }

  buildCorePromise = new Promise((resolve, reject) => {
    const child = spawn("make", ["-C", CORE_DIR], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      buildCorePromise = null;
      const buildError = new Error(error.message || "Unable to build C++ core.");
      buildError.statusCode = 500;
      reject(buildError);
    });

    child.on("close", (code) => {
      buildCorePromise = null;

      if (code !== 0 || !fs.existsSync(CORE_BINARY)) {
        const buildError = new Error(stderr.trim() || "Unable to build C++ core.");
        buildError.statusCode = 500;
        reject(buildError);
        return;
      }

      resolve();
    });
  });

  return buildCorePromise;
}

function ensureCoreBinary() {
  return buildCoreBinary();
}

async function runQuantCore(command, payload) {
  await buildCoreBinary();
  const input = bridgePayload(command, payload);

  return new Promise((resolve, reject) => {
    const child = spawn(CORE_BINARY, [command], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        const error = new Error(stderr.trim() || "C++ quant core failed.");
        error.statusCode = 400;
        reject(error);
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (_error) {
        const error = new Error("C++ quant core returned invalid JSON.");
        error.statusCode = 500;
        reject(error);
      }
    });

    child.stdin.end(input);
  });
}

module.exports = {
  ensureCoreBinary,
  runQuantCore,
};
