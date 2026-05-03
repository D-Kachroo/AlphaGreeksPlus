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

void require_directionally_bullish(
    const std::vector<ag::TradeCandidateOutput>& ranked,
    const std::string& label) {
  for (const ag::TradeCandidateOutput& candidate : ranked) {
    const bool valid_structure =
        (candidate.side == ag::TradeSide::Buy && candidate.type == ag::OptionType::Call) ||
        (candidate.side == ag::TradeSide::Sell && candidate.type == ag::OptionType::Put);

    if (!valid_structure) {
      std::cerr << label << " failed\n";
      std::exit(1);
    }
  }
}

void require_directionally_bearish(
    const std::vector<ag::TradeCandidateOutput>& ranked,
    const std::string& label) {
  for (const ag::TradeCandidateOutput& candidate : ranked) {
    const bool valid_structure =
        (candidate.side == ag::TradeSide::Buy && candidate.type == ag::OptionType::Put) ||
        (candidate.side == ag::TradeSide::Sell && candidate.type == ag::OptionType::Call);

    if (!valid_structure) {
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
  require_directionally_bullish(baseline_ranked, "bullish search keeps only bullish structures");
  require_close(baseline_ranked.front().strike_price, 95.0, 1e-8, "baseline best strike");
  require_true(
      baseline_ranked.front().side == ag::TradeSide::Buy &&
          baseline_ranked.front().type == ag::OptionType::Call,
      "strong bullish baseline prefers long call");

  ag::TradeSearchInput tighter_budget = baseline;
  tighter_budget.max_premium = 10.0;
  tighter_budget.max_absolute_delta = 0.75;
  const std::vector<ag::TradeCandidateOutput> tighter_ranked = ag::rank_trades(tighter_budget);
  require_true(!tighter_ranked.empty(), "tighter ranked trades");
  require_close(
      score_for_strike(tighter_ranked, 95.0),
      score_for_strike(baseline_ranked, 95.0),
      1e-8,
      "passing trade score unchanged");

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
  no_viable_trade.max_premium = 4.0;
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
  require_directionally_bearish(bearish_ranked, "bearish search keeps only bearish structures");
  require_true(
      bearish_ranked.front().side == ag::TradeSide::Buy &&
          bearish_ranked.front().type == ag::OptionType::Put,
      "strong bearish signal prefers long put");

  ag::TradeSearchInput low_conviction_bullish = sample_trade_search();
  low_conviction_bullish.signal.fair_value_estimate = 103.0;
  low_conviction_bullish.signal.confidence = 0.50;
  const ag::TradeCandidateOutput low_bull_trade = ag::select_best_trade(low_conviction_bullish);
  require_true(
      low_bull_trade.side == ag::TradeSide::Sell && low_bull_trade.type == ag::OptionType::Put,
      "modest bullish signal prefers short put income");

  ag::TradeSearchInput low_conviction_bearish = sample_trade_search();
  low_conviction_bearish.signal.fair_value_estimate = 97.0;
  low_conviction_bearish.signal.confidence = 0.50;
  const ag::TradeCandidateOutput low_bear_trade = ag::select_best_trade(low_conviction_bearish);
  require_true(
      low_bear_trade.side == ag::TradeSide::Sell && low_bear_trade.type == ag::OptionType::Call,
      "modest bearish signal prefers short call income");

  return 0;
}
