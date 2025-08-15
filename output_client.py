import asyncio
import json
import argparse
import uinput
import websockets
import signal

# Mapping semantic button names to uinput codes
SEMANTIC_TO_UINPUT = {
    'BTN_DPAD_UP': uinput.BTN_DPAD_UP,
    'BTN_DPAD_DOWN': uinput.BTN_DPAD_DOWN,
    'BTN_DPAD_LEFT': uinput.BTN_DPAD_LEFT,
    'BTN_DPAD_RIGHT': uinput.BTN_DPAD_RIGHT,
    'BTN_A': uinput.BTN_A,
    'BTN_B': uinput.BTN_B,
    'BTN_X': uinput.BTN_X,
    'BTN_Y': uinput.BTN_Y,
    'BTN_TL': uinput.BTN_TL,
    'BTN_TR': uinput.BTN_TR,
    'BTN_START': uinput.BTN_START,
}

DEFAULT_USER_BUTTON_MAP = {
    'KeyW': 'BTN_DPAD_UP',
    'KeyA': 'BTN_DPAD_LEFT',
    'KeyS': 'BTN_DPAD_DOWN',
    'KeyD': 'BTN_DPAD_RIGHT',
    'KeyE': 'BTN_A',
    'KeyQ': 'BTN_B',
    'KeyX': 'BTN_X',
    'KeyY': 'BTN_Y',
    'Tab': 'BTN_TL',
    'KeyR': 'BTN_TR',
    'Escape': 'BTN_START',
    'Space': 'BTN_A',
    'KeyZ': 'BTN_Y',
    'KeyF': 'BTN_Y',
}


class UInputController:
    '''Handles sending virtual gamepad events via uinput.'''

    def __init__(self):
        self.device = uinput.Device(
            events=tuple(SEMANTIC_TO_UINPUT.values()),
            name='Virtual Microsoft X-Box 360 Controller'
        )

    def emit(self, button_name: str, state: int):
        button_event = SEMANTIC_TO_UINPUT.get(button_name)
        if not button_event:
            print(f'[WARN] Unknown button: {button_name}')
            return
        self.device.emit(button_event, state)
        print(f'Emitted: {button_name} -> {state}')


stop_event = asyncio.Event()
global_websocket: websockets.ClientConnection = None


async def start_output_client(
    server_host: str,
    server_port: int,
    secure: bool,
    group_id: str,
    device_name: str | None
):
    http_scheme = 'https' if secure else 'http'
    ws_scheme = 'wss' if secure else 'ws'

    http_url = f'{http_scheme}://{server_host}:{server_port}'
    ws_url = f'{ws_scheme}://{server_host}:{server_port}/ws/output'

    controller = UInputController()

    # reconnect loop
    while not stop_event.is_set():
        connection_uri = f'{ws_url}?group_id={group_id}'
        if device_name:
            connection_uri += f'&name={device_name}'

        try:
            async with websockets.connect(connection_uri) as websocket:
                global global_websocket
                global_websocket = websocket

                initial_message = await websocket.recv()
                data: dict[str, str] = json.loads(initial_message)

                if data.get('type') != 'config':
                    raise ConnectionAbortedError(f'Unexpected initial message: {data}')

                print(f'[INFO] Connected as output {data["output_device_name"]} in group {data["group_id"]}')
                print(f'[INFO] Available buttons: {", ".join(SEMANTIC_TO_UINPUT.keys())}')
                print(f'[INFO] Open {http_url}/?group-id={group_id} to join group {group_id}')

                await websocket.send(json.dumps({
                    'type': 'button_map',
                    'button_map': DEFAULT_USER_BUTTON_MAP,
                }))

                # message loop
                while not stop_event.is_set():
                    try:
                        message = await websocket.recv()
                        incoming_data: dict = json.loads(message)

                        if incoming_data.get('type') == 'key_event':
                            controller.emit(incoming_data.get('code'), int(incoming_data.get('state', 0)))

                        elif incoming_data.get('type') == 'rename_output':
                            device_name: str = incoming_data.get('name')
                            print(f'[INFO] Output device renamed to: {device_name}')

                    except websockets.ConnectionClosed:
                        if stop_event.is_set():
                            continue
                        print('[WARN] Connection to server lost. Reconnecting...')
                        break

        except (ConnectionAbortedError, ConnectionRefusedError, OSError) as error:
            print(f'[WARN] Server unreachable: {error}. Retrying in 3 seconds...')

        if stop_event.is_set():
            continue
        await asyncio.sleep(3)  # wait before retry


def handle_sigint():
    print('\n[INFO] Shutting down...')
    stop_event.set()
    if global_websocket:
        asyncio.ensure_future(global_websocket.close())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='localhost', help='Server hostname')
    parser.add_argument('--port', type=int, default=8000, help='Server port')
    parser.add_argument('--secure', action='store_true', help='Use HTTPS/WSS')
    parser.add_argument('--group', required=True, help='Group ID to join')
    parser.add_argument('--name', help='Output device display name', default=None)
    args = parser.parse_args()

    loop = asyncio.new_event_loop()
    for signal_type in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signal_type, handle_sigint)

    try:
        loop.run_until_complete(start_output_client(
            server_host=args.host,
            server_port=args.port,
            secure=args.secure,
            group_id=args.group,
            device_name=args.name
        ))
    finally:
        loop.close()
