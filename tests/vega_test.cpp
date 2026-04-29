#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>

#include "greeks/vega/vega.hpp"

namespace {

void require_close(double actual, double expected, double tolerance, const std::string& label) {
  if (std::fabs(actual - expected) > tolerance) {
    std::cerr << label << " expected " << expected << " got " << actual << "\n";
    std::exit(1);
  }
}

ag::OptionContractInput atm(ag::OptionType type) {
  ag::OptionContractInput option;
  option.type = type;
  option.spot_price = 100.0;
  option.strike_price = 100.0;
  option.risk_free_rate = 0.05;
  option.volatility = 0.20;
  option.time_to_expiration_years = 1.0;
  option.dividend_yield = 0.0;
  return option;
}

}

int main() {
  require_close(ag::vega_per_unit_volatility(atm(ag::OptionType::Call)), 37.5240346917, 1e-6, "call vega unit");
  require_close(ag::calculate_vega(atm(ag::OptionType::Call)), 0.3752403469, 1e-8, "call vega point");
  require_close(ag::calculate_vega(atm(ag::OptionType::Put)), 0.3752403469, 1e-8, "put vega point");

  ag::OptionContractInput expired = atm(ag::OptionType::Call);
  expired.time_to_expiration_years = 0.0;
  require_close(ag::calculate_vega(expired), 0.0, 1e-10, "expired vega");

  return 0;
}
