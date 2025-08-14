import asyncio
import json
import argparse
import uinput
import websockets

# Map button names from semantic codes to uinput codes
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
    """Wrapper around uinput to send virtual gamepad events."""

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


async def start_output_client(
    server_host: str,
    server_port: int,
    secure: bool,
    group_id: str,
    name: str | None
):
    scheme_http = "https" if secure else "http"
    scheme_ws = "wss" if secure else "ws"

    server_http = f"{scheme_http}://{server_host}:{server_port}"
    server_ws = f"{scheme_ws}://{server_host}:{server_port}/ws/output"

    uri = f"{server_ws}?group_id={group_id}"
    if name:
        uri += f"&name={name}"

    async with websockets.connect(uri) as ws:
        # First message should be the config from server
        message = await ws.recv()
        data: dict[str, str] = json.loads(message)
        if data.get("type") != "config":
            print("Unexpected initial message:", data)
        print(f"Connected as output {data['output_device_name']} in group {data['group_id']}")
        print(f"Available buttons: {', '.join(SEMANTIC_TO_UINPUT.keys())}")
        print(f"Open {server_http}/?group-id={group_id} to join group {group_id}")

        ui = UInputController()

        try:
            while True:
                message = await ws.recv()
                data = json.loads(message)
                if data.get("type") == "key_event":
                    ui.emit(data.get("code"), int(data.get("state", 0)))

                elif data.get("type") == "rename_output":
                    # Server tells us our name changed
                    print(f"[INFO] Output device renamed to: {data.get('name')}")

        except websockets.ConnectionClosed:
            print("Disconnected from server.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="localhost", help="Server hostname")
    parser.add_argument("--port", type=int, default=8000, help="Server port")
    parser.add_argument("--secure", action="store_true", help="Use HTTPS/WSS")
    parser.add_argument("--group", required=True, help="Group ID to join")
    parser.add_argument("--name", help="Output device display name", default=None)
    args = parser.parse_args()

    asyncio.run(start_output_client(
        server_host=args.host,
        server_port=args.port,
        secure=args.secure,
        group_id=args.group,
        name=args.name
    ))
