# AlphaGreeks+

AlphaGreeks+ is a quantitative trading system that identifies stock mispricing signals and determines optimal options trades with Black-Scholes pricing, Greek risk analysis, and an interactive simulator.

## Stack

- C++17 quant core
- Node.js and Express
- Vanilla HTML, CSS, and JavaScript
- Plotly.js
- Alpha Vantage
- Render

## Features

- European Black-Scholes call and put pricing
- Delta, Gamma, Theta, Vega, and Rho
- Mispricing signal classification
- Greek-aware trade ranking
- Alpha Vantage quote/history auto-fill for market price, expected return, and volatility
- Scenario simulator for spot, volatility, time, and rate shocks
- Interactive Plotly trade score, Greek radar, CAPM Security Market Line, and 3D scenario surface charts
- Free Render deployment config

## Project Structure

```text
app/          Express API and frontend
core/         C++ pricing, Greeks, alpha, trade selection, and simulation
tests/        C++ unit tests
docs/         Methodology, formulas, and deployment notes
render.yaml   Render deployment config
```

## Local Setup

```bash
npm install
npm test
npm start
```

Open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env` and set:

```bash
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key
PORT=3000
NODE_ENV=development
```

## API

`POST /api/analyze`

Returns the alpha signal, best trade, and ranked trades.

`GET /api/market/:symbol`

Returns Alpha Vantage quote/history metrics used to auto-fill the stock inputs and desk cards.

`POST /api/simulate`

Returns base price, stressed price, P/L, Greeks, and chart-ready scenario points.

## Core Formulas

Black-Scholes:

```text
d1 = [ln(S/K) + (r - q + sigma^2 / 2)T] / (sigma sqrt(T))
d2 = d1 - sigma sqrt(T)
Call = S e^(-qT) N(d1) - K e^(-rT) N(d2)
Put  = K e^(-rT) N(-d2) - S e^(-qT) N(-d1)
```

Greek conventions:

- Delta: value change for a $1 spot move
- Gamma: delta change for a $1 spot move
- Theta: daily calendar time decay
- Vega: value change for a 1 volatility point move
- Rho: value change for a 1 percentage point rate move

## Deployment

Render uses:

```bash
npm install && npm test
npm start
```

Set `ALPHA_VANTAGE_API_KEY` in the Render dashboard.
