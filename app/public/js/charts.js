const chartTheme = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: {
    color: "#f5f2ec",
    family: "Inter, Arial, sans-serif",
  },
  margin: {
    l: 48,
    r: 24,
    t: 48,
    b: 44,
  },
};

const chartConfig = {
  displaylogo: false,
  responsive: true,
  scrollZoom: true,
  toImageButtonOptions: {
    format: "svg",
    filename: "alphagreeks-chart",
  },
};

const tradeGreen = "#00d084";
const tradeRed = "#ff2b2b";
const tradeGold = "#f4c95d";
const tradeCyan = "#7ee8ff";

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ordinalRank(index) {
  const rank = index + 1;
  const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][rank % 10] || "th";
  return `${rank}${suffix}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function ensureGreekFormulaTooltip() {
  let tooltip = document.getElementById("greekFormulaTooltip");

  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "greekFormulaTooltip";
    tooltip.className = "greek-formula-tooltip";
    document.body.appendChild(tooltip);
  }

  return tooltip;
}

function positionGreekFormulaTooltip(tooltip, event) {
  const offset = 18;
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const maxX = window.innerWidth - width - offset;
  const maxY = window.innerHeight - height - offset;
  const x = Math.max(offset, Math.min(event.clientX + offset, maxX));
  const y = Math.max(offset, Math.min(event.clientY + offset, maxY));

  tooltip.style.transform = `translate(${x}px, ${y}px)`;
}

function bindGreekFormulaTooltip() {
  const chart = document.getElementById("greeksChart");

  if (!chart || chart._greekFormulaTooltipBound || typeof chart.on !== "function") {
    return;
  }

  const tooltip = ensureGreekFormulaTooltip();

  chart.on("plotly_hover", (event) => {
    const formula = event.points?.[0]?.customdata;

    if (!formula) {
      return;
    }

    tooltip.innerHTML = formula;
    tooltip.classList.add("visible");

    if (event.event) {
      positionGreekFormulaTooltip(tooltip, event.event);
    }
  });

  chart.on("plotly_unhover", () => {
    tooltip.classList.remove("visible");
  });

  chart.addEventListener("mousemove", (event) => {
    if (tooltip.classList.contains("visible")) {
      positionGreekFormulaTooltip(tooltip, event);
    }
  });

  chart.addEventListener("mouseleave", () => {
    tooltip.classList.remove("visible");
  });

  chart._greekFormulaTooltipBound = true;
}

function emptyChart(id, title) {
  if (!window.Plotly || !document.getElementById(id)) {
    return;
  }

  Plotly.react(
    id,
    [],
    {
      ...chartTheme,
      title: {
        text: title,
        x: 0.02,
        font: { size: 15 },
      },
      xaxis: { visible: false },
      yaxis: { visible: false },
      annotations: [
        {
          text: "-",
          x: 0.5,
          y: 0.5,
          xref: "paper",
          yref: "paper",
          showarrow: false,
          font: { color: "#a9b0aa", size: 24 },
        },
      ],
    },
    chartConfig
  );
}

function renderTradeScores(trades) {
  if (!window.Plotly || !trades || trades.length === 0) {
    emptyChart("tradeScoreChart", "");
    return;
  }

  const rankedTrades = [...trades].sort((left, right) => right.score - left.score);
  const labels = rankedTrades.map(
    (trade, index) =>
      `<b>${ordinalRank(index)}</b> - ${titleCase(trade.side)} ${titleCase(trade.type)} ${Number(trade.strikePrice).toFixed(0)}`
  );
  const scores = rankedTrades.map((trade) => trade.score);
  const colors = rankedTrades.map((trade) => (trade.type === "call" ? tradeGreen : tradeRed));
  const hoverData = rankedTrades.map(
    (trade) =>
      `${titleCase(trade.side)} ${titleCase(trade.type)} ${Number(trade.strikePrice).toFixed(0)}`
  );

  Plotly.react(
    "tradeScoreChart",
    [
      {
        type: "bar",
        x: scores,
        y: labels,
        orientation: "h",
        marker: {
          color: colors,
          line: { color: "rgba(255,255,255,0.24)", width: 1 },
        },
        customdata: hoverData,
        hovertemplate: "<b>%{y}</b><br>Trade: %{customdata}<br>Score: %{x:.3f}<extra></extra>",
      },
    ],
    {
      ...chartTheme,
      margin: { l: 174, r: 36, t: 14, b: 58 },
      xaxis: {
        title: "Trade Score",
        zeroline: true,
        zerolinecolor: "rgba(255,255,255,0.35)",
        gridcolor: "rgba(255,255,255,0.08)",
      },
      yaxis: {
        automargin: true,
        autorange: "reversed",
        categoryarray: labels,
        categoryorder: "array",
      },
    },
    chartConfig
  );
}

function renderGreeksRadar(greeks) {
  if (!window.Plotly || !greeks) {
    emptyChart("greeksChart", "");
    return;
  }

  const labels = ["Delta", "Gamma", "Theta", "Vega", "Rho"];
  const formulas = [
    `<span class="formula-line">&Delta;<sub>call</sub> = <span class="frac"><span>&part;C</span><span>&part;S</span></span> = N(d<sub>1</sub>)</span>
     <span class="formula-line">&Delta;<sub>put</sub> = <span class="frac"><span>&part;P</span><span>&part;S</span></span> = N(d<sub>1</sub>) - 1</span>`,
    `<span class="formula-line">&Gamma;<sub>call</sub> = &Gamma;<sub>put</sub> = <span class="frac"><span>&part;<sup>2</sup>C</span><span>&part;S<sup>2</sup></span></span> = <span class="frac"><span>&part;<sup>2</sup>P</span><span>&part;S<sup>2</sup></span></span> = <span class="frac"><span>N&#8242;(d<sub>1</sub>)</span><span>S&sigma;&radic;(T - t)</span></span></span>`,
    `<span class="formula-line">&Theta;<sub>call</sub> = <span class="frac"><span>&part;C</span><span>&part;(T - t)</span></span> = -<span class="frac"><span>SN&#8242;(d<sub>1</sub>)&sigma;</span><span>2&radic;(T - t)</span></span> - rKe<sup>-r(T - t)</sup>N(d<sub>2</sub>)</span>
     <span class="formula-line">&Theta;<sub>put</sub> = <span class="frac"><span>&part;P</span><span>&part;(T - t)</span></span> = -<span class="frac"><span>SN&#8242;(d<sub>1</sub>)&sigma;</span><span>2&radic;(T - t)</span></span> + rKe<sup>-r(T - t)</sup>N(-d<sub>2</sub>)</span>`,
    `<span class="formula-line">v<sub>call</sub> = v<sub>put</sub> = <span class="frac"><span>&part;C</span><span>&part;&sigma;</span></span> = <span class="frac"><span>&part;P</span><span>&part;&sigma;</span></span> = S&radic;(T - t)N&#8242;(d<sub>1</sub>)</span>`,
    `<span class="formula-line">&rho;<sub>call</sub> = <span class="frac"><span>&part;C</span><span>&part;r</span></span> = K(T - t)e<sup>-r(T - t)</sup>N(d<sub>2</sub>)</span>
     <span class="formula-line">&rho;<sub>put</sub> = <span class="frac"><span>&part;C</span><span>&part;r</span></span> = -K(T - t)e<sup>-r(T - t)</sup>N(d<sub>2</sub>)</span>`,
  ];
  const colors = [tradeGreen, tradeGold, tradeRed, tradeCyan, "#f5f2ec"];
  const raw = [greeks.delta, greeks.gamma, greeks.theta, greeks.vega, greeks.rho];
  const magnitudes = raw.map((value) => Math.abs(value));
  const maxMagnitude = Math.max(...magnitudes, 0.001);
  const scaled = magnitudes.map((value) => value / maxMagnitude);
  const formulaData = [...formulas, formulas[0]];

  Plotly.react(
    "greeksChart",
    [
      {
        type: "scatterpolar",
        r: [1, 1, 1, 1, 1, 1],
        theta: [...labels, labels[0]],
        fill: "toself",
        fillcolor: "rgba(255,255,255,0.035)",
        line: { color: "rgba(255,255,255,0.18)", width: 2, dash: "dot" },
        hoverinfo: "skip",
      },
      {
        type: "scatterpolar",
        r: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        theta: [...labels, labels[0]],
        fill: "toself",
        fillcolor: "rgba(244,201,93,0.06)",
        line: { color: "rgba(244,201,93,0.24)", width: 1 },
        hoverinfo: "skip",
      },
      {
        type: "scatterpolar",
        r: [...scaled, scaled[0]],
        theta: [...labels, labels[0]],
        fill: "toself",
        fillcolor: "rgba(0,208,132,0.28)",
        line: { color: tradeGreen, width: 5 },
        marker: {
          color: [...colors, colors[0]],
          size: 12,
          line: { color: "rgba(15,17,16,0.95)", width: 2 },
        },
        customdata: formulaData,
        hoverinfo: "none",
      },
      {
        type: "scatterpolar",
        mode: "markers+text",
        r: [1.04, 1.04, 1.04, 1.04, 1.04],
        theta: labels,
        text: labels,
        textfont: { color: "#f5f2ec", size: 18 },
        marker: {
          color: "rgba(244,201,93,0)",
          size: 30,
          line: { color: "rgba(244,201,93,0)", width: 1 },
        },
        customdata: formulas,
        hoverinfo: "none",
      },
    ],
    {
      ...chartTheme,
      margin: { l: 4, r: 42, t: 0, b: 0 },
      polar: {
        bgcolor: "rgba(0,0,0,0)",
        domain: {
          x: [0.01, 0.99],
          y: [0.01, 0.99],
        },
        radialaxis: {
          range: [0, 1.08],
          gridcolor: "rgba(255,255,255,0.12)",
          tickvals: [0, 0.5, 1],
          showticklabels: false,
        },
        angularaxis: {
          gridcolor: "rgba(255,255,255,0.12)",
          tickfont: { color: "rgba(245,242,236,0)", size: 1 },
        },
      },
      hoverlabel: {
        bgcolor: "rgba(0,0,0,0)",
        bordercolor: "rgba(0,0,0,0)",
        font: {
          color: "#f5f2ec",
          size: 14,
        },
      },
      showlegend: false,
    },
    chartConfig
  );

  bindGreekFormulaTooltip();
}

