#include "scenario.hpp"

#include <algorithm>
#include <array>

#include "../greeks/delta/delta.hpp"
#include "../greeks/gamma/gamma.hpp"
#include "../greeks/rho/rho.hpp"
#include "../greeks/theta/theta.hpp"
#include "../greeks/vega/vega.hpp"
#include "../options/pricing.hpp"
#include "../shared/math.hpp"

namespace ag {

namespace {

GreeksOutput calculate_point_greeks(const OptionContractInput& option) {
  GreeksOutput greeks;
  greeks.delta = calculate_delta(option);
  greeks.gamma = calculate_gamma(option);
  greeks.theta = calculate_theta(option);
  greeks.vega = calculate_vega(option);
  greeks.rho = calculate_rho(option);
  return greeks;
}

OptionContractInput apply_surface_point(
    const ScenarioInput& input,
    double spot_move_percent,
    double volatility_move_percent) {
  ScenarioInput point_input = input;
  point_input.spot_move_percent = spot_move_percent;
  point_input.volatility_move_percent = volatility_move_percent;
  return apply_scenario(point_input);
}

}

OptionContractInput apply_scenario(const ScenarioInput& input) {
  math::validate_option_contract_input(input.option);
  math::require_finite("spot_move_percent", input.spot_move_percent);
  math::require_finite("volatility_move_percent", input.volatility_move_percent);
  math::require_non_negative("days_forward", input.days_forward);
  math::require_finite("rate_move_basis_points", input.rate_move_basis_points);

  OptionContractInput stressed = input.option;
  stressed.spot_price =
      std::max(0.01, input.option.spot_price * (1.0 + input.spot_move_percent / 100.0));
  stressed.volatility =
      std::max(0.0, input.option.volatility * (1.0 + input.volatility_move_percent / 100.0));
  stressed.time_to_expiration_years =
      std::max(0.0, input.option.time_to_expiration_years -
                        math::years_from_calendar_days(input.days_forward));
  stressed.risk_free_rate =
      input.option.risk_free_rate + math::basis_points_to_decimal(input.rate_move_basis_points);

  return stressed;
}

ScenarioPointOutput evaluate_scenario_point(
    const OptionContractInput& option,
    double base_option_price) {
  ScenarioPointOutput point;
  point.spot_price = option.spot_price;
  point.volatility = option.volatility;
  point.time_to_expiration_years = option.time_to_expiration_years;
  point.option_price = black_scholes_price(option);
  point.profit_loss = point.option_price - base_option_price;
  point.greeks = calculate_point_greeks(option);
  return point;
}

ScenarioOutput simulate_scenario(const ScenarioInput& input) {
  const double base_price = black_scholes_price(input.option);
  const OptionContractInput stressed = apply_scenario(input);

  ScenarioOutput output;
  output.base_option_price = base_price;
  output.stressed_option_price = black_scholes_price(stressed);
  output.profit_loss = output.stressed_option_price - output.base_option_price;

  constexpr std::array<double, 9> kSpotMoves = {-20.0, -15.0, -10.0, -5.0, 0.0,
                                                5.0,   10.0,  15.0,  20.0};
  constexpr std::array<double, 7> kVolMoves = {-30.0, -20.0, -10.0, 0.0,
                                               10.0,  20.0,  30.0};

  output.points.reserve(kSpotMoves.size() * kVolMoves.size() + 1);

  for (double spot_move : kSpotMoves) {
    for (double vol_move : kVolMoves) {
      output.points.push_back(
          evaluate_scenario_point(apply_surface_point(input, spot_move, vol_move), base_price));
    }
  }

  output.points.push_back(evaluate_scenario_point(stressed, base_price));
  return output;
}

}
