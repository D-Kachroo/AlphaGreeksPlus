#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>

#include "options/trade.hpp"

namespace {

void require_true(bool condition, const std::string& label) {
  if (!condition) {
    std::cerr << label << " failed\n";
    std::exit(1);
  }
}

void require_close(double actual, double expected, double tolerance, const std::string& label) {
  if (std::fabs(actual - expected) > tolerance) {
    std::cerr << label << " expected " << expected << " got " << actual << "\n";
    std::exit(1);
  }
}

ag::OptionContractInput contract(
    ag::OptionType type,
    double strike_price,
    double volatility,
    double time_to_expiration_years) {
  ag::OptionContractInput option;
  option.type = type;
  option.spot_price = 100.0;
  option.strike_price = strike_price;
  option.risk_free_rate = 0.05;
  option.volatility = volatility;
  option.time_to_expiration_years = time_to_expiration_years;
  option.dividend_yield = 0.0;
  return option;
}

ag::TradeSearchInput sample_trade_search() {
  ag::TradeSearchInput input;
  input.signal.symbol = "AAPL";
  input.signal.market_price = 100.0;
  input.signal.fair_value_estimate = 115.0;
  input.signal.expected_return = 0.12;
  input.signal.volatility = 0.22;
  input.signal.confidence = 0.80;
  input.contracts = {
      contract(ag::OptionType::Call, 95.0, 0.20, 0.50),
      contract(ag::OptionType::Call, 100.0, 0.20, 1.00),
      contract(ag::OptionType::Call, 105.0, 0.20, 1.00),
      contract(ag::OptionType::Put, 95.0, 0.22, 1.00),
      contract(ag::OptionType::Put, 105.0, 0.22, 0.75),
  };
  input.max_premium = 0.0;
  input.max_absolute_delta = 1.0;
  return input;
}

double score_for_strike(
    const std::vector<ag::TradeCandidateOutput>& ranked,
    double strike_price) {
  for (const ag::TradeCandidateOutput& candidate : ranked) {
    if (std::fabs(candidate.strike_price - strike_price) < 1e-8) {
      return candidate.score;
    }
  }

  std::cerr << "missing strike " << strike_price << "\n";
  std::exit(1);
}

void require_all_type(
    const std::vector<ag::TradeCandidateOutput>& ranked,
    ag::OptionType type,
    const std::string& label) {
  for (const ag::TradeCandidateOutput& candidate : ranked) {
    if (candidate.type != type) {
      std::cerr << label << " failed\n";
      std::exit(1);
    }
  }
}

}

int main() {
  const ag::TradeSearchInput baseline = sample_trade_search();
  const std::vector<ag::TradeCandidateOutput> baseline_ranked = ag::rank_trades(baseline);
  require_true(!baseline_ranked.empty(), "baseline ranked trades");
  require_all_type(baseline_ranked, ag::OptionType::Call, "bullish search keeps only calls");
  require_close(baseline_ranked.front().strike_price, 95.0, 1e-8, "baseline best strike");

  ag::TradeSearchInput tighter_budget = baseline;
  tighter_budget.max_premium = 10.0;
  tighter_budget.max_absolute_delta = 0.75;
  const std::vector<ag::TradeCandidateOutput> tighter_ranked = ag::rank_trades(tighter_budget);
  require_true(!tighter_ranked.empty(), "tighter ranked trades");
  require_close(score_for_strike(tighter_ranked, 95.0), score_for_strike(baseline_ranked, 95.0), 1e-8, "passing trade score unchanged");

  ag::TradeSearchInput tight_filter = baseline;
  tight_filter.max_premium = 9.0;
  const std::vector<ag::TradeCandidateOutput> filtered_ranked = ag::rank_trades(tight_filter);
  require_true(!filtered_ranked.empty(), "filtered ranked trades");
  require_close(filtered_ranked.front().strike_price, 105.0, 1e-8, "premium filter best strike");
  for (const ag::TradeCandidateOutput& candidate : filtered_ranked) {
    require_true(candidate.estimated_premium <= 9.0 + 1e-8, "premium filter keeps only affordable trades");
  }

  ag::TradeSearchInput delta_filter = baseline;
  delta_filter.max_absolute_delta = 0.60;
  const std::vector<ag::TradeCandidateOutput> delta_ranked = ag::rank_trades(delta_filter);
  require_true(!delta_ranked.empty(), "delta ranked trades");
  require_close(delta_ranked.front().strike_price, 105.0, 1e-8, "delta filter best strike");
  for (const ag::TradeCandidateOutput& candidate : delta_ranked) {
    require_true(std::abs(candidate.greeks.delta) <= 0.60 + 1e-8, "delta filter keeps only lower-delta trades");
  }

  ag::TradeSearchInput no_viable_trade = baseline;
  no_viable_trade.max_premium = 5.0;
  const std::vector<ag::TradeCandidateOutput> no_viable_ranked = ag::rank_trades(no_viable_trade);
  require_true(no_viable_ranked.empty(), "no trade remains under strict premium cap");

  bool threw = false;
  try {
    (void)ag::select_best_trade(no_viable_trade);
  } catch (const std::runtime_error&) {
    threw = true;
  }
  require_true(threw, "no viable trade produces no best trade");

  ag::TradeSearchInput bearish = sample_trade_search();
  bearish.signal.fair_value_estimate = 85.0;
  const std::vector<ag::TradeCandidateOutput> bearish_ranked = ag::rank_trades(bearish);
  require_true(!bearish_ranked.empty(), "bearish ranked trades");
  require_all_type(bearish_ranked, ag::OptionType::Put, "bearish search keeps only puts");

  return 0;
}