function gridFromPoints(points) {
  const gridPoints = points.slice(0, 63);
  const spotValues = [...new Set(gridPoints.map((point) => point.spotPrice))].sort((a, b) => a - b);
  const volValues = [...new Set(gridPoints.map((point) => point.volatility))].sort((a, b) => a - b);

  const z = volValues.map((vol) =>
    spotValues.map((spot) => {
      const point = gridPoints.find(
        (candidate) =>
          Math.abs(candidate.spotPrice - spot) < 1e-8 &&
          Math.abs(candidate.volatility - vol) < 1e-8
      );
      return point ? point.profitLoss : null;
    })
  );

  return { spotValues, volValues, z };
}

function renderScenarioSurface(result) {
  if (!window.Plotly || !result || !Array.isArray(result.points)) {
    emptyChart("scenarioSurfaceChart", "3D Test Simulator");
    return;
  }

  const grid = gridFromPoints(result.points);
  const stressedPoint = result.points[result.points.length - 1];
  const maxAbsProfitLoss = Math.max(
    ...grid.z.flat().map((value) => Math.abs(value || 0)),
    Math.abs(stressedPoint.profitLoss || 0),
    1
  );

  Plotly.react(
    "scenarioSurfaceChart",
    [
      {
        type: "surface",
        x: grid.spotValues,
        y: grid.volValues,
        z: grid.z,
        colorscale: [
          [0, tradeRed],
          [0.5, "#202522"],
          [1, tradeGreen],
        ],
        cmin: -maxAbsProfitLoss,
        cmax: maxAbsProfitLoss,
        colorbar: {
          title: "Profit or Loss ($)",
          tickfont: { color: "#f5f2ec" },
          titlefont: { color: "#f5f2ec" },
        },
        contours: {
          z: {
            show: true,
            usecolormap: true,
            highlightcolor: tradeGold,
            project: { z: true },
          },
        },
        hovertemplate:
          "Stock Price: %{x:.2f}<br>Volatility: %{y:.2%}<br>Profit or Loss: %{z:.4f}<extra></extra>",
      },
      {
        type: "scatter3d",
        mode: "markers+text",
        x: [stressedPoint.spotPrice],
        y: [stressedPoint.volatility],
        z: [stressedPoint.profitLoss],
        text: ["Test"],
        textposition: "top center",
        marker: {
          color: tradeGold,
          size: 7,
          line: { color: "#0f1110", width: 2 },
          symbol: "diamond",
        },
        hovertemplate:
          "<b>Your test</b><br>Stock Price: %{x:.2f}<br>Volatility: %{y:.2%}<br>Profit or Loss: %{z:.4f}<extra></extra>",
      },
    ],
    {
      ...chartTheme,
      margin: { l: 26, r: 26, t: 82, b: 34 },
      title: { text: "<b>3D Test Simulator</b>", x: 0.02, font: { size: 24 } },
      scene: {
        xaxis: {
          title: "Stock Price ($)",
          gridcolor: "rgba(255,255,255,0.16)",
          backgroundcolor: "rgba(15,17,16,0.92)",
          zerolinecolor: "rgba(255,255,255,0.22)",
        },
        yaxis: {
          title: "Volatility (%)",
          gridcolor: "rgba(255,255,255,0.16)",
          backgroundcolor: "rgba(15,17,16,0.92)",
          tickformat: ".0%",
          zerolinecolor: "rgba(255,255,255,0.22)",
        },
        zaxis: {
          title: "Profit or Loss ($)",
          gridcolor: "rgba(255,255,255,0.16)",
          backgroundcolor: "rgba(15,17,16,0.92)",
          zerolinecolor: "rgba(255,255,255,0.35)",
        },
        aspectmode: "manual",
        aspectratio: { x: 1.45, y: 1, z: 0.78 },
        camera: { eye: { x: 1.65, y: -1.85, z: 1.25 } },
      },
      dragmode: "orbit",
      showlegend: false,
      uirevision: "scenario-3d-surface",
    },
    chartConfig
  );
}

