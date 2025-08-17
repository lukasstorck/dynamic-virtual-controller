#include <boost/beast/core.hpp>
#include <boost/beast/ssl.hpp>
#include <boost/beast/websocket.hpp>
#include <boost/beast/websocket/ssl.hpp>
#include <boost/asio/connect.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <boost/asio/ssl/stream.hpp>
#include <boost/asio/signal_set.hpp>
#include <boost/program_options.hpp>
#include <boost/json.hpp>
#include <yaml-cpp/yaml.h>
#include <iostream>
#include <string>
#include <chrono>
#include <filesystem>
#include <map>
#include <vector>
#include <thread>
#include <atomic>
#include <memory>

// Linux uinput headers
#include <linux/uinput.h>
#include <linux/input.h>
#include <fcntl.h>
#include <unistd.h>
#include <cstring>

namespace beast = boost::beast;
namespace http = beast::http;
namespace websocket = beast::websocket;
namespace net = boost::asio;
namespace ssl = net::ssl;
namespace po = boost::program_options;
namespace json = boost::json;
using tcp = net::ip::tcp;
namespace fs = std::filesystem;

// Global stop flag
std::atomic<bool> stop_requested{false};

// Mapping semantic button names to Linux input codes
const std::map<std::string, int> SEMANTIC_TO_UINPUT = {
    {"BTN_DPAD_UP", BTN_DPAD_UP},
    {"BTN_DPAD_DOWN", BTN_DPAD_DOWN},
    {"BTN_DPAD_LEFT", BTN_DPAD_LEFT},
    {"BTN_DPAD_RIGHT", BTN_DPAD_RIGHT},
    {"BTN_A", BTN_A},
    {"BTN_B", BTN_B},
    {"BTN_X", BTN_X},
    {"BTN_Y", BTN_Y},
    {"BTN_TL", BTN_TL}, // Left shoulder
    {"BTN_TR", BTN_TR}, // Right shoulder
    {"BTN_START", BTN_START},
    {"BTN_SELECT", BTN_SELECT},
    {"BTN_MODE", BTN_MODE},
    {"BTN_THUMBL", BTN_THUMBL},
    {"BTN_THUMBR", BTN_THUMBR},
};

struct Config
{
    std::string host = "localhost";
    int port = 8000;
    std::string ip_version = "auto"; // "4", "6", or "auto"
    bool secure = false;
    std::string group_id;
    std::string device_name;
    std::map<std::string, std::map<std::string, std::string>> keybind_presets;
};

class UInputController
{
public:
    UInputController()
    {
        // Open the uinput device
        fd_ = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
        if (fd_ < 0)
        {
            throw std::runtime_error("Cannot open /dev/uinput. Make sure you have permissions or run as root.");
        }

        // Enable all the button events we want to support
        if (ioctl(fd_, UI_SET_EVBIT, EV_KEY) < 0)
        {
            throw std::runtime_error("Failed to set EV_KEY");
        }

        for (const auto &[name, code] : SEMANTIC_TO_UINPUT)
        {
            if (ioctl(fd_, UI_SET_KEYBIT, code) < 0)
            {
                std::cerr << "Warning: Failed to set key bit for " << name << std::endl;
            }
        }

        // Set up the device
        struct uinput_setup usetup = {};
        usetup.id.bustype = BUS_USB;
        usetup.id.vendor = 0x045e;  // Microsoft vendor ID
        usetup.id.product = 0x028e; // Xbox 360 controller product ID
        usetup.id.version = 1;
        strcpy(usetup.name, "Virtual Microsoft X-Box 360 Controller");

        if (ioctl(fd_, UI_DEV_SETUP, &usetup) < 0)
        {
            throw std::runtime_error("Failed to setup uinput device");
        }

        // Create the device
        if (ioctl(fd_, UI_DEV_CREATE) < 0)
        {
            throw std::runtime_error("Failed to create uinput device");
        }

        std::cout << "[INFO] Virtual gamepad created successfully" << std::endl;

        // Print available buttons
        std::cout << "[INFO] Available buttons: ";
        bool first = true;
        for (const auto &[name, code] : SEMANTIC_TO_UINPUT)
        {
            if (!first)
                std::cout << ", ";
            std::cout << name;
            first = false;
        }
        std::cout << std::endl;
    }

