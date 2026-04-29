#include "delta.hpp"

#include "../../shared/math.hpp"

namespace ag {

namespace {

double terminal_delta(OptionType type, double spot_price, double strike_price) {
  if (spot_price == strike_price) {
    return type == OptionType::Call ? 0.5 : -0.5;
  }

  if (type == OptionType::Call) {
    return spot_price > strike_price ? 1.0 : 0.0;
  }

  return spot_price < strike_price ? -1.0 : 0.0;
}

double deterministic_delta(const OptionContractInput& input) {
  const double forward =
      math::forward_price(input.spot_price, input.risk_free_rate, input.dividend_yield,
                          input.time_to_expiration_years);
  const double dividend_discount =
      math::dividend_discount_factor(input.dividend_yield, input.time_to_expiration_years);

  if (forward == input.strike_price) {
    return input.type == OptionType::Call ? 0.5 * dividend_discount
                                          : -0.5 * dividend_discount;
  }

  if (input.type == OptionType::Call) {
    return forward > input.strike_price ? dividend_discount : 0.0;
  }

  return forward < input.strike_price ? -dividend_discount : 0.0;
}

}

double calculate_delta(const OptionContractInput& input) {
  math::validate_option_contract_input(input);

  if (input.time_to_expiration_years == 0.0) {
    return terminal_delta(input.type, input.spot_price, input.strike_price);
  }

  if (input.volatility == 0.0) {
    return deterministic_delta(input);
  }

  const math::BlackScholesTerms terms = math::black_scholes_terms(input);

  if (input.type == OptionType::Call) {
    return terms.dividend_discount * math::normal_cdf(terms.d1);
  }

  return terms.dividend_discount * (math::normal_cdf(terms.d1) - 1.0);
}

}
