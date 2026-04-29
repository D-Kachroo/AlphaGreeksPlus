#include "rho.hpp"

#include "../../shared/math.hpp"

namespace ag {

namespace {

double deterministic_rho_per_unit_rate(const OptionContractInput& input) {
  if (input.time_to_expiration_years == 0.0) {
    return 0.0;
  }

  const double spot_leg = math::discounted_spot_value(input);
  const double strike_leg = math::discounted_strike_value(input);
  const double strike_rate_sensitivity = input.strike_price * input.time_to_expiration_years *
                                         math::discount_factor(input.risk_free_rate,
                                                               input.time_to_expiration_years);

  if (input.type == OptionType::Call) {
    return spot_leg > strike_leg ? strike_rate_sensitivity : 0.0;
  }

  return strike_leg > spot_leg ? -strike_rate_sensitivity : 0.0;
}

}

double rho_per_unit_rate(const OptionContractInput& input) {
  math::validate_option_contract_input(input);

  if (input.time_to_expiration_years == 0.0) {
    return 0.0;
  }

  if (input.volatility == 0.0) {
    return deterministic_rho_per_unit_rate(input);
  }

  const math::BlackScholesTerms terms = math::black_scholes_terms(input);
  const double strike_time_discount =
      input.strike_price * input.time_to_expiration_years * terms.rate_discount;

  if (input.type == OptionType::Call) {
    return strike_time_discount * math::normal_cdf(terms.d2);
  }

  return -strike_time_discount * math::normal_cdf(-terms.d2);
}

double rho_per_basis_point(const OptionContractInput& input) {
  return rho_per_unit_rate(input) * math::kBasisPoint;
}

double calculate_rho(const OptionContractInput& input) {
  return rho_per_unit_rate(input) / 100.0;
}

}
