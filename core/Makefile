CXX := g++
CXXFLAGS := -std=c++17 -Wall -Wextra -pedantic -I.
BUILD_DIR := build
TARGET := $(BUILD_DIR)/alphagreeks

CORE_SOURCES := \
	alpha/signal.cpp \
	options/pricing.cpp \
	options/trade.cpp \
	greeks/delta/delta.cpp \
	greeks/gamma/gamma.cpp \
	greeks/theta/theta.cpp \
	greeks/vega/vega.cpp \
	greeks/rho/rho.cpp \
	simulate/scenario.cpp

SOURCES := main.cpp $(CORE_SOURCES)
OBJECTS := $(SOURCES:%.cpp=$(BUILD_DIR)/%.o)
CORE_OBJECTS := $(CORE_SOURCES:%.cpp=$(BUILD_DIR)/%.o)
TEST_SOURCES := $(wildcard ../tests/*_test.cpp)
TEST_TARGETS := $(patsubst ../tests/%.cpp,$(BUILD_DIR)/tests/%,$(TEST_SOURCES))

all: $(TARGET)

$(TARGET): $(OBJECTS)
	$(CXX) $(CXXFLAGS) $^ -o $@

$(BUILD_DIR)/%.o: %.cpp
	mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) -c $< -o $@

test: $(TEST_TARGETS)
	@for test_bin in $(TEST_TARGETS); do \
		echo "Running $$test_bin"; \
		$$test_bin; \
	done

$(BUILD_DIR)/tests/%: ../tests/%.cpp $(CORE_OBJECTS)
	mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) $< $(CORE_OBJECTS) -o $@

clean:
	rm -rf $(BUILD_DIR)

.PHONY: all test clean
