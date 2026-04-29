#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>

#include "options/pricing.hpp"

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
  const ag::OptionContractInput call = atm(ag::OptionType::Call);
  const ag::OptionContractInput put = atm(ag::OptionType::Put);

  require_close(ag::black_scholes_price(call), 10.4505835722, 1e-6, "call price");
  require_close(ag::black_scholes_price(put), 5.5735260223, 1e-6, "put price");

  const ag::PricingOutput call_output = ag::price_option(call);
  require_close(call_output.theoretical_price, 10.4505835722, 1e-6, "output price");
  require_close(call_output.intrinsic_value, 0.0, 1e-10, "output intrinsic");
  require_close(call_output.time_value, 10.4505835722, 1e-6, "output time value");

  ag::OptionContractInput expired_call = call;
  expired_call.spot_price = 108.0;
  expired_call.time_to_expiration_years = 0.0;
  require_close(ag::black_scholes_price(expired_call), 8.0, 1e-10, "expired call intrinsic");

  ag::OptionContractInput zero_vol_call = call;
  zero_vol_call.spot_price = 120.0;
  zero_vol_call.volatility = 0.0;
  require_close(ag::black_scholes_price(zero_vol_call), 24.8770575499, 1e-6, "zero vol call");

  return 0;
}
