#pragma once

#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <string>

#include "inputs.hpp"

namespace ag::math {

constexpr double kPi = 3.14159265358979323846;
constexpr double kTradingDaysPerYear = 252.0;
constexpr double kCalendarDaysPerYear = 365.0;
constexpr double kBasisPoint = 0.0001;

struct BlackScholesTerms {
  double sqrt_time = 0.0;
  double d1 = 0.0;
  double d2 = 0.0;
  double dividend_discount = 0.0;
  double rate_discount = 0.0;
  double discounted_spot = 0.0;
  double discounted_strike = 0.0;
  double pdf_d1 = 0.0;
};

inline bool is_finite(double value) {
  return std::isfinite(value);
}

inline void require_finite(const std::string& name, double value) {
  if (!is_finite(value)) {
    throw std::invalid_argument(name + " must be finite.");
  }
}

inline void require_positive(const std::string& name, double value) {
  require_finite(name, value);

  if (value <= 0.0) {
    throw std::invalid_argument(name + " must be greater than zero.");
  }
}

inline void require_non_negative(const std::string& name, double value) {
  require_finite(name, value);

  if (value < 0.0) {
    throw std::invalid_argument(name + " must be greater than or equal to zero.");
  }
}

inline double clamp(double value, double lower, double upper) {
  return std::max(lower, std::min(value, upper));
}

inline double years_from_calendar_days(double days) {
  require_non_negative("days", days);
  return days / kCalendarDaysPerYear;
}

inline double years_from_trading_days(double days) {
  require_non_negative("days", days);
  return days / kTradingDaysPerYear;
}

inline double normal_pdf(double x) {
  return std::exp(-0.5 * x * x) / std::sqrt(2.0 * kPi);
}

inline double normal_cdf(double x) {
  return 0.5 * std::erfc(-x / std::sqrt(2.0));
}

inline int option_sign(OptionType type) {
  return type == OptionType::Call ? 1 : -1;
}

inline double discount_factor(double rate, double time_to_expiration_years) {
  require_finite("rate", rate);
  require_non_negative("time_to_expiration_years", time_to_expiration_years);
  return std::exp(-rate * time_to_expiration_years);
}

inline double forward_price(
    double spot_price,
    double risk_free_rate,
    double dividend_yield,
    double time_to_expiration_years) {
  require_positive("spot_price", spot_price);
  require_finite("risk_free_rate", risk_free_rate);
  require_finite("dividend_yield", dividend_yield);
  require_non_negative("time_to_expiration_years", time_to_expiration_years);

  return spot_price * std::exp((risk_free_rate - dividend_yield) * time_to_expiration_years);
}

inline double dividend_discount_factor(double dividend_yield, double time_to_expiration_years) {
  require_finite("dividend_yield", dividend_yield);
  require_non_negative("time_to_expiration_years", time_to_expiration_years);
  return std::exp(-dividend_yield * time_to_expiration_years);
}

inline double intrinsic_value(OptionType type, double spot_price, double strike_price) {
  require_non_negative("spot_price", spot_price);
  require_non_negative("strike_price", strike_price);

  if (type == OptionType::Call) {
    return std::max(spot_price - strike_price, 0.0);
  }

  return std::max(strike_price - spot_price, 0.0);
}

inline void validate_option_contract_input(const OptionContractInput& input) {
  require_positive("spot_price", input.spot_price);
  require_positive("strike_price", input.strike_price);
  require_finite("risk_free_rate", input.risk_free_rate);
  require_non_negative("volatility", input.volatility);
  require_non_negative("time_to_expiration_years", input.time_to_expiration_years);
  require_finite("dividend_yield", input.dividend_yield);
}

inline void validate_black_scholes_input(const OptionContractInput& input) {
  validate_option_contract_input(input);
  require_positive("volatility", input.volatility);
  require_positive("time_to_expiration_years", input.time_to_expiration_years);
}

inline double discounted_spot_value(const OptionContractInput& input) {
  validate_option_contract_input(input);
  return input.spot_price *
         dividend_discount_factor(input.dividend_yield, input.time_to_expiration_years);
}

inline double discounted_strike_value(const OptionContractInput& input) {
  validate_option_contract_input(input);
  return input.strike_price *
         discount_factor(input.risk_free_rate, input.time_to_expiration_years);
}

inline double deterministic_discounted_payoff(const OptionContractInput& input) {
  const double spot_leg = discounted_spot_value(input);
  const double strike_leg = discounted_strike_value(input);

  if (input.type == OptionType::Call) {
    return std::max(spot_leg - strike_leg, 0.0);
  }

  return std::max(strike_leg - spot_leg, 0.0);
}

inline BlackScholesTerms black_scholes_terms(const OptionContractInput& input) {
  validate_black_scholes_input(input);

  const double variance_term = 0.5 * input.volatility * input.volatility;
  const double sqrt_time = std::sqrt(input.time_to_expiration_years);
  const double numerator =
      std::log(input.spot_price / input.strike_price) +
      (input.risk_free_rate - input.dividend_yield + variance_term) *
          input.time_to_expiration_years;
  const double denominator = input.volatility * sqrt_time;
  const double d1 = numerator / denominator;
  const double d2 = d1 - input.volatility * sqrt_time;

  BlackScholesTerms terms;
  terms.sqrt_time = sqrt_time;
  terms.d1 = d1;
  terms.d2 = d2;
  terms.dividend_discount =
      dividend_discount_factor(input.dividend_yield, input.time_to_expiration_years);
  terms.rate_discount = discount_factor(input.risk_free_rate, input.time_to_expiration_years);
  terms.discounted_spot = input.spot_price * terms.dividend_discount;
  terms.discounted_strike = input.strike_price * terms.rate_discount;
  terms.pdf_d1 = normal_pdf(d1);

  return terms;
}

inline double black_scholes_d1(const OptionContractInput& input) {
  return black_scholes_terms(input).d1;
}

inline double black_scholes_d2(const OptionContractInput& input) {
  return black_scholes_terms(input).d2;
}

inline double basis_points_to_decimal(double basis_points) {
  require_finite("basis_points", basis_points);
  return basis_points * kBasisPoint;
}

}
