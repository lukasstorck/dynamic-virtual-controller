# Dynamic Virtual Controller

Dynamic Virtual Controller (DVC) is a tool to connect users (e.g. on a browser) via a server to virtual output devices (e.g. a virtual X-Box Controller).
This allows Coop Gameplay over the internet with a variaty of features:

- private groups via secret shared group ID
- many-to-many connections between users and virtual output devices
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


## Installation (Server)

- install [*docker compose*](https://docs.docker.com/compose/install/)
- run `docker compose up -d`
- go to the [web UI](http://localhost:8000)


## Implementation


### ToDos

- clean up the implementation for device switching hotkeys
- online joining seems to take very long (unless onreload shortly after joining)
- create dev compose file
  - build with npm and host /build instead
  - remove --reload from production compose file

- backlog:
  - improve mobile UI (keybind editor)
  - expand allowed keys
  - check server side async lock on group operations (for edits / look ups of users and devices)
  - add new device types (gamepad sticks, joystick, keyboard, midi)
  - add new device for output client over web ui
    - change device settings (device type, vendor id, product id, ...) over web ui (based on permissions)
