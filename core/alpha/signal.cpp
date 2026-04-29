#include "signal.hpp"

#include <cmath>
#include <stdexcept>

#include "../shared/math.hpp"

namespace ag {

namespace {

constexpr double kStrongSignal = 0.15;
constexpr double kWeakSignal = 0.05;
constexpr double kMinimumConfidence = 0.25;

void validate_alpha_input(const AlphaSignalInput& input) {
  if (input.symbol.empty()) {
    throw std::invalid_argument("symbol is required.");
  }

  math::require_positive("market_price", input.market_price);
  math::require_positive("fair_value_estimate", input.fair_value_estimate);
  math::require_finite("expected_return", input.expected_return);
  math::require_non_negative("volatility", input.volatility);
  math::require_finite("confidence", input.confidence);
}

std::string rating_from_signal(double mispricing_percent, double confidence) {
  if (confidence < kMinimumConfidence) {
    return "Low Confidence";
  }

  if (mispricing_percent >= kStrongSignal) {
    return "Strong Undervalued";
  }

  if (mispricing_percent >= kWeakSignal) {
    return "Undervalued";
  }

  if (mispricing_percent <= -kStrongSignal) {
    return "Strong Overvalued";
  }

  if (mispricing_percent <= -kWeakSignal) {
    return "Overvalued";
  }

  return "Fair Value";
}

}

AlphaSignalOutput analyze_alpha_signal(const AlphaSignalInput& input) {
  validate_alpha_input(input);

  AlphaSignalOutput output;
  output.symbol = input.symbol;
  output.mispricing = input.fair_value_estimate - input.market_price;
  output.mispricing_percent = output.mispricing / input.market_price;
  output.confidence = math::clamp(input.confidence, 0.0, 1.0);
  output.rating = rating_from_signal(output.mispricing_percent, output.confidence);
  return output;
}

double signal_direction(const AlphaSignalOutput& signal) {
  if (signal.mispricing_percent > 0.0) {
    return 1.0;
  }

  if (signal.mispricing_percent < 0.0) {
    return -1.0;
  }

  return 0.0;
}

double signal_conviction(const AlphaSignalOutput& signal) {
  return std::abs(signal.mispricing_percent) * math::clamp(signal.confidence, 0.0, 1.0);
}

}
