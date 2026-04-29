#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>

#include "greeks/delta/delta.hpp"

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
  require_close(ag::calculate_delta(atm(ag::OptionType::Call)), 0.6368306512, 1e-6, "call delta");
  require_close(ag::calculate_delta(atm(ag::OptionType::Put)), -0.3631693488, 1e-6, "put delta");

  ag::OptionContractInput expired_call = atm(ag::OptionType::Call);
  expired_call.spot_price = 110.0;
  expired_call.time_to_expiration_years = 0.0;
  require_close(ag::calculate_delta(expired_call), 1.0, 1e-10, "expired ITM call delta");

  ag::OptionContractInput expired_put = atm(ag::OptionType::Put);
  expired_put.spot_price = 90.0;
  expired_put.time_to_expiration_years = 0.0;
  require_close(ag::calculate_delta(expired_put), -1.0, 1e-10, "expired ITM put delta");

  return 0;
}
