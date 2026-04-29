const express = require("express");
const { fetchMarketData } = require("../services/market-data");

const router = express.Router();

router.get("/:symbol", async (req, res) => {
  try {
    const data = await fetchMarketData(req.params.symbol);
    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message,
    });
  }
});

module.exports = router;
