#pragma once

#include "../../shared/inputs.hpp"

namespace ag {

// Vega is dV/dsigma: sensitivity to implied volatility.
// Per unit volatility: S*e^(-qT)*n(d1)*sqrt(T)
double vega_per_unit_volatility(const OptionContractInput& input);

// Trader-facing convention used by AlphaGreeks+: value change for a 1 vol point move.
double calculate_vega(const OptionContractInput& input);

}
