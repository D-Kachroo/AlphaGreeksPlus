#include "gamma.hpp"

#include "../../shared/math.hpp"

namespace ag {

double calculate_gamma(const OptionContractInput& input) {
  math::validate_option_contract_input(input);

  if (input.time_to_expiration_years == 0.0 || input.volatility == 0.0) {
    return 0.0;
  }

  const math::BlackScholesTerms terms = math::black_scholes_terms(input);
  return terms.dividend_discount * terms.pdf_d1 /
         (input.spot_price * input.volatility * terms.sqrt_time);
}

}
