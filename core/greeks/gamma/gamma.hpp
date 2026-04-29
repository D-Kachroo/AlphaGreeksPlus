#pragma once

#include "../../shared/inputs.hpp"

namespace ag {

// Gamma is dDelta/dS: curvature of option value with respect to spot.
// Calls and puts share the same formula:
// Gamma = e^(-qT) * n(d1) / (S * sigma * sqrt(T))
double calculate_gamma(const OptionContractInput& input);

}
