#include "trade.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>
#include <vector>

#include "../alpha/signal.hpp"
#include "../greeks/delta/delta.hpp"
#include "../greeks/gamma/gamma.hpp"
#include "../greeks/rho/rho.hpp"
#include "../greeks/theta/theta.hpp"
#include "../greeks/vega/vega.hpp"
#include "../shared/math.hpp"
#include "pricing.hpp"

namespace ag {

namespace {

double side_multiplier(TradeSide side) {
  return side == TradeSide::Buy ? 1.0 : -1.0;
}

constexpr double kMinimumVolatility = 0.01;
constexpr double kMinimumTime = 1.0 / 365.0;

std::vector<TradeSide> aligned_sides(
    double alpha_direction,
    OptionType type) {
  if (alpha_direction > 0.0) {
    return type == OptionType::Call ? std::vector<TradeSide>{TradeSide::Buy}
                                    : std::vector<TradeSide>{TradeSide::Sell};
  }

  if (alpha_direction < 0.0) {
    return type == OptionType::Call ? std::vector<TradeSide>{TradeSide::Sell}
                                    : std::vector<TradeSide>{TradeSide::Buy};
  }

  return {};
}

double break_even_price(
    const OptionContractInput& option,
    double premium) {
  if (option.type == OptionType::Call) {
    return option.strike_price + premium;
  }

  return option.strike_price - premium;
}

double target_buffer(
    const OptionContractInput& option,
    double premium,
    TradeSide side,
    double target_spot_price) {
  const double break_even = break_even_price(option, premium);
  const double normalizer = std::max(option.spot_price, 0.01);

  if (option.type == OptionType::Call) {
    return side == TradeSide::Buy ? (target_spot_price - break_even) / normalizer
                                  : (break_even - target_spot_price) / normalizer;
  }

  return side == TradeSide::Buy ? (break_even - target_spot_price) / normalizer
                                : (target_spot_price - break_even) / normalizer;
}

double short_risk_capital(
    const OptionContractInput& option,
    double premium) {
  if (option.type == OptionType::Call) {
    return std::max(option.spot_price + premium, option.strike_price + premium);
  }

  return std::max(option.strike_price - premium, premium);
}

double target_option_value(
    const OptionContractInput& option,
    double target_spot_price) {
  OptionContractInput target = option;
  target.spot_price = std::max(target_spot_price, 0.01);
  return black_scholes_price(target);
}

double signal_move_units(
    const AlphaSignalInput& signal_input,
    const OptionContractInput& option) {
  const double safe_volatility = std::max(signal_input.volatility, kMinimumVolatility);
  const double safe_time = std::max(option.time_to_expiration_years, kMinimumTime);
  const double expected_move = option.spot_price * safe_volatility * std::sqrt(safe_time);

  if (expected_move <= 0.0) {
    return 0.0;
  }

  return std::abs(signal_input.fair_value_estimate - option.spot_price) / expected_move;
}

std::string option_name(OptionType type) {
  return type == OptionType::Call ? "call" : "put";
}

std::string side_name(TradeSide side) {
  return side == TradeSide::Buy ? "buy" : "sell";
}

GreeksOutput calculate_all_greeks(const OptionContractInput& option) {
  GreeksOutput greeks;
  greeks.delta = calculate_delta(option);
  greeks.gamma = calculate_gamma(option);
  greeks.theta = calculate_theta(option);
  greeks.vega = calculate_vega(option);
  greeks.rho = calculate_rho(option);
  return greeks;
}

double score_trade(
    const AlphaSignalOutput& signal,
    const AlphaSignalInput& signal_input,
    const OptionContractInput& option,
    double premium,
    const GreeksOutput& greeks,
    TradeSide side) {
  const double direction = signal_direction(signal);
  const double signed_delta = greeks.delta * side_multiplier(side);
  const double signed_gamma = greeks.gamma * side_multiplier(side);
  const double signed_theta = greeks.theta * side_multiplier(side);
  const double signed_vega = greeks.vega * side_multiplier(side);

  const double directional_alignment = std::max(0.0, direction * signed_delta);
  const double signal_conviction_value = signal_conviction(signal);
  const double premium_floor = std::max(premium, 0.01);
  const double risk_capital =
      side == TradeSide::Buy ? premium_floor : short_risk_capital(option, premium_floor);
  const double repriced_target = target_option_value(option, signal_input.fair_value_estimate);
  const double target_profit = side_multiplier(side) * (repriced_target - premium);
  const double conviction_weight = math::clamp(
      signal_move_units(signal_input, option) * math::clamp(signal.confidence, 0.0, 1.0) / 1.10,
      0.0, 1.0);
  const double strategy_preference =
      side == TradeSide::Buy ? conviction_weight : 1.0 - conviction_weight;
  const double fair_value_buffer = target_buffer(
      option,
      premium_floor,
      side,
      signal_input.fair_value_estimate);
  const double income_yield = side == TradeSide::Sell ? premium_floor / risk_capital : 0.0;
  const double theta_carry = side == TradeSide::Sell ? std::max(-signed_theta, 0.0) / risk_capital
                                                     : 0.0;
  const double theta_drag = side == TradeSide::Buy ? std::max(-greeks.theta, 0.0) / premium_floor
                                                   : 0.0;

  // Gamma is curvature. Scaling by spot puts it near delta units for scoring.
  const double gamma_exposure = signed_gamma * option.spot_price;

  // One-point vega is normalized by capital at risk to compare contracts.
  const double vega_load = std::abs(signed_vega) / risk_capital;
  const double premium_ratio = premium / option.spot_price;
  const double target_return_on_premium = target_profit / risk_capital;
  const double payoff_weight =
      side == TradeSide::Buy ? strategy_preference : 0.40 + 0.60 * strategy_preference;
  const double weighted_target_return = target_return_on_premium * payoff_weight;
  const double regime_penalty =
      side == TradeSide::Buy
          ? (conviction_weight < 0.12 ? 20.0 * (0.12 - conviction_weight) / 0.12 : 0.0)
          : (conviction_weight > 0.88 ? 10.0 * (conviction_weight - 0.88) / 0.12 : 0.0);
  const double low_edge_penalty =
      side == TradeSide::Buy
          ? (signal_conviction_value < 0.03 ? 20.0 * (0.03 - signal_conviction_value) / 0.03 : 0.0)
          : 0.0;

  return 60.0 * weighted_target_return +
         18.0 * strategy_preference * fair_value_buffer +
         10.0 * directional_alignment +
         10.0 * income_yield +
         10.0 * theta_carry -
         8.0 * theta_drag +
         1.5 * gamma_exposure -
         4.0 * vega_load -
         6.0 * premium_ratio -
         regime_penalty -
         low_edge_penalty;
}

void validate_trade_search(const TradeSearchInput& input) {
  if (input.contracts.empty()) {
    throw std::invalid_argument("at least one option contract is required.");
  }

  math::require_non_negative("max_premium", input.max_premium);
  math::require_positive("max_absolute_delta", input.max_absolute_delta);

  if (input.max_absolute_delta > 1.0) {
    throw std::invalid_argument("max_absolute_delta cannot exceed 1.0.");
  }
}

}

std::vector<TradeCandidateOutput> rank_trades(const TradeSearchInput& input) {
  validate_trade_search(input);

  const AlphaSignalOutput signal = analyze_alpha_signal(input.signal);
  const double direction = signal_direction(signal);

  if (direction == 0.0) {
    return {};
  }

  std::vector<TradeCandidateOutput> candidates;

  for (const OptionContractInput& option : input.contracts) {
    const PricingOutput pricing = price_option(option);

    if (input.max_premium > 0.0 && pricing.theoretical_price > input.max_premium) {
      continue;
    }

    const GreeksOutput greeks = calculate_all_greeks(option);

    if (std::abs(greeks.delta) > input.max_absolute_delta) {
      continue;
    }

    for (const TradeSide side : aligned_sides(direction, option.type)) {
      TradeCandidateOutput candidate;
      candidate.type = option.type;
      candidate.side = side;
      candidate.strike_price = option.strike_price;
      candidate.time_to_expiration_years = option.time_to_expiration_years;
      candidate.estimated_premium = pricing.theoretical_price;
      candidate.greeks = greeks;
      candidate.score = score_trade(
          signal, input.signal, option, pricing.theoretical_price, greeks, side);
      candidate.rationale = signal.rating + ": " + side_name(side) + " " +
                            option_name(option.type) +
                            " with fair-value target and Greek-adjusted risk.";

      candidates.push_back(candidate);
    }
  }

  std::sort(candidates.begin(), candidates.end(),
            [](const TradeCandidateOutput& left, const TradeCandidateOutput& right) {
              return left.score > right.score;
            });

  return candidates;
}

TradeCandidateOutput select_best_trade(const TradeSearchInput& input) {
  const std::vector<TradeCandidateOutput> candidates = rank_trades(input);

  if (candidates.empty() || candidates.front().score <= 0.0) {
    throw std::runtime_error("no option trade passed the selection filters.");
  }

  return candidates.front();
}

}
