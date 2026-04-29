# AlphaGreeks+ Overview

AlphaGreeks+ identifies potentially mispriced stocks and evaluates options trades with Greek-based risk analysis.

The system has two layers:

- A C++17 quant core for pricing, Greeks, alpha scoring, trade selection, and scenarios.
- A Node/Express web app with a vanilla JavaScript frontend and Plotly.js charts.

The frontend sends analysis and scenario requests to Express. Express serializes the request into a compact line protocol, calls the C++ binary, and returns JSON to the browser.