    ~UInputController()
    {
        if (fd_ >= 0)
        {
            ioctl(fd_, UI_DEV_DESTROY);
            close(fd_);
        }
    }

    void emit(const std::string &button_name, int state)
    {
        auto it = SEMANTIC_TO_UINPUT.find(button_name);
        if (it == SEMANTIC_TO_UINPUT.end())
        {
            std::cout << "[WARN] Unknown button: " << button_name << std::endl;
            return;
        }

        struct input_event ev = {};
        ev.type = EV_KEY;
        ev.code = it->second;
        ev.value = state;

        if (write(fd_, &ev, sizeof(ev)) != sizeof(ev))
        {
            std::cerr << "[ERROR] Failed to write button event" << std::endl;
            return;
        }

        // Send sync event
        ev.type = EV_SYN;
        ev.code = SYN_REPORT;
        ev.value = 0;
        if (write(fd_, &ev, sizeof(ev)) != sizeof(ev))
        {
            std::cerr << "[ERROR] Failed to write sync event" << std::endl;
            return;
        }

        std::cout << "Emitted: " << button_name << " -> " << state << std::endl;
    }

private:
    int fd_ = -1;
};

Config load_config(const std::string &settings_file, const po::variables_map &vm)
{
    Config config;

    // Load from YAML file if it exists
    if (fs::exists(settings_file))
    {
        try
        {
            YAML::Node yaml_config = YAML::LoadFile(settings_file);

            if (yaml_config["host"])
            {
                config.host = yaml_config["host"].as<std::string>();
            }
            if (yaml_config["port"])
            {
                config.port = yaml_config["port"].as<int>();
            }
            if (yaml_config["ip_version"])
            {
                config.ip_version = yaml_config["ip_version"].as<std::string>();
            }
            if (yaml_config["secure"])
            {
                config.secure = yaml_config["secure"].as<bool>();
            }
            if (yaml_config["group"])
            {
                config.group_id = yaml_config["group"].as<std::string>();
            }
            if (yaml_config["name"])
            {
                config.device_name = yaml_config["name"].as<std::string>();
            }
            if (yaml_config["keybind_presets"])
            {
                for (auto preset : yaml_config["keybind_presets"])
                {
                    std::string preset_name = preset.first.as<std::string>();
                    std::map<std::string, std::string> bindings;
                    for (auto binding : preset.second)
                    {
                        bindings[binding.first.as<std::string>()] = binding.second.as<std::string>();
                    }
                    config.keybind_presets[preset_name] = bindings;
                }
            }

            std::cout << "Loaded configuration from: " << settings_file << std::endl;
        }
        catch (const YAML::Exception &e)
        {
            std::cerr << "Error parsing YAML file: " << e.what() << std::endl;
            throw;
        }
    }
    else if (settings_file != "settings.yaml")
    {
        // Only throw if non-default settings file was specified
        throw std::runtime_error("Settings file not found: " + settings_file);
    }

    // Override with command-line arguments
    if (vm.count("host"))
    {
        config.host = vm["host"].as<std::string>();
    }
    if (vm.count("port"))
    {
        config.port = vm["port"].as<int>();
    }
    if (vm.count("ip-version"))
    {
        config.ip_version = vm["ip-version"].as<std::string>();
    }
    if (vm.count("secure") && vm["secure"].as<bool>())
    {
        config.secure = vm["secure"].as<bool>();
    }
    if (vm.count("group"))
    {
        config.group_id = vm["group"].as<std::string>();
    }
    if (vm.count("name"))
    {
        config.device_name = vm["name"].as<std::string>();
    }

    // Validate required fields
    if (config.group_id.empty())
    {
        throw std::runtime_error("Group ID is required (either via --group or settings file)");
    }

    // Convert ip_version to lowercase for consistency
    std::transform(config.ip_version.begin(), config.ip_version.end(),
                   config.ip_version.begin(), ::tolower);

    return config;
}

