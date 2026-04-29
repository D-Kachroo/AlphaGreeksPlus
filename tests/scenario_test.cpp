#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>

#include "simulate/scenario.hpp"

namespace {

void require_close(double actual, double expected, double tolerance, const std::string& label) {
  if (std::fabs(actual - expected) > tolerance) {
    std::cerr << label << " expected " << expected << " got " << actual << "\n";
    std::exit(1);
  }
}

void require_true(bool condition, const std::string& label) {
  if (!condition) {
    std::cerr << label << " failed\n";
    std::exit(1);
  }
}

}

int main() {
  ag::ScenarioInput input;
  input.option.type = ag::OptionType::Call;
  input.option.spot_price = 100.0;
  input.option.strike_price = 100.0;
  input.option.risk_free_rate = 0.05;
  input.option.volatility = 0.20;
  input.option.time_to_expiration_years = 1.0;
  input.option.dividend_yield = 0.0;
  input.spot_move_percent = 10.0;
  input.volatility_move_percent = 5.0;
  input.days_forward = 30.0;
  input.rate_move_basis_points = 25.0;

  const ag::OptionContractInput stressed = ag::apply_scenario(input);
  require_close(stressed.spot_price, 110.0, 1e-10, "stressed spot");
  require_close(stressed.volatility, 0.21, 1e-10, "stressed volatility");
  require_close(stressed.time_to_expiration_years, 0.9178082192, 1e-8, "stressed time");
  require_close(stressed.risk_free_rate, 0.0525, 1e-10, "stressed rate");

  const ag::ScenarioOutput output = ag::simulate_scenario(input);
  require_close(output.base_option_price, 10.4505835722, 1e-6, "base price");
  require_close(output.stressed_option_price, 17.5735592978, 1e-6, "stressed price");
  require_close(output.profit_loss, 7.1229757256, 1e-6, "scenario profit loss");
  require_true(output.points.size() == 64, "scenario grid size");

  return 0;
}