function renderCapmSecurityMarketLine(result, context = {}) {
  if (!window.Plotly || !result || !Array.isArray(result.points)) {
    emptyChart("scenarioLineChart", "CAPM Security Market Line");
    return;
  }

  const option = context.option || {};
  const bestTrade = context.bestTrade || {};
  const riskFreeRate = finiteOr(option.riskFreeRate, 0.05);
  const marketReturn = Math.max(riskFreeRate + 0.055, 0.08);
  const marketRiskPremium = marketReturn - riskFreeRate;
  const stockVolatility = Math.max(finiteOr(context.volatility, 0.2), 0.01);
  const expectedReturn = finiteOr(context.expectedReturn, riskFreeRate);
  const stockPrice = Math.max(finiteOr(context.marketPrice, option.spotPrice || 0), 0.01);
  const optionPremium = Math.max(finiteOr(bestTrade.estimatedPremium, result.baseOptionPrice), 0.01);
  const delta = finiteOr(bestTrade.greeks?.delta, 0);
  const stockBeta = clamp((stockVolatility / 0.18) * 0.75, 0.05, 2.5);
  const optionBeta = clamp(Math.abs(delta * stockPrice * stockBeta) / optionPremium, 0.05, 4.5);
  const capmRequiredReturn = riskFreeRate + stockBeta * marketRiskPremium;
  const optionRequiredReturn = riskFreeRate + optionBeta * marketRiskPremium;
  const capmAlpha = expectedReturn - capmRequiredReturn;
  const maxBeta = Math.max(2.1, stockBeta * 1.25, optionBeta * 1.08, 1.15);
  const betaLine = Array.from({ length: 80 }, (_, index) => (maxBeta * index) / 79);
  const smlReturns = betaLine.map((beta) => riskFreeRate + beta * marketRiskPremium);
  const alphaColor = capmAlpha >= 0 ? tradeGreen : tradeRed;
  const alphaText = `${capmAlpha >= 0 ? "+" : ""}${(capmAlpha * 100).toFixed(2)}% Alpha`;

  Plotly.react(
    "scenarioLineChart",
    [
      {
        type: "scatter",
        name: "Stock's Required Return",
        mode: "lines",
        x: betaLine,
        y: smlReturns,
        line: { color: "rgba(0,208,132,0.2)", width: 11 },
        hoverinfo: "skip",
        showlegend: false,
      },
      {
        type: "scatter",
        name: "Stock's Required Return",
        mode: "lines",
        x: betaLine,
        y: smlReturns,
        line: { color: tradeGreen, width: 4 },
        hovertemplate:
          "Stock beta risk: %{x:.2f}<br>CAPM-required annual stock return: %{y:.2%}<extra>Stock's Required Return</extra>",
      },
      {
        type: "scattergl",
        name: "Stock's CAPM Alpha",
        mode: "lines",
        x: [stockBeta, stockBeta],
        y: [capmRequiredReturn, expectedReturn],
        line: { color: alphaColor, width: 4, dash: "dot" },
        hovertemplate:
          `CAPM alpha gap: ${alphaText}<br>Required annual stock return: ${(capmRequiredReturn * 100).toFixed(
            2
          )}%<br>Expected annual stock return: ${(expectedReturn * 100).toFixed(2)}%<extra>Stock's CAPM Alpha</extra>`,
      },
      {
        type: "scatter",
        name: "Market Benchmark",
        mode: "markers",
        x: [1],
        y: [marketReturn],
        marker: {
          color: tradeCyan,
          size: 14,
          symbol: "circle",
          line: { color: "#0f1110", width: 2 },
        },
        hovertemplate:
          "Market beta: 1.00<br>Expected annual market return: %{y:.2%}<extra>Market Benchmark</extra>",
      },
      {
        type: "scatter",
        name: "Stock's Expected Return",
        mode: "markers",
        x: [stockBeta],
        y: [expectedReturn],
        marker: {
          color: alphaColor,
          size: 20,
          symbol: "star",
          line: { color: "#f5f2ec", width: 2 },
        },
        hovertemplate:
          `Stock beta risk: ${stockBeta.toFixed(2)}<br>Expected annual stock return: ${(expectedReturn * 100).toFixed(
            2
          )}%<br>CAPM-required annual stock return: ${(capmRequiredReturn * 100).toFixed(
            2
          )}%<br>CAPM alpha gap: ${alphaText}<extra>Stock's Expected Return</extra>`,
      },
      {
        type: "scatter",
        name: "Option's Required Return",
        mode: "markers",
        x: [optionBeta],
        y: [optionRequiredReturn],
        marker: {
          color: tradeGold,
          size: 16,
          symbol: "diamond",
          line: { color: "#0f1110", width: 2 },
        },
        hovertemplate:
          "Option beta risk: %{x:.2f}<br>CAPM-required annual option return: %{y:.2%}<br>Uses Delta, stock price, and premium<extra>Option's Required Return</extra>",
      },
    ],
    {
      ...chartTheme,
      margin: { l: 78, r: 32, t: 96, b: 116 },
      title: {
        text: "<b>CAPM Security Market Line</b><br><span style='font-size:13px;color:#a9b0aa'>Plots beta risk against expected annual return. The stock marker shows the expected return; its distance from the line is the CAPM (Capital Asset Pricing Model) alpha.</span>",
        x: 0.02,
        font: { size: 24 },
      },
      xaxis: {
        title: "Beta Risk (Market Sensitivity)",
        range: [-0.05, maxBeta * 1.04],
        zeroline: true,
        zerolinecolor: "rgba(255,255,255,0.28)",
        gridcolor: "rgba(255,255,255,0.08)",
      },
      yaxis: {
        title: "Annual Return",
        tickformat: ".0%",
        range: [
          Math.min(riskFreeRate - 0.05, expectedReturn - 0.05),
          Math.max(optionRequiredReturn + 0.05, expectedReturn + 0.05, smlReturns[smlReturns.length - 1] + 0.03),
        ],
        zeroline: true,
        zerolinecolor: "rgba(255,255,255,0.28)",
        gridcolor: "rgba(255,255,255,0.08)",
      },
      annotations: [
        {
          text: `<b>${alphaText}</b>`,
          x: stockBeta,
          y: expectedReturn,
          xref: "x",
          yref: "y",
          xanchor: "center",
          yanchor: capmAlpha >= 0 ? "bottom" : "top",
          showarrow: false,
          font: { color: alphaColor, size: 13 },
          bgcolor: "rgba(15,17,16,0.82)",
          bordercolor: alphaColor,
          borderpad: 6,
        },
      ],
      legend: {
        title: { text: "Legend" },
        orientation: "h",
        x: 0.02,
        y: -0.24,
        xanchor: "left",
        yanchor: "top",
        entrywidth: 178,
        entrywidthmode: "pixels",
        tracegroupgap: 12,
        itemsizing: "constant",
        bgcolor: "rgba(15,17,16,0.72)",
        bordercolor: "rgba(255,255,255,0.16)",
        borderwidth: 1,
        font: { size: 12 },
      },
      hovermode: "closest",
    },
    chartConfig
  );
}

function renderScenarioCharts(result, context = {}) {
  renderScenarioSurface(result);
  renderCapmSecurityMarketLine(result, context);
}

function initializeCharts() {
  emptyChart("tradeScoreChart", "");
  emptyChart("greeksChart", "");
  emptyChart("scenarioSurfaceChart", "3D Test Simulator");
  emptyChart("scenarioLineChart", "CAPM Security Market Line");
}

window.AlphaGreeksCharts = {
  initializeCharts,
  renderTradeScores,
  renderGreeksRadar,
  renderScenarioCharts,
};
