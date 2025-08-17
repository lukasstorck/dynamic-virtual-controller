import argparse
import asyncio
import json
import pathlib
import signal
import socket
import uinput
import urllib.parse
import websockets
import yaml

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


async def connect_once(
    connection_uri: str,
    family: int,
    controller: UInputController,
    http_url: str,
    group_id: str,
    keybind_presets: dict,
):
    async with websockets.connect(connection_uri, family=family, open_timeout=2) as websocket:
        global global_websocket
        global_websocket = websocket

        initial_message = await websocket.recv()
        data: dict[str, str] = json.loads(initial_message)

        if data.get('type') != 'config':
            raise ConnectionAbortedError(f'Unexpected initial message: {data}')

        device_name = data.get('output_device_name')
        device_id = data.get('output_device_id')
        group_id = data.get('group_id')
        print(f'[INFO] Connected as output {device_name} ({device_id}) in group {group_id}')
        print(f'[INFO] Available buttons: {", ".join(SEMANTIC_TO_UINPUT.keys())}')
        print(f'[INFO] Open {http_url}/?group_id={group_id} to join group {group_id}')

        await websocket.send(json.dumps({
            'type': 'set_keybind_presets',
            'keybind_presets': keybind_presets,
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
        return group_id, device_name


async def start_output_client(
    server_host: str,
    server_port: int,
    ip_version: str,
    secure: bool,
    group_id: str,
    device_name: str | None,
    keybind_presets: dict[str, dict[str, str]],
):
    http_scheme = 'https' if secure else 'http'
    ws_scheme = 'wss' if secure else 'ws'

    http_url = f'{http_scheme}://{server_host}:{server_port}'
    ws_url = f'{ws_scheme}://{server_host}:{server_port}/ws/output'

    controller = UInputController()

    families_to_try = []
    if ip_version == '6':
        families_to_try = [socket.AF_INET6]
    elif ip_version == '4':
        families_to_try = [socket.AF_INET]
    else:  # auto
        families_to_try = [socket.AF_INET6, socket.AF_INET]

    # reconnect loop
    while not stop_event.is_set():
        connection_uri = ws_url
        parameters = []
        if group_id:
            parameters.append(f'group_id={urllib.parse.quote_plus(group_id)}')
        if device_name:
            parameters.append(f'name={urllib.parse.quote_plus(device_name)}')
        if parameters:
            connection_uri += '?' + '&'.join(parameters)

        success = False
        for family in families_to_try:
            try:
                group_id, device_name = await connect_once(connection_uri, family, controller, http_url, group_id, keybind_presets)
                success = True
            except (ConnectionAbortedError, ConnectionRefusedError, OSError) as error:
                print(f'[WARN] Connection attempt with {"IPv6" if family == socket.AF_INET6 else "IPv4"} failed: {error}')
                continue

            if success:
                break

        if not success:
            print('[WARN] All connection attempts failed. Retrying in 3 seconds...')

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
    parser.add_argument('--settings', default='settings.yaml', help='YAML settings file')
    parser.add_argument('--host', help='Server hostname')
    parser.add_argument('--port', type=int, help='Server port')
    parser.add_argument('--ip-version', choices=['4', '6', 'auto'], help='Force IP version (default: auto)')
    parser.add_argument('--secure', action='store_true', help='Use HTTPS/WSS')
    parser.add_argument('--group', help='Group ID to join')
    parser.add_argument('--name', help='Output device display name')
    args = parser.parse_args()

    config = {}
    if args.settings:
        settings_path = pathlib.Path(args.settings)
        if settings_path.is_file():
            with settings_path.open() as file:
                config = yaml.safe_load(file) or {}

    host = args.host or config.get('host', 'localhost')
    port = args.port or config.get('port', 8000)
    ip_version = args.ip_version or str(config.get('ip_version', 'auto')).lower()
    secure = args.secure or config.get('secure', False)
    group_id = args.group or config.get('group', '')
    device_name = args.name or config.get('name', None)
    keybind_presets = config.get('keybind_presets', {'default': {}})

    loop = asyncio.new_event_loop()
    for signal_type in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signal_type, handle_sigint)

    try:
        loop.run_until_complete(start_output_client(
            server_host=host,
            server_port=port,
            ip_version=ip_version,
            secure=secure,
            group_id=group_id,
            device_name=device_name,
            keybind_presets=keybind_presets,
        ))
    finally:
        loop.close()
