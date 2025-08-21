import abc
import argparse
import asyncio
import json
import pathlib
import signal
import socket
import uinput
import uuid
import websockets
import yaml


class KeyCodes:
    NAME_TO_EVENT: dict[str, tuple[int, int]] = {
        name: getattr(uinput.ev, name)
        for name in dir(uinput.ev)
        if name.isupper() and not name.startswith('_')
    }

    EVENT_SETS = {
        'CONTROLLER_BUTTONS': frozenset([
            'BTN_DPAD_UP',
            'BTN_DPAD_DOWN',
            'BTN_DPAD_LEFT',
            'BTN_DPAD_RIGHT',
            'BTN_A',
            'BTN_B',
            'BTN_X',
            'BTN_Y',
            'BTN_TL',
            'BTN_TR',
            'BTN_TL2',
            'BTN_TR2',
            'BTN_START',
            'BTN_SELECT',
            'BTN_THUMBL',
            'BTN_THUMBR',
        ]),
        'DPAD_CONTROLLER_BUTTONS': frozenset([
            'BTN_DPAD_UP',
            'BTN_DPAD_DOWN',
            'BTN_DPAD_LEFT',
            'BTN_DPAD_RIGHT',
        ]),
    }

    @classmethod
    def get_event_by_name(cls, name: str):
        return cls.NAME_TO_EVENT[name]

    @classmethod
    def get_event_set_by_name(cls, name: str):
        return cls.EVENT_SETS[name]


class VirtualDevice(abc.ABC):
    def __init__(
            self,
            name: str,
            group_id: str | None,
            allowed_events: set[str],
            keybind_presets: dict[str, dict[str, str]],
    ):
        self.id: str | None = None
        self.name = name
        self.group_id: str | None = group_id
        self.allowed_events: set[str] = set(allowed_events)
        self.keybind_presets: dict[str, dict[str, str]] = keybind_presets
        self.is_connected: bool = False

    @abc.abstractmethod
    def emit(self, event_name: str, value: int | float):
        ...

    def is_event_allowed(self, event_name: str):
        return event_name in self.allowed_events


class UInputDevice(VirtualDevice):
    '''Handles sending virtual gamepad events via uinput.'''

    def __init__(
        self,
        name: str = 'Generic UInput Device',
        group_id: str | None = None,
        allowed_events: set[str] = None,
        keybind_presets: dict[str, dict[str, str]] = None,
        uinput_name: str = 'UInput Device',
        bustype: int = 0,
        vendor: int = 0,
        product: int = 0,
        version: int = 0,
    ):
        if allowed_events is None:
            allowed_events = KeyCodes.get_event_set_by_name('DPAD_CONTROLLER_BUTTONS')

        if keybind_presets is None:
            keybind_presets = {}

        super().__init__(name, group_id, allowed_events, keybind_presets)

        self.device = uinput.Device(
            events=tuple(KeyCodes.get_event_by_name(event) for event in allowed_events),
            name=uinput_name,
            bustype=bustype,
            vendor=vendor,
            product=product,
            version=version,
        )

    def emit(self, event: str, value: int):
        if not self.is_event_allowed(event):
            return

        try:
            uinput_event = KeyCodes.get_event_by_name(event)
        except KeyError:
            print(f'[WARN] Unknown key event: {event}')
            return

        self.device.emit(uinput_event, value)
        print(f'Emitted: {event} -> {value}')


class VirtualXBox360Controller(UInputDevice):
    def __init__(
        self,
        name: str = 'Virtual Xbox 360 Controller',
        group_id: str | None = None,
        allowed_events: set[str] = None,
        keybind_presets: dict[str, dict[str, str]] = None,
    ):
        if allowed_events is None:
            allowed_events = KeyCodes.get_event_set_by_name('CONTROLLER_BUTTONS')

        if keybind_presets is None:
            keybind_presets = {'Space': 'BTN_A'}

        super().__init__(
            name=name,
            group_id=group_id,
            allowed_events=allowed_events,
            keybind_presets=keybind_presets,
            uinput_name='Microsoft X-Box 360 Controller',
            bustype=3,
            vendor=0x045e,
            product=0x028e,
            version=1,
        )


class DeviceManager:
    def __init__(self, keybind_preset_library: dict[str, dict[str, str]]):
        self.keybind_preset_library = keybind_preset_library
        self.device_types: dict[str, type] = {
            'uinput': UInputDevice,
            'xbox360': VirtualXBox360Controller,
        }

        self.device_map: dict[str, VirtualDevice] = {}

    def create_device(self, device_name: str, parameters: dict[str, int | str]):
        if 'device_type' not in parameters:
            raise ValueError(f'Missing parameter device_type for device "{device_name}"')

        device_type = parameters.pop('device_type')
        if device_type not in self.device_types:
            raise ValueError(f'Unknown device type: {device_type}')

        device_class = self.device_types[device_type]

        # Validate parameters
        init_params = device_class.__init__.__code__.co_varnames[1:]  # skip 'self'
        for key in parameters:
            if key not in init_params:
                raise ValueError(f'Unknown parameter "{key}" for device type "{device_type}"')

        device: VirtualDevice = device_class(name=device_name, **parameters)
        return device

    def rename_device(self, device_id: str, new_device_name: str):
        if device_id not in self.device_map:
            raise ValueError(f'Unknown device: {device_id}')
        self.device_map[device_id].name = new_device_name

    def emit(self, device_id: str, event_name: str, value: int | float):
        if device_id not in self.device_map:
            raise ValueError(f'Unknown device: {device_id}')
        self.device_map[device_id].emit(event_name, value)

    def initialize_devices(self, device_config: dict[str, dict[str, str]]):
        for device_name, device_params in device_config.items():
            device_params = device_params.copy()
            presets_names: set[str] = device_params.pop('presets', set())

            # Get presets from library
            presets = {}
            for preset_name in presets_names:
                if preset_name in self.keybind_preset_library:
                    presets[preset_name] = self.keybind_preset_library[preset_name]

            device_params['keybind_presets'] = presets

            device = self.create_device(device_name, device_params)
            device.id = f'temp_{uuid.uuid4().hex}'
            self.device_map[device.id] = device


