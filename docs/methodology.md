# Methodology

## Alpha Signal

Mispricing is calculated as fair value minus market price. Positive mispricing is bullish; negative mispricing is bearish. Signal conviction is absolute mispricing percent multiplied by confidence.

## Trade Selection

Each contract is priced with Black-Scholes and filtered by premium and absolute delta. The ranking score rewards directional delta alignment and useful gamma, while penalizing volatility load and expensive premium.

## Scenario Simulation

The simulator stresses spot, volatility, calendar time, and rates:

```text
S' = S * (1 + spot_move_percent / 100)
sigma' = sigma * (1 + volatility_move_percent / 100)
T' = max(T - days_forward / 365, 0)
r' = r + rate_move_basis_points * 0.0001
```

P/L is calculated as stressed option value minus base option value.
