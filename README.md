# Dynamic Virtual Controller

Dynamic Virtual Controller (DVC) is a tool to connect users (e.g. on a browser) via a server to virtual output devices (e.g. a virtual X-Box Controller).
This allows Coop Gameplay over the internet with a variaty of features:

- private groups via secret shared group ID
- many-to-many connections between users and virtual output devices
- emulate multiple virtual devices
- toggle device connection per user individually
- user names and colors
- user settings are saved locally in browser
- device names and keybind presets
- custom keybind editor
- switch between output devices via hotkeys
- activity and ping monitoring for users and devices
- free and open-source software (The Unlicense)


## Usage

- configure output devices in `src/output_client/python/settings.yaml`
- start output devices with `python src/output_client/python/output_client.py --settings src/output_client/python/settings.yaml`
  - this only works on Linux based systems, as Windows does not easily allow creating virtual devices
- connect to web UI and active a device
- now keybinds that match the preset are translated and sent to the output device, which simulates the output events on a virtual device


### Requirements

|     User      |                Server                |                                                      Output Client (Devices)                                                      |
| :-----------: | :----------------------------------: | :-------------------------------------------------------------------------------------------------------------------------------: |
| a web browser |            Docker Compose            |                                                              python                                                               |
|               |        git (clone this repo)         |                                            modern Linux distro with access to `uinput`                                            |
|               | <small>probably some friends</small> | [output client script](./src/output_client/python/output_client.py) and [settings file](./src/output_client/python/settings.yaml) |


I suggest to add the user that runs the output client to the `input` group instead of running the [output client script](./src/output_client/python/output_client.py) as root:
```bash
sudo usermod -aG input $USER
```

### Installation (Server)

