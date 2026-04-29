const express = require("express");
const { runQuantCore } = require("../services/quant-core");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const result = await runQuantCore("simulate", req.body);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message,
    });
  }
});

module.exports = router;
