const express = require("express");
const { fetchMarketData } = require("../services/market-data");

const router = express.Router();
const MARKET_CACHE_CONTROL = "public, max-age=900, s-maxage=43200, stale-while-revalidate=86400, stale-if-error=86400";

router.get("/:symbol", async (req, res) => {
  try {
    const data = await fetchMarketData(req.params.symbol);
    res.set("Cache-Control", MARKET_CACHE_CONTROL);
    res.json(data);
  } catch (error) {
    res.set("Cache-Control", MARKET_CACHE_CONTROL);
    res.status(error.statusCode || 500).json({
      error: error.message,
    });
  }
});

module.exports = router;
