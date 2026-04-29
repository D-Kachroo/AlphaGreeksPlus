#include "theta.hpp"

#include "../../shared/math.hpp"

namespace ag {

namespace {

double deterministic_theta_per_year(const OptionContractInput& input) {
  if (input.time_to_expiration_years == 0.0) {
    return 0.0;
  }

  const double spot_leg = math::discounted_spot_value(input);
  const double strike_leg = math::discounted_strike_value(input);

  if (input.type == OptionType::Call) {
    if (spot_leg <= strike_leg) {
      return 0.0;
    }

    return input.dividend_yield * spot_leg - input.risk_free_rate * strike_leg;
  }

  if (strike_leg <= spot_leg) {
    return 0.0;
  }

  return input.risk_free_rate * strike_leg - input.dividend_yield * spot_leg;
}

}

double theta_per_year(const OptionContractInput& input) {
  math::validate_option_contract_input(input);

  if (input.time_to_expiration_years == 0.0) {
    return 0.0;
  }

  if (input.volatility == 0.0) {
    return deterministic_theta_per_year(input);
  }

  const math::BlackScholesTerms terms = math::black_scholes_terms(input);
  const double diffusion_decay =
      -(terms.discounted_spot * terms.pdf_d1 * input.volatility) / (2.0 * terms.sqrt_time);

  if (input.type == OptionType::Call) {
    return diffusion_decay -
           input.risk_free_rate * terms.discounted_strike * math::normal_cdf(terms.d2) +
           input.dividend_yield * terms.discounted_spot * math::normal_cdf(terms.d1);
  }

  return diffusion_decay +
         input.risk_free_rate * terms.discounted_strike * math::normal_cdf(-terms.d2) -
         input.dividend_yield * terms.discounted_spot * math::normal_cdf(-terms.d1);
}

double theta_per_day(const OptionContractInput& input) {
  return theta_per_year(input) / math::kCalendarDaysPerYear;
}

double calculate_theta(const OptionContractInput& input) {
  return theta_per_day(input);
}

}
