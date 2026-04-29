#pragma once

#include <vector>

#include "../shared/inputs.hpp"
#include "../shared/outputs.hpp"

namespace ag {

// Ranks option trades by alpha direction, premium efficiency, and Greek risk.
std::vector<TradeCandidateOutput> rank_trades(const TradeSearchInput& input);

// Returns the highest-scoring trade. Throws if no contract passes filters.
TradeCandidateOutput select_best_trade(const TradeSearchInput& input);

}
