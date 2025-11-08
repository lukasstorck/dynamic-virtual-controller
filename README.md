# Dynamic Virtual Controller

### TODOs

- reorder imports
- clean up the implementation for device switching hotkeys

- backlog:
  - expand allowed keys
  - check server side async lock on group operations (for edits / look ups of users and devices)
  - add new device types (gamepad sticks, joystick, keyboard, midi)
  - add new device for output client over web ui
    - change device settings (device type, vendor id, product id, ...) over web ui (based on permissions)

### Dev Note
Test websocket connection with `docker run --rm -ti ghcr.io/vi/websocat:nightly "wss://controller.storck.xyz/ws/output?group_id=test&name=Test"`
