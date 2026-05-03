const express = require("express");
const fs = require("fs");
const path = require("path");

const analyzeRoutes = require("./routes/analyze");
const marketRoutes = require("./routes/market");
const simulateRoutes = require("./routes/simulate");

function loadLocalEnv() {
  const envPath = path.join(__dirname, "..", ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        return;
      }

      const [key, ...valueParts] = trimmed.split("=");

      if (!process.env[key]) {
        process.env[key] = valueParts.join("=").trim();
      }
    });
}

loadLocalEnv();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    project: "AlphaGreeks+",
  });
});

app.use("/api/analyze", analyzeRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/simulate", simulateRoutes);

app.listen(PORT, () => {
  console.log(`AlphaGreeks+ server listening on port ${PORT}`);
});
