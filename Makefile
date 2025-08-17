CXX = g++
CXXFLAGS = -std=c++17 -Wall -O2
LIBS = -lboost_system -lboost_program_options -lboost_json -lyaml-cpp -lpthread -lssl -lcrypto
TARGET = ~/Downloads/output_client
# TARGET = output_client
SOURCE = output_client.cpp

$(TARGET): $(SOURCE)
	$(CXX) $(CXXFLAGS) $(SOURCE) $(LIBS) -o $(TARGET)

clean:
	rm -f $(TARGET)

test: $(TARGET)
	  $(TARGET)
# 	  ./$(TARGET)

.PHONY: clean test
