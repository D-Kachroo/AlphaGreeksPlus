#pragma once

#include "../../shared/inputs.hpp"

namespace ag {

// Delta is dV/dS: option value sensitivity to a $1 spot move.
// Call: e^(-qT) * N(d1)
// Put:  e^(-qT) * (N(d1) - 1)
double calculate_delta(const OptionContractInput& input);

}