- install [*docker compose*](https://docs.docker.com/compose/install/)
- clone this repository with git
- run `docker compose up -d`
- go to the [web UI](http://localhost:8000)


## Implementation

There are three compoenents to this project
- the **web UI** (React, TS), which is a simple interface for the user to join groups, configure their devices and keybinds,
- the **output clients** (Python), which emulate virtual devices, receive output event commands and emit these events on the created devices, and
- the **server** (Python), which manages the connections and messages between users and output clients.

The server provides two websocket endpoints via `FastAPI`, `/ws/user` for the user web client and `/ws/output` output client to connect to.
Both users and output clients are identified via an ID that is prefixed with `user_` or `output_`.
While a user connection can only contain one user, one output client connection can facilitate multiple devices.
All further communcation and data exchange is handled via websocket messages on the established connection.

All messages are stateless and at least on the user client side are supposed to work asynchornously (even when they are mostly handled synchronously by implementation).
The server organizes users and created devices in groups, where each user and device can only be assigned to one group at the same time.
The groups are identified by their group ID, which should be handled as a secret as it is also the only credential needed to join and subsequentially receive all data pertaining to that group.
While the server regulates some actions of the clients (like verifying non-empty names, non-contrast-rich colors, or user-device-group membership for sent key events), it is mostly just a mediator and used to store the group state (e.g. keybind mapping is fully handled by the web UI and only output events for the virtual output device are sent to the server).

Each user has the following properties

|         User Attribute (Type)          | Description                                           |
| :------------------------------------: | ----------------------------------------------------- |
|                id: str                 | identification                                        |
|      websocket: fastapi.WebSocket      | associated websocket for communication to user client |
|               name: str                | visual representation                                 |
|               color: str               | visual representation                                 |
|       last_acticity_time: float        | Unix timestamp of last change of keypress             |
| connected_devices_ids: dict[str, bool] | ids of devices selected as active by user             |
|           pings: list[float]           | recent ping measurements                              |

Note that the group_id and group association is currently not part of the user object, but is handled in combination with the user unique websocket connection.

Each device has the following properties

|               User Attribute (Type)               | Description                                                                                                                                   |
| :-----------------------------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------- |
|                      id: str                      | identification                                                                                                                                |
|                   group_id: str                   | id of associated group                                                                                                                        |
|           websocket: fastapi.WebSocket            | associated websocket for communication to output client                                                                                       |
|                     name: str                     | visual representation                                                                                                                         |
|                     slot: int                     | in the web UI devices are associated via their slot number to more easily transfer configurations in case of unstable or changing connections |
| keybind_presets: dict[str, list[tuple[str, str]]] | map of list of default keybinds                                                                                                               |
|             allowed_events: set[str]              | list of output event identifiers that are allowed on this device                                                                              |
|                pings: list[float]                 | recent ping measurements                                                                                                                      |

Each group has the following properties

|          User Attribute (Type)          | Description                                             |
| :-------------------------------------: | ------------------------------------------------------- |
|                 id: str                 | identification                                          |
|         users: dict[str, User]          | id of connected group                                   |
| output_devices: dict[str, OutputDevice] | associated websocket for communication to output client |

The following messages are recognized between the server and clients.
When a message that changes group information on the server, the associated user clients are usually updated directly with a `group_state` update message to propagate the information.
When a user is not connected to a group, only the user is updated with the `config` message.
Another exception are `ping` and `acitivity_and_ping` messages, which are sent asynchronously and periodically to the clients.

| Message Type        | Data                                                                           | Source        | Description                                                                         |
| ------------------- | ------------------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------- |
| `config`            | `user_id`, (`user_name`, `user_color`)                                         | server        | provide (updated) configuration data to user client                                 |
| `group_state`       | `group_id`, `users`, `devices`                                                 | server        | updated group state broadcast to all users in a group                               |
| `activity_and_ping` | `users`, `devices`                                                             | server        | updated activity timestamps and ping stats                                          |
| `ping`              | `id`                                                                           | server        | initial message for ping measurement                                                |
| `pong`              | `id`                                                                           | clients       | response to `ping` to measure latency                                               |
| `update_user_data`  | `name`, `color`                                                                | user client   | update user name or color                                                           |
| `join_group`        | `group_id`                                                                     | user client   | user joins (and creates) specified group                                            |
| `leave_group`       | -                                                                              | user client   | user leaves current group                                                           |
| `select_output`     | `id`, `state`                                                                  | user client   | user selects/deselects an output device                                             |
| `keypress`          | `device_id`, `code`, `state`                                                   | user client   | user issues key event to server                                                     |
| `key_event`         | `device_id`, `user_id`, `code`, `state`                                        | server        | relayed key event message to the output client                                      |
| `rename_output`     | `id`, `name`                                                                   | user client   | user renames an output device                                                       |
| `rename_output`     | `device_id`, `name`                                                            | server        | relayed output device rename message to the output client                           |
| `register_device`   | `temporary_id`, `device_name`, `group_id`, `allowed_events`, `keybind_presets` | output client | output client registers a new device                                                |
| `device_registered` | `device_id`, `temporary_id`, `group_id`, `slot`                                | server        | confirmation of device registration and updated configuration data to output client |


### Does this work on Windows?

Yes and no. As a user (input client) you can connect to the server and host the server from/on a Windows device, but you can not attach any virtual devices with the given [python script](./src/output_client/python/output_client.py).
The latter only works on Linux-based systems, which allow the user to create virtual devices more easily.

As far as I know, on Windows, to create a new virtual device you need a kernel driver to interact with XInput and there is also no official API for XInput to create new devices.
There are other projects like [ViGEm Bus Driver](https://vigembusdriver.com/) or [vJoy](https://sourceforge.net/projects/vjoystick/) [(newer version)](https://github.com/BrunnerInnovation/vJoy) that do exactly this for specific virtual devices.
However, I will not write anything that goes into other peoples kernels.
It might be possible to implement an output client for Windows that can send output events for existing physical devices as this should be possible without kernel level access.
But I do not have any ambition for the near future to further explore this, especially since this would only provide a subset of the original functionality.


### Known Bugs

- Sometimes, the first connection attempt to the server over the internet is slow.
  This then fails by timeout and on the second try it succeeds immediately.
  It does not seem to happen locally or after reloading the page shortly it previously succeeding.
- When selecting "Browser" as the target device for a custom keybind, the selectable options for the output event are not directly updated and default to the placeholder option.
  This only seems to happen when the placeholder for the target device/slot was previously selected (or selected by default). A workaround is to first select another device, if there are devices conneted.


### ToDos and Backlog

- clean up the implementation for device switching hotkeys
  - no custom string building and parsing for "Browser" event list and hotkey event handeling -> use object with device slot and action fields
- refactor users and devices variables in WebSocketIncomingMessage and GroupUpdateAction to include named fields instead of tuples for ease of understanding
- improve mobile UI (keybind editor)
- expand allowed keys
- check server side async lock on group operations (for edits / look ups of users and devices)
- add new device types (gamepad sticks, joystick, keyboard, midi)
- add new device for output client over web ui
  - change device settings (device type, vendor id, product id, ...) over web ui (based on permissions)
