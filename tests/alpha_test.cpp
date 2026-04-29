#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>

#include "alpha/signal.hpp"

namespace {

void require_close(double actual, double expected, double tolerance, const std::string& label) {
  if (std::fabs(actual - expected) > tolerance) {
    std::cerr << label << " expected " << expected << " got " << actual << "\n";
    std::exit(1);
  }
}

void require_equal(const std::string& actual, const std::string& expected, const std::string& label) {
  if (actual != expected) {
    std::cerr << label << " expected " << expected << " got " << actual << "\n";
    std::exit(1);
  }
}

}

int main() {
  ag::AlphaSignalInput bullish;
  bullish.symbol = "AAPL";
  bullish.market_price = 100.0;
  bullish.fair_value_estimate = 115.0;
  bullish.expected_return = 0.12;
  bullish.volatility = 0.22;
  bullish.confidence = 0.80;

  const ag::AlphaSignalOutput bullish_signal = ag::analyze_alpha_signal(bullish);
  require_close(bullish_signal.mispricing, 15.0, 1e-10, "bullish mispricing");
  require_close(bullish_signal.mispricing_percent, 0.15, 1e-10, "bullish mispricing percent");
  require_equal(bullish_signal.rating, "Strong Undervalued", "bullish rating");
  require_close(ag::signal_direction(bullish_signal), 1.0, 1e-10, "bullish direction");
  require_close(ag::signal_conviction(bullish_signal), 0.12, 1e-10, "bullish conviction");

  ag::AlphaSignalInput bearish = bullish;
  bearish.fair_value_estimate = 85.0;
  const ag::AlphaSignalOutput bearish_signal = ag::analyze_alpha_signal(bearish);
  require_equal(bearish_signal.rating, "Strong Overvalued", "bearish rating");
  require_close(ag::signal_direction(bearish_signal), -1.0, 1e-10, "bearish direction");

  ag::AlphaSignalInput weak = bullish;
  weak.confidence = 0.10;
  const ag::AlphaSignalOutput weak_signal = ag::analyze_alpha_signal(weak);
  require_equal(weak_signal.rating, "Low Confidence", "low confidence rating");

  return 0;
}
