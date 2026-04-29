#pragma once

#include "../shared/inputs.hpp"
#include "../shared/outputs.hpp"

namespace ag {

// Mispricing = fair value - market price.
// Mispricing % = (fair value - market price) / market price.
AlphaSignalOutput analyze_alpha_signal(const AlphaSignalInput& input);

// Direction: +1 bullish/undervalued, -1 bearish/overvalued, 0 neutral.
double signal_direction(const AlphaSignalOutput& signal);

// Conviction scales absolute mispricing by confidence, both expressed as decimals.
double signal_conviction(const AlphaSignalOutput& signal);

}
