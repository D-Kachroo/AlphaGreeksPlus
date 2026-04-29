# Formulas

## Black-Scholes

```text
d1 = [ln(S/K) + (r - q + sigma^2 / 2)T] / (sigma sqrt(T))
d2 = d1 - sigma sqrt(T)
Call = S e^(-qT) N(d1) - K e^(-rT) N(d2)
Put  = K e^(-rT) N(-d2) - S e^(-qT) N(-d1)
```

Where:

- `S` is spot price
- `K` is strike price
- `r` is the continuously compounded risk-free rate
- `q` is continuous dividend yield
- `sigma` is annualized volatility
- `T` is years to expiration

## Greeks

```text
Call Delta = e^(-qT) N(d1)
Put Delta  = e^(-qT) [N(d1) - 1]
Gamma      = e^(-qT) n(d1) / [S sigma sqrt(T)]
Vega       = S e^(-qT) n(d1) sqrt(T)
Call Rho   = K T e^(-rT) N(d2)
Put Rho    = -K T e^(-rT) N(-d2)
```

Theta is implemented with continuous dividend yield and returned as daily calendar theta for the app.
