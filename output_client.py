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

# map the semantic mapping names (server's mapping values) to uinput constants
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
    # you can expand as needed
}

SERVER_WS = "ws://localhost:8000/ws/output"


class UInputController:
    def __init__(self, mapping):
        # mapping: code -> semantic-name (from server). We'll create a uinput.Device with all values used.
        used = set()
        for v in mapping.values():
            if v in SEMANTIC_TO_UINPUT:
                used.add(SEMANTIC_TO_UINPUT[v])
        # if no mapping found, include some sensible defaults to avoid empty events
        if not used:
            used = {uinput.BTN_A, uinput.BTN_B, uinput.BTN_X, uinput.BTN_Y}
        self.device = uinput.Device(events=tuple(used), name="Virtual Microsoft X-Box 360 Controller")
        self.mapping = mapping

    def emit(self, code, state):
        # code is browser code (e.g., "KeyW") ; mapping maps code->semantic label
        semantic = self.mapping.get(code)
        if not semantic:
            # unknown mapping; ignore
            return
        uev = SEMANTIC_TO_UINPUT.get(semantic)
        if not uev:
            return
        self.device.emit(uev, state)


async def run(controller_id: str | None):
    uri = SERVER_WS
    if controller_id:
        uri += f"?controller_id={controller_id}"
    print(f"Connecting to {uri}")
    async with websockets.connect(uri) as ws:
        # wait for config
        msg = await ws.recv()
        data = json.loads(msg)
        if data.get("type") != "config":
            print("Unexpected initial message:", data)
        controller_id = data["controller_id"]
        join_url = data["join_url"]
        mapping = data.get("mapping", {})
        last_states = data.get("last_states", {})
        name = data.get("name", f"Controller-{controller_id}")

        print(f"Connected as output for controller {controller_id} (name={name})")
        print("Join URL:", join_url)

        # create uinput device
        ui = UInputController(mapping=mapping)

        # restore last states (press held buttons)
        for code, state in last_states.items():
            # send as emitted to ensure virtual controller state matches
            ui.emit(code, state)
        print("Restored last known states.")

        # listen for events
        try:
            while True:
                msg = await ws.recv()
                data = json.loads(msg)
                message_type = data.get("type")
                if message_type == "key_event":
                    code = data.get("code")
                    state = int(data.get("state", 0))
                    ui.emit(code, state)
                elif message_type == "map_update":
                    mapping = data.get("mapping", mapping)
                    ui = UInputController(mapping=mapping)
                    print("Mapping updated.")
                elif message_type == "restore":
                    mapping = data.get("mapping", mapping)
                    last_states = data.get("last_states", {})
                    ui = UInputController(mapping=mapping)
                    for code, state in last_states.items():
                        ui.emit(code, state)
                    print("Restore processed.")
                elif message_type == "set_name":
                    name = data.get("name", name)
                    print("Name set to", name)
                else:
                    # ignore or print debug
                    pass
        except websockets.ConnectionClosed:
            print("Connection closed - exiting")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", help="controller id to claim/reconnect", default=None)
    args = parser.parse_args()
    asyncio.run(run(args.id))
