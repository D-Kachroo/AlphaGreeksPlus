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

bool direction_matches_option(double alpha_direction, OptionType type) {
  return (alpha_direction > 0.0 && type == OptionType::Call) ||
         (alpha_direction < 0.0 && type == OptionType::Put);
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
  const double conviction = signal_conviction(signal);
  const double premium_floor = std::max(premium, 0.01);

  // Gamma is curvature. Scaling by spot puts it near delta units for scoring.
  const double gamma_exposure = signed_gamma * option.spot_price;

  // Daily theta and one-point vega are normalized by premium to compare contracts.
  const double theta_yield = signed_theta / premium_floor;
  const double vega_load = std::abs(signed_vega) / premium_floor;
  const double premium_ratio = premium / option.spot_price;

  return 100.0 * conviction * directional_alignment +
         5.0 * gamma_exposure +
         25.0 * theta_yield -
         3.0 * vega_load -
         10.0 * premium_ratio;
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
    if (!direction_matches_option(direction, option.type)) {
      continue;
    }

    const PricingOutput pricing = price_option(option);

    if (input.max_premium > 0.0 && pricing.theoretical_price > input.max_premium) {
      continue;
    }

    const GreeksOutput greeks = calculate_all_greeks(option);

    if (std::abs(greeks.delta) > input.max_absolute_delta) {
      continue;
    }

    const TradeSide side = TradeSide::Buy;

    TradeCandidateOutput candidate;
    candidate.type = option.type;
    candidate.side = side;
    candidate.strike_price = option.strike_price;
    candidate.time_to_expiration_years = option.time_to_expiration_years;
    candidate.estimated_premium = pricing.theoretical_price;
    candidate.greeks = greeks;
    candidate.score = score_trade(signal, option, pricing.theoretical_price, greeks, side);
    candidate.rationale = signal.rating + ": " + side_name(side) + " " +
                          option_name(option.type) +
                          " with aligned delta and Greek-adjusted risk.";

    candidates.push_back(candidate);
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
