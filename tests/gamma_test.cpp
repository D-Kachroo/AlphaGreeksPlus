#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>

#include "greeks/gamma/gamma.hpp"

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
  require_close(ag::calculate_gamma(atm(ag::OptionType::Call)), 0.0187620173, 1e-8, "call gamma");
  require_close(ag::calculate_gamma(atm(ag::OptionType::Put)), 0.0187620173, 1e-8, "put gamma");

  ag::OptionContractInput expired = atm(ag::OptionType::Call);
  expired.time_to_expiration_years = 0.0;
  require_close(ag::calculate_gamma(expired), 0.0, 1e-10, "expired gamma");

  return 0;
}