std::string url_encode(const std::string &value)
{
    std::string encoded;
    for (char c : value)
    {
        if (c == ' ')
        {
            encoded += "%20";
        }
        else if (std::isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~')
        {
            encoded += c;
        }
        else
        {
            char hex[4];
            snprintf(hex, sizeof(hex), "%%%02X", static_cast<unsigned char>(c));
            encoded += hex;
        }
    }
    return encoded;
}

std::string build_websocket_path(const Config &config)
{
    std::string path = "/ws/output?group_id=" + url_encode(config.group_id);
    if (!config.device_name.empty())
    {
        path += "&name=" + url_encode(config.device_name);
    }
    return path;
}

std::vector<tcp::endpoint> resolve_with_ip_preference(
    tcp::resolver &resolver,
    const std::string &host,
    const std::string &port,
    const std::string &ip_version)
{
    auto all_results = resolver.resolve(host, port);
    std::vector<tcp::endpoint> endpoints;

    if (ip_version == "6")
    {
        // IPv6 only
        for (auto const &result : all_results)
        {
            if (result.endpoint().address().is_v6())
            {
                endpoints.push_back(result.endpoint());
                std::cout << "Using IPv6: " << result.endpoint() << std::endl;
            }
        }
    }
    else if (ip_version == "4")
    {
        // IPv4 only
        for (auto const &result : all_results)
        {
            if (result.endpoint().address().is_v4())
            {
                endpoints.push_back(result.endpoint());
                std::cout << "Using IPv4: " << result.endpoint() << std::endl;
            }
        }
    }
    else
    {
        // Auto: Try IPv6 first, then IPv4 (matching Python behavior)
        for (auto const &result : all_results)
        {
            if (result.endpoint().address().is_v6())
            {
                endpoints.push_back(result.endpoint());
                std::cout << "Will try IPv6: " << result.endpoint() << std::endl;
            }
        }
        for (auto const &result : all_results)
        {
            if (result.endpoint().address().is_v4())
            {
                endpoints.push_back(result.endpoint());
                std::cout << "Will try IPv4: " << result.endpoint() << std::endl;
            }
        }
    }

    if (endpoints.empty())
    {
        throw std::runtime_error("No suitable addresses found for IP version: " + ip_version);
    }

    return endpoints;
}

template <typename WebSocketStream>
std::pair<std::string, std::string> handle_initial_message(WebSocketStream &ws, const Config &config)
{
    beast::flat_buffer buffer;
    ws.read(buffer);

    std::string message = beast::buffers_to_string(buffer.data());
    std::cout << "Received initial message: " << message << std::endl;

    // Parse the initial config message
    try
    {
        auto json_data = json::parse(message);
        auto obj = json_data.as_object();

        if (obj.at("type").as_string() != "config")
        {
            throw std::runtime_error("Unexpected initial message type");
        }

        std::string device_name = obj.at("output_device_name").as_string().c_str();
        std::string device_id = obj.at("output_device_id").as_string().c_str();
        std::string group_id = obj.at("group_id").as_string().c_str();

        std::cout << "[INFO] Connected as output " << device_name
                  << " (" << device_id << ") in group " << group_id << std::endl;

        // Build HTTP URL for user info
        std::string http_scheme = config.secure ? "https" : "http";
        std::string http_url = http_scheme + "://" + config.host + ":" + std::to_string(config.port);
        std::cout << "[INFO] Open " << http_url << "/?group_id=" << group_id
                  << " to join group " << group_id << std::endl;

        // Send keybind presets if we have any
        if (!config.keybind_presets.empty())
        {
            json::object keybind_msg;
            keybind_msg["type"] = "set_keybind_presets";

            json::object presets;
            for (const auto &[preset_name, bindings] : config.keybind_presets)
            {
                json::object preset_bindings;
                for (const auto &[key, value] : bindings)
                {
                    preset_bindings[key] = value;
                }
                presets[preset_name] = preset_bindings;
            }
            keybind_msg["keybind_presets"] = presets;

            std::string keybind_str = json::serialize(keybind_msg);
            ws.write(net::buffer(keybind_str));
            std::cout << "Sent keybind presets" << std::endl;
        }

        return {device_name, group_id};
    }
    catch (const std::exception &e)
    {
        throw std::runtime_error("Failed to parse initial message: " + std::string(e.what()));
    }
}

template <typename WebSocketStream>
bool handle_message(WebSocketStream &ws, const std::string &message, UInputController &controller)
{
    try
    {
        auto json_data = json::parse(message);
        auto obj = json_data.as_object();
        std::string msg_type = obj.at("type").as_string().c_str();

        if (msg_type == "key_event")
        {
            std::string code = obj.at("code").as_string().c_str();
            int state = static_cast<int>(obj.at("state").as_int64());
            controller.emit(code, state);
        }
        else if (msg_type == "rename_output")
        {
            std::string new_name = obj.at("name").as_string().c_str();
            std::cout << "[INFO] Output device renamed to: " << new_name << std::endl;
        }
        else
        {
            std::cout << "[DEBUG] Unknown message type: " << msg_type << std::endl;
        }

        return true;
    }
    catch (const std::exception &e)
    {
        std::cout << "[WARN] Failed to parse message: " << e.what() << std::endl;
        std::cout << "[WARN] Raw message: " << message << std::endl;
        return true; // Continue processing other messages
    }
}

template <typename WebSocketStream>
std::pair<std::string, std::string> connect_once(
    WebSocketStream &ws,
    const Config &config,
    UInputController &controller,
    const tcp::endpoint &endpoint,
    const std::string &target)
{
    // Connect
    beast::error_code ec;
    if constexpr (std::is_same_v<WebSocketStream, websocket::stream<beast::ssl_stream<tcp::socket>>>)
    {
        beast::get_lowest_layer(ws).connect(endpoint, ec);
    }
    else
    {
        beast::get_lowest_layer(ws).connect(endpoint, ec);
    }

    if (ec)
    {
        throw beast::system_error{ec};
    }

    // Set User-Agent
    ws.set_option(websocket::stream_base::decorator(
        [](websocket::request_type &req)
        {
            req.set(http::field::user_agent, "C++ WebSocket Output Client");
        }));

    // SSL handshake if needed
    if constexpr (std::is_same_v<WebSocketStream, websocket::stream<beast::ssl_stream<tcp::socket>>>)
    {
        ws.next_layer().handshake(ssl::stream_base::client);
    }

    // WebSocket handshake
    std::string host_port = config.host + ':' + std::to_string(endpoint.port());
    ws.handshake(host_port, target);

    // Handle initial setup
    auto [device_name, group_id] = handle_initial_message(ws, config);

    // Message loop
    while (!stop_requested.load())
    {
        try
        {
            beast::flat_buffer buffer;

            // Use async read with timeout
            ws.read(buffer);

            std::string message = beast::buffers_to_string(buffer.data());
            std::cout << "Received: " << message << std::endl;

            if (!handle_message(ws, message, controller))
            {
                break;
            }

            buffer.consume(buffer.size());
        }
        catch (beast::system_error const &se)
        {
            if (se.code() == websocket::error::closed)
            {
                if (stop_requested.load())
                {
                    break;
                }
                std::cout << "[WARN] Connection to server lost. Will reconnect..." << std::endl;
                throw std::runtime_error("Connection closed");
            }
            else
            {
                throw;
            }
        }
    }

    return {device_name, group_id};
}

void start_output_client(const Config &config)
{
    UInputController controller;

    std::string http_scheme = config.secure ? "https" : "http";
    std::string ws_scheme = config.secure ? "wss" : "ws";
    std::string target = build_websocket_path(config);

    std::cout << "WebSocket target: " << ws_scheme << "://" << config.host
              << ":" << config.port << target << std::endl;

    net::io_context ioc;
    tcp::resolver resolver{ioc};

    // Reconnection loop
    while (!stop_requested.load())
    {
        try
        {
            // Resolve addresses
            std::string port_str = std::to_string(config.port);
            auto endpoints = resolve_with_ip_preference(resolver, config.host, port_str, config.ip_version);

            bool connected = false;

            // Try each endpoint
            for (const auto &endpoint : endpoints)
            {
                if (stop_requested.load())
                    break;

                std::cout << "Trying " << (endpoint.address().is_v6() ? "IPv6" : "IPv4")
                          << " endpoint: " << endpoint << std::endl;

                try
                {
                    if (config.secure)
                    {
                        ssl::context ctx{ssl::context::tlsv12_client};
                        ctx.set_verify_mode(ssl::verify_none);

                        websocket::stream<beast::ssl_stream<tcp::socket>> ws{ioc, ctx};

                        // Set SNI
                        if (!SSL_set_tlsext_host_name(ws.next_layer().native_handle(), config.host.c_str()))
                        {
                            beast::error_code ec{static_cast<int>(::ERR_get_error()), net::error::get_ssl_category()};
                            throw beast::system_error{ec};
                        }

                        connect_once(ws, config, controller, endpoint, target);
                    }
                    else
                    {
                        websocket::stream<tcp::socket> ws{ioc};
                        connect_once(ws, config, controller, endpoint, target);
                    }

                    connected = true;
                    break;
                }
                catch (const std::exception &e)
                {
                    std::string ip_type = endpoint.address().is_v6() ? "IPv6" : "IPv4";
                    std::cout << "[WARN] Connection attempt with " << ip_type << " failed: " << e.what() << std::endl;
                    continue;
                }
            }

            if (!connected && !stop_requested.load())
            {
                std::cout << "[WARN] All connection attempts failed. Retrying in 3 seconds..." << std::endl;
            }
        }
        catch (const std::exception &e)
        {
            std::cout << "[ERROR] Connection error: " << e.what() << std::endl;
        }

        if (!stop_requested.load())
        {
            std::this_thread::sleep_for(std::chrono::seconds(3));
        }
    }
}

void handle_signal(int signal)
{
    std::cout << "\n[INFO] Shutting down... (signal " << signal << ")" << std::endl;
    stop_requested.store(true);
}

int main(int argc, char **argv)
{
    try
    {
        // Set up signal handling
        signal(SIGINT, handle_signal);
        signal(SIGTERM, handle_signal);

        // Command line argument parsing
        po::options_description desc("WebSocket Output Client Options");
        desc.add_options()("help,h", "Show help message")("settings", po::value<std::string>()->default_value("settings.yaml"),
                                                          "YAML settings file")("host", po::value<std::string>(), "Server hostname")("port", po::value<int>(), "Server port")("ip-version", po::value<std::string>(), "Force IP version (4, 6, auto)")("secure", po::bool_switch(), "Use HTTPS/WSS")("group", po::value<std::string>(), "Group ID to join")("name", po::value<std::string>(), "Output device display name");

        po::variables_map vm;
        po::store(po::parse_command_line(argc, argv, desc), vm);
        po::notify(vm);

        if (vm.count("help"))
        {
            std::cout << desc << std::endl;
            std::cout << "\nNote: This program requires access to /dev/uinput." << std::endl;
            std::cout << "You may need to run as root or add your user to the 'input' group." << std::endl;
            return 0;
        }

        // Load configuration
        std::string settings_file = vm["settings"].as<std::string>();
        Config config = load_config(settings_file, vm);

        // Print final configuration
        std::cout << "Configuration:" << std::endl;
        std::cout << "  Host: " << config.host << std::endl;
        std::cout << "  Port: " << config.port << std::endl;
        std::cout << "  IP Version: " << config.ip_version << std::endl;
        std::cout << "  Secure: " << (config.secure ? "true" : "false") << std::endl;
        std::cout << "  Group ID: " << config.group_id << std::endl;
        std::cout << "  Device Name: " << (config.device_name.empty() ? "(auto)" : config.device_name) << std::endl;
        std::cout << "  Keybind Presets: " << config.keybind_presets.size() << std::endl;

        // Start the client
        start_output_client(config);

        std::cout << "[INFO] Client shutdown complete" << std::endl;
    }
    catch (std::exception const &e)
    {
        std::cerr << "Error: " << e.what() << std::endl;
        return EXIT_FAILURE;
    }
    return EXIT_SUCCESS;
}