import asyncio
import json
import argparse
import uinput
import websockets


SERVER_HOST = "localhost"
SERVER_PORT = 8000
SECURE = False
SERVER_HTTP = f"http{"s" if SECURE else ""}://{SERVER_HOST}:{SERVER_PORT}"
SERVER_WS = f"ws{"s" if SECURE else ""}://{SERVER_HOST}:{SERVER_PORT}/ws/output"

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


class UInputController:
    def __init__(self):
        self.device = uinput.Device(
            events=tuple(SEMANTIC_TO_UINPUT.values()),
            name="Virtual Microsoft X-Box 360 Controller"
        )

    def emit(self, button_name: str, state: int):
        uev = SEMANTIC_TO_UINPUT.get(button_name)
        if not uev:
            print(f"[WARN] Unknown button: {button_name}")
            return
        self.device.emit(uev, state)
        print(f"Emitted: {button_name} -> {state}")


async def start_server(group_id: str, output_id: str | None):
    uri = f"{SERVER_WS}?group_id={group_id}"
    if output_id:
        uri += f"&output_id={output_id}"
    async with websockets.connect(uri) as ws:
        msg = await ws.recv()
        data: dict[str, str] = json.loads(msg)
        if data.get("type") != "config":
            print("Unexpected initial message:", data)
        print(f"Connected as output {data['output_id']} in group {data['group_id']}")
        print(f'Available buttons: {", ".join(SEMANTIC_TO_UINPUT.keys())}')
        print(f'Open {SERVER_HTTP}/?group_id={group_id} to join group {group_id}')

        ui = UInputController()

        try:
            while True:
                msg = await ws.recv()
                data = json.loads(msg)
                if data.get("type") == "key_event":
                    ui.emit(data.get("code"), int(data.get("state", 0)))
        except websockets.ConnectionClosed:
            print("Disconnected from server.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--group", help="Group ID to join", required=True)
    parser.add_argument("--id", help="Output ID (optional)", default=None)
    args = parser.parse_args()
    asyncio.run(start_server(args.group, args.id))
