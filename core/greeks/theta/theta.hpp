#pragma once

#include "../../shared/inputs.hpp"

namespace ag {

// Theta is time decay: the option value change as one calendar period passes,
// holding spot, volatility, rates, and dividend yield fixed.
double theta_per_year(const OptionContractInput& input);
double theta_per_day(const OptionContractInput& input);

// Trader-facing convention used by AlphaGreeks+: daily calendar theta.
double calculate_theta(const OptionContractInput& input);

}
