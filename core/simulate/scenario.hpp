#pragma once

#include "../shared/inputs.hpp"
#include "../shared/outputs.hpp"

namespace ag {

// Applies one stress point:
// S' = S * (1 + spot_move_percent / 100)
// sigma' = max(sigma * (1 + volatility_move_percent / 100), 0)
// T' = max(T - days_forward / 365, 0)
// r' = r + rate_move_basis_points * 0.0001
OptionContractInput apply_scenario(const ScenarioInput& input);

// PnL is long-option mark-to-market: stressed price - base price.
ScenarioPointOutput evaluate_scenario_point(
    const OptionContractInput& option,
    double base_option_price);

// Returns the requested stress plus a compact spot/vol surface for charts.
ScenarioOutput simulate_scenario(const ScenarioInput& input);

}
