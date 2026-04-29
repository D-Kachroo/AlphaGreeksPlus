#pragma once

#include <string>
#include <vector>

#include "inputs.hpp"

namespace ag {

struct PricingOutput {
  double theoretical_price = 0.0;
  double intrinsic_value = 0.0;
  double time_value = 0.0;
};

struct GreeksOutput {
  double delta = 0.0;
  double gamma = 0.0;
  double theta = 0.0;
  double vega = 0.0;
  double rho = 0.0;
};

struct AlphaSignalOutput {
  std::string symbol;
  double mispricing = 0.0;
  double mispricing_percent = 0.0;
  double confidence = 0.0;
  std::string rating;
};

struct TradeCandidateOutput {
  OptionType type = OptionType::Call;
  TradeSide side = TradeSide::Buy;
  double strike_price = 0.0;
  double time_to_expiration_years = 0.0;
  double estimated_premium = 0.0;
  GreeksOutput greeks;
  double score = 0.0;
  std::string rationale;
};

struct ScenarioPointOutput {
  double spot_price = 0.0;
  double volatility = 0.0;
  double time_to_expiration_years = 0.0;
  double option_price = 0.0;
  double profit_loss = 0.0;
  GreeksOutput greeks;
};

struct ScenarioOutput {
  double base_option_price = 0.0;
  double stressed_option_price = 0.0;
  double profit_loss = 0.0;
  std::vector<ScenarioPointOutput> points;
};

}
