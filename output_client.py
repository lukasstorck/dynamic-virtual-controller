"""
Python output client that connects to server /ws/output and receives
key events to emit via python-uinput.

Usage:
  python output_client.py              # create a new controller, server will return controller_id
  python output_client.py --id <id>    # claim an existing controller (reconnect)
"""

import asyncio
import json
import argparse
import uinput
import websockets

# All supported semantic names mapped to uinput constants
SEMANTIC_TO_UINPUT = {
    "BTN_DPAD_UP": uinput.BTN_DPAD_UP,
    "BTN_DPAD_DOWN": uinput.BTN_DPAD_DOWN,
    "BTN_DPAD_LEFT": uinput.BTN_DPAD_LEFT,
    "BTN_DPAD_RIGHT": uinput.BTN_DPAD_RIGHT,
    "BTN_A": uinput.BTN_A,
    "BTN_B": uinput.BTN_B,
    "BTN_X": uinput.BTN_X,
    "BTN_Y": uinput.BTN_Y,
    "BTN_TL": uinput.BTN_TL,
    "BTN_TR": uinput.BTN_TR,
    "BTN_START": uinput.BTN_START,
}

SERVER_WS = "ws://localhost:8000/ws/output"


class UInputController:
    def __init__(self):
        """Create a uinput device with all supported button events."""
        self.device = uinput.Device(
            events=tuple(SEMANTIC_TO_UINPUT.values()),
            name="Virtual Microsoft X-Box 360 Controller"
        )

    def emit(self, button_name: str, state: int):
        """Emit a uinput event for the given button name and state."""
        uev = SEMANTIC_TO_UINPUT.get(button_name)
        if not uev:
            print(f"[WARN] Unknown button: {button_name}")
            return
        self.device.emit(uev, state)
        print(f"Emitted: {button_name} -> {state}")


async def run(controller_id: str | None):
    uri = SERVER_WS
    if controller_id:
        uri += f"?controller_id={controller_id}"
    print(f"Connecting to {uri}")

    async with websockets.connect(uri) as ws:
        # Wait for config
        msg = await ws.recv()
        data = json.loads(msg)
        if data.get("type") != "config":
            print("Unexpected initial message:", data)

        controller_id = data["controller_id"]
        join_url = data["join_url"]
        last_states = data.get("last_states", {})
        name = data.get("name", f"Controller-{controller_id}")

        print(f"Connected as output for controller {controller_id} (name={name})")
        print("Join URL:", join_url)

        # Create uinput device
        ui = UInputController()

        # Restore last states (press held buttons)
        for btn_name, state in last_states.items():
            ui.emit(btn_name, state)
        print("Restored last known states.")

        # Listen for events
        try:
            while True:
                msg = await ws.recv()
                data = json.loads(msg)
                message_type = data.get("type")

                if message_type == "key_event":
                    btn_name = data.get("code")
                    state = int(data.get("state", 0))
                    ui.emit(btn_name, state)

                elif message_type == "restore":
                    last_states = data.get("last_states", {})
                    for btn_name, state in last_states.items():
                        ui.emit(btn_name, state)
                    print("Restore processed.")

                elif message_type == "set_name":
                    name = data.get("name", name)
                    print("Name set to", name)

                # Ignore other message types
        except websockets.ConnectionClosed:
            print("Connection closed - exiting")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", help="controller id to claim/reconnect", default=None)
    args = parser.parse_args()
    asyncio.run(run(args.id))
