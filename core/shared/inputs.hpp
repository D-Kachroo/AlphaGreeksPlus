#pragma once

#include <string>
#include <vector>

namespace ag {

enum class OptionType {
  Call,
  Put
};

enum class TradeSide {
  Buy,
  Sell
};

struct StockSnapshotInput {
  std::string symbol;
  double last_price = 0.0;
  double previous_close = 0.0;
  double fifty_two_week_high = 0.0;
  double fifty_two_week_low = 0.0;
  double volume = 0.0;
};

struct OptionContractInput {
  OptionType type = OptionType::Call;
  double spot_price = 0.0;
  double strike_price = 0.0;
  double risk_free_rate = 0.0;
  double volatility = 0.0;
  double time_to_expiration_years = 0.0;
  double dividend_yield = 0.0;
};

struct AlphaSignalInput {
  std::string symbol;
  double market_price = 0.0;
  double fair_value_estimate = 0.0;
  double expected_return = 0.0;
  double volatility = 0.0;
  double confidence = 0.0;
};

struct TradeSearchInput {
  AlphaSignalInput signal;
  std::vector<OptionContractInput> contracts;
  double max_premium = 0.0;
  double max_absolute_delta = 1.0;
};

struct ScenarioInput {
  OptionContractInput option;
  double spot_move_percent = 0.0;
  double volatility_move_percent = 0.0;
  double days_forward = 0.0;
  double rate_move_basis_points = 0.0;
};

}
