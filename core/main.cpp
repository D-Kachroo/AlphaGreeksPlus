#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "alpha/signal.hpp"
#include "options/trade.hpp"
#include "shared/inputs.hpp"
#include "simulate/scenario.hpp"

namespace {

std::string read_stdin() {
  std::ostringstream buffer;
  buffer << std::cin.rdbuf();
  return buffer.str();
}

std::vector<std::string> split(const std::string& text, char delimiter) {
  std::vector<std::string> parts;
  std::string current;
  std::istringstream stream(text);

  while (std::getline(stream, current, delimiter)) {
    parts.push_back(current);
  }

  return parts;
}

std::vector<std::string> non_empty_lines(const std::string& text) {
  std::vector<std::string> lines;
  std::string line;
  std::istringstream stream(text);

  while (std::getline(stream, line)) {
    if (!line.empty()) {
      lines.push_back(line);
    }
  }

  return lines;
}

double parse_double(const std::string& value, const std::string& field) {
  std::size_t parsed = 0;
  const double number = std::stod(value, &parsed);

  if (parsed != value.size()) {
    throw std::invalid_argument(field + " must be numeric.");
  }

  return number;
}

ag::OptionType parse_option_type(const std::string& value) {
  if (value == "call") {
    return ag::OptionType::Call;
  }

  if (value == "put") {
    return ag::OptionType::Put;
  }

  throw std::invalid_argument("option type must be call or put.");
}

std::string option_type_json(ag::OptionType type) {
  return type == ag::OptionType::Call ? "call" : "put";
}

std::string side_json(ag::TradeSide side) {
  return side == ag::TradeSide::Buy ? "buy" : "sell";
}

std::string escape_json(const std::string& value) {
  std::string escaped;
  escaped.reserve(value.size());

  for (char ch : value) {
    if (ch == '"' || ch == '\\') {
      escaped.push_back('\\');
    }

    escaped.push_back(ch);
  }

  return escaped;
}

ag::OptionContractInput parse_option_line(const std::vector<std::string>& fields) {
  if (fields.size() != 8) {
    throw std::invalid_argument("option line requires 8 fields.");
  }

  ag::OptionContractInput option;
  option.type = parse_option_type(fields[1]);
  option.spot_price = parse_double(fields[2], "spot_price");
  option.strike_price = parse_double(fields[3], "strike_price");
  option.risk_free_rate = parse_double(fields[4], "risk_free_rate");
  option.volatility = parse_double(fields[5], "volatility");
  option.time_to_expiration_years = parse_double(fields[6], "time_to_expiration_years");
  option.dividend_yield = parse_double(fields[7], "dividend_yield");
  return option;
}

std::string json_greeks(const ag::GreeksOutput& greeks) {
  std::ostringstream out;
  out << "{\"delta\":" << greeks.delta
      << ",\"gamma\":" << greeks.gamma
      << ",\"theta\":" << greeks.theta
      << ",\"vega\":" << greeks.vega
      << ",\"rho\":" << greeks.rho << "}";
  return out.str();
}

std::string json_alpha(const ag::AlphaSignalOutput& signal) {
  std::ostringstream out;
  out << "{\"symbol\":\"" << escape_json(signal.symbol)
      << "\",\"mispricing\":" << signal.mispricing
      << ",\"mispricingPercent\":" << signal.mispricing_percent
      << ",\"confidence\":" << signal.confidence
      << ",\"rating\":\"" << escape_json(signal.rating) << "\"}";
  return out.str();
}

std::string json_trade(const ag::TradeCandidateOutput& trade) {
  std::ostringstream out;
  out << "{\"type\":\"" << option_type_json(trade.type)
      << "\",\"side\":\"" << side_json(trade.side)
      << "\",\"strikePrice\":" << trade.strike_price
      << ",\"timeToExpirationYears\":" << trade.time_to_expiration_years
      << ",\"estimatedPremium\":" << trade.estimated_premium
      << ",\"greeks\":" << json_greeks(trade.greeks)
      << ",\"score\":" << trade.score
      << ",\"rationale\":\"" << escape_json(trade.rationale) << "\"}";
  return out.str();
}

std::string json_scenario_point(const ag::ScenarioPointOutput& point) {
  std::ostringstream out;
  out << "{\"spotPrice\":" << point.spot_price
      << ",\"volatility\":" << point.volatility
      << ",\"timeToExpirationYears\":" << point.time_to_expiration_years
      << ",\"optionPrice\":" << point.option_price
      << ",\"profitLoss\":" << point.profit_loss
      << ",\"greeks\":" << json_greeks(point.greeks) << "}";
  return out.str();
}

std::string handle_analyze(const std::string& payload) {
  ag::TradeSearchInput input;

  for (const std::string& line : non_empty_lines(payload)) {
    const std::vector<std::string> fields = split(line, '|');

    if (fields.empty()) {
      continue;
    }

    if (fields[0] == "signal") {
      if (fields.size() != 9) {
        throw std::invalid_argument("signal line requires 9 fields.");
      }

      input.signal.symbol = fields[1];
      input.signal.market_price = parse_double(fields[2], "market_price");
      input.signal.fair_value_estimate = parse_double(fields[3], "fair_value_estimate");
      input.signal.expected_return = parse_double(fields[4], "expected_return");
      input.signal.volatility = parse_double(fields[5], "volatility");
      input.signal.confidence = parse_double(fields[6], "confidence");
      input.max_premium = parse_double(fields[7], "max_premium");
      input.max_absolute_delta = parse_double(fields[8], "max_absolute_delta");
    } else if (fields[0] == "contract") {
      input.contracts.push_back(parse_option_line(fields));
    }
  }

  const ag::AlphaSignalOutput signal = ag::analyze_alpha_signal(input.signal);
  const std::vector<ag::TradeCandidateOutput> ranked = ag::rank_trades(input);

  std::ostringstream out;
  out << std::setprecision(12);
  out << "{\"alpha\":" << json_alpha(signal) << ",\"bestTrade\":";

  if (ranked.empty() || ranked.front().score <= 0.0) {
    out << "null";
  } else {
    out << json_trade(ranked.front());
  }

  out << ",\"rankedTrades\":[";

  for (std::size_t i = 0; i < ranked.size(); ++i) {
    if (i > 0) {
      out << ",";
    }

    out << json_trade(ranked[i]);
  }

  out << "]}";
  return out.str();
}

std::string handle_simulate(const std::string& payload) {
  ag::ScenarioInput input;

  for (const std::string& line : non_empty_lines(payload)) {
    const std::vector<std::string> fields = split(line, '|');

    if (fields.empty()) {
      continue;
    }

    if (fields[0] == "option") {
      input.option = parse_option_line(fields);
    } else if (fields[0] == "scenario") {
      if (fields.size() != 5) {
        throw std::invalid_argument("scenario line requires 5 fields.");
      }

      input.spot_move_percent = parse_double(fields[1], "spot_move_percent");
      input.volatility_move_percent = parse_double(fields[2], "volatility_move_percent");
      input.days_forward = parse_double(fields[3], "days_forward");
      input.rate_move_basis_points = parse_double(fields[4], "rate_move_basis_points");
    }
  }

  const ag::ScenarioOutput scenario = ag::simulate_scenario(input);

  std::ostringstream out;
  out << std::setprecision(12);
  out << "{\"baseOptionPrice\":" << scenario.base_option_price
      << ",\"stressedOptionPrice\":" << scenario.stressed_option_price
      << ",\"profitLoss\":" << scenario.profit_loss
      << ",\"points\":[";

  for (std::size_t i = 0; i < scenario.points.size(); ++i) {
    if (i > 0) {
      out << ",";
    }

    out << json_scenario_point(scenario.points[i]);
  }

  out << "]}";
  return out.str();
}

}

int main(int argc, char* argv[]) {
  try {
    if (argc < 2) {
      std::cout << "{\"status\":\"ok\",\"project\":\"AlphaGreeks+\"}\n";
      return 0;
    }

    const std::string command = argv[1];
    const std::string payload = read_stdin();

    if (command == "analyze") {
      std::cout << handle_analyze(payload) << "\n";
      return 0;
    }

    if (command == "simulate") {
      std::cout << handle_simulate(payload) << "\n";
      return 0;
    }

    throw std::invalid_argument("unknown command.");
  } catch (const std::exception& error) {
    std::cerr << error.what() << "\n";
    return 1;
  }
}
