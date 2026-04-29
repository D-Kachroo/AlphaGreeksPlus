#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>

#include "greeks/theta/theta.hpp"

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

  require_close(ag::theta_per_year(call), -6.4140275464, 1e-6, "call theta yearly");
  require_close(ag::calculate_theta(call), -0.0175726782, 1e-8, "call theta daily");
  require_close(ag::theta_per_year(put), -1.6578804239, 1e-6, "put theta yearly");
  require_close(ag::calculate_theta(put), -0.0045421381, 1e-8, "put theta daily");

  ag::OptionContractInput expired = call;
  expired.time_to_expiration_years = 0.0;
  require_close(ag::calculate_theta(expired), 0.0, 1e-10, "expired theta");

  return 0;
}
