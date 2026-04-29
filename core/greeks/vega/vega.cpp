#include "vega.hpp"

#include "../../shared/math.hpp"

namespace ag {

double vega_per_unit_volatility(const OptionContractInput& input) {
  math::validate_option_contract_input(input);

  if (input.time_to_expiration_years == 0.0 || input.volatility == 0.0) {
    return 0.0;
  }

  const math::BlackScholesTerms terms = math::black_scholes_terms(input);
  return terms.discounted_spot * terms.pdf_d1 * terms.sqrt_time;
}

double calculate_vega(const OptionContractInput& input) {
  return vega_per_unit_volatility(input) / 100.0;
}

}
