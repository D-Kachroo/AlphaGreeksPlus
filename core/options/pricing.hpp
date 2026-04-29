#pragma once

#include "../shared/inputs.hpp"
#include "../shared/outputs.hpp"

namespace ag {

// European Black-Scholes with continuous dividend yield q.
// Call: C = S*e^(-qT)*N(d1) - K*e^(-rT)*N(d2)
// Put:  P = K*e^(-rT)*N(-d2) - S*e^(-qT)*N(-d1)
double black_scholes_price(const OptionContractInput& input);

// Returns price plus intrinsic and time value for easy UI/API use.
PricingOutput price_option(const OptionContractInput& input);

}
