#include "pricing.hpp"

#include "../shared/math.hpp"

namespace ag {

double black_scholes_price(const OptionContractInput& input) {
  math::validate_option_contract_input(input);

  if (input.time_to_expiration_years == 0.0) {
    return math::intrinsic_value(input.type, input.spot_price, input.strike_price);
  }

  if (input.volatility == 0.0) {
    return math::deterministic_discounted_payoff(input);
  }

  const math::BlackScholesTerms terms = math::black_scholes_terms(input);

  if (input.type == OptionType::Call) {
    return terms.discounted_spot * math::normal_cdf(terms.d1) -
           terms.discounted_strike * math::normal_cdf(terms.d2);
  }

  return terms.discounted_strike * math::normal_cdf(-terms.d2) -
         terms.discounted_spot * math::normal_cdf(-terms.d1);
}

PricingOutput price_option(const OptionContractInput& input) {
  PricingOutput output;
  output.theoretical_price = black_scholes_price(input);
  output.intrinsic_value = math::intrinsic_value(input.type, input.spot_price, input.strike_price);
  output.time_value = output.theoretical_price - output.intrinsic_value;
  return output;
}

}
