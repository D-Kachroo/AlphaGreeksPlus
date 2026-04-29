#pragma once

#include "../../shared/inputs.hpp"

namespace ag {

// Rho is dV/dr: sensitivity to the continuously compounded risk-free rate.
// Call per unit rate:  K*T*e^(-rT)*N(d2)
// Put per unit rate:  -K*T*e^(-rT)*N(-d2)
double rho_per_unit_rate(const OptionContractInput& input);
double rho_per_basis_point(const OptionContractInput& input);

// Trader-facing convention used by AlphaGreeks+: value change for a 1 percentage point rate move.
double calculate_rho(const OptionContractInput& input);

}