class ConnectionManager:
    def __init__(self, connection_details: dict[str, str | int | bool], device_manager: DeviceManager):
        host: str = connection_details.get('host', 'localhost')
        port: int = connection_details.get('port', 8000)
        ip_version: int | str = connection_details.get('ip_version', 'auto')
        secure: bool = connection_details.get('secure', False)

        self.websocket_uri = f'ws{"s" if secure else ""}://{host}:{port}/ws/output'
        self.url = f'http{"s" if secure else ""}://{host}:{port}'

        if isinstance(ip_version, str):
            ip_version = ip_version.lower().strip()
        match ip_version:
            case 4 | '4' | 'v4' | 'ipv4':
                self.families_to_try = [socket.AF_INET]
            case 6 | '6' | 'v6' | 'ipv6':
                self.families_to_try = [socket.AF_INET6]
            case 'auto':
                self.families_to_try = [socket.AF_INET6, socket.AF_INET]
            case _:
                raise ValueError(f'Unknown IP version: {ip_version} (use 4, 6, auto)')

        self.device_manager = device_manager
        self.websocket: websockets.ClientConnection | None = None
        self.stop_event = asyncio.Event()

    async def handle_connection(self):
        # Register devices
        for device in self.device_manager.device_map.values():
            if not device.is_connected:
                await self.register_device(device)

        # Message loop
        while not self.stop_event.is_set():
            try:
                message = await self.websocket.recv()
                await self.handle_message(json.loads(message))
            except websockets.ConnectionClosed:
                if self.stop_event.is_set():
                    continue
                print('[WARN] Connection to server lost. Reconnecting...')
                break

        # reset devices
        for device in self.device_manager.device_map.values():
            device.is_connected = False

    async def register_device(self, device: VirtualDevice):
        await self.websocket.send(json.dumps({
            'type': 'register_device',
            'temporary_id': device.id,
            'group_id': device.group_id,
            'device_name': device.name,
            'allowed_events': list(device.allowed_events),
            'keybind_presets': device.keybind_presets,
        }))

    async def handle_message(self, data: dict):
        msg_type = data.get('type')

        if msg_type == 'device_registered':
            device_id = data.get('device_id')
            temporary_id = data.get('temporary_id')
            group_id = data.get('group_id')

            device = self.device_manager.device_map.get(temporary_id)
            if device is None:
                print(f'[WARN] Unknown temporary device id from server: {temporary_id}')
                return

            # Move from temp to real ID and set attribute
            del self.device_manager.device_map[temporary_id]
            device.id = device_id
            device.group_id = group_id
            device.is_connected = True
            self.device_manager.device_map[device_id] = device

            print(f'[INFO] Device registered with ID: {device.id} in group {device.group_id}')
            print(f'[INFO] Open {self.url}/?group_id={device.group_id} to join group {device.group_id}')

        elif msg_type == 'key_event':
            device_id = data.get('device_id')
            event_name = data.get('code')
            value = int(data.get('state', 0))
            try:
                self.device_manager.emit(device_id, event_name, value)
            except ValueError as error:
                print(f'[WARN] {error}')

        elif msg_type == 'rename_output':
            device_id = data.get('device_id')
            new_name = data.get('name')
            try:
                self.device_manager.rename_device(device_id, new_name)
                print(f'[INFO] Output device {device_id} renamed to: {new_name}')
            except ValueError as error:
                print(f'[WARN] {error}')

    async def connect(self):
        # Reconnect loop
        while not self.stop_event.is_set():
            success = False
            for family in self.families_to_try:
                try:
                    async with websockets.connect(self.websocket_uri, family=family, open_timeout=2) as websocket:
                        self.websocket = websocket
                        print(f'[INFO] Connected to server at {self.websocket_uri}')
                        await self.handle_connection()
                    success = True
                    break
                except (ConnectionAbortedError, ConnectionRefusedError, OSError) as error:
                    ip_version = "IPv6" if family == socket.AF_INET6 else "IPv4"
                    print(f'[WARN] Connection attempt with {ip_version} failed: {error}')
                    continue

            if not success:
                print('[WARN] All connection attempts failed. Retrying in 3 seconds...')
                if self.stop_event.is_set():
                    continue
                await asyncio.sleep(3)

    def disconnect(self):
        print('\n[INFO] Shutting down...')
        self.stop_event.set()
        if self.websocket:
            asyncio.create_task(self.websocket.close())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--settings', default='settings.yaml', help='YAML settings file')
    args = parser.parse_args()

    config: dict[str, dict] = {}
    if args.settings:
        settings_path = pathlib.Path(args.settings)
        if settings_path.is_file():
            with settings_path.open() as file:
                config = yaml.safe_load(file) or {}

    connection_details: dict[str] = config.get('connection', {})
    device_config: dict[str, dict] = config.get('devices', {})
    keybind_preset_library = config.get('keybind_preset_library', {})

    device_manager = DeviceManager(keybind_preset_library)
    device_manager.initialize_devices(device_config)
    connection_manager = ConnectionManager(connection_details, device_manager)

    # Set up signal handling
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    for signal_type in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signal_type, connection_manager.disconnect)

    try:
        loop.run_until_complete(connection_manager.connect())
    finally:
        loop.close()
