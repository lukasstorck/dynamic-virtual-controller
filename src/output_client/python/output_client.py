import abc
import argparse
import asyncio
import json
import logging
import pathlib
import signal
import socket
import uinput
import uuid
import websockets
import yaml


logger = logging.getLogger(__name__)


def setup_logging(level: str = 'INFO'):
    '''Configures the logging system for the entire module.'''
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format='[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )


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
        keybind_presets: dict[str, list[tuple[str, str]]],
    ):
        self.id: str | None = None
        self.name = name
        self.group_id: str | None = group_id
        self.allowed_events: set[str] = set(allowed_events)
        self.keybind_presets: dict[str, list[tuple[str, str]]] = keybind_presets
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
        keybind_presets: dict[str, list[tuple[str, str]]] = None,
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
            self.device.emit(uinput_event, value)
            logger.debug(f'Emitted event {event} -> {value} on device {self.name} ({self.id})')
        except KeyError:
            logger.warning(f'Unknown key event: {event}')
        except Exception:
            logger.exception(f'Failed to emit event {event} -> {value} on {self.name}')


class VirtualXBox360Controller(UInputDevice):
    def __init__(
        self,
        name: str = 'Virtual Xbox 360 Controller',
        group_id: str | None = None,
        allowed_events: set[str] = None,
        keybind_presets: dict[str, list[tuple[str, str]]] = None,
    ):
        if allowed_events is None:
            allowed_events = KeyCodes.get_event_set_by_name('CONTROLLER_BUTTONS')

        if keybind_presets is None:
            keybind_presets = {'default': [('Space', 'BTN_A')]}

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

    def create_device(self, device_name: str, parameters: dict[str, int | str]) -> VirtualDevice:
        device_type = parameters.pop('device_type', None)
        if not device_type:
            raise ValueError(f'Missing "device_type" for device "{device_name}"')
        if device_type not in self.device_types:
            raise ValueError(f'Unknown device type: {device_type}')

        device_class = self.device_types[device_type]

        # Validate parameters
        init_params = device_class.__init__.__code__.co_varnames[1:]  # skip 'self'
        for key in parameters:
            if key not in init_params:
                raise ValueError(f'Unknown parameter "{key}" for device type "{device_type}"')

        device = device_class(name=device_name, **parameters)
        logger.info(f'Created device: {device_name} ({device_type})')
        return device

    def rename_device(self, device_id: str, new_name: str):
        if device_id not in self.device_map:
            raise ValueError(f'Unknown device: {device_id}')
        old_name = self.device_map[device_id].name
        self.device_map[device_id].name = new_name
        logger.info(f'Renamed device "{old_name}" -> "{new_name}"')

    def emit(self, device_id: str, event_name: str, value: int | float):
        if device_id not in self.device_map:
            raise ValueError(f'Unknown device: {device_id}')
        self.device_map[device_id].emit(event_name, value)

    def initialize_devices(self, device_config: dict[str, dict[str, str]]):
        for device_name, device_params in device_config.items():
            presets_names: set[str] = set(device_params.pop('presets', []))
            # Get presets from library
            presets = {
                preset_name: self.keybind_preset_library[preset_name]
                for preset_name in presets_names if preset_name in self.keybind_preset_library
            }
            device_params['keybind_presets'] = presets

            device = self.create_device(device_name, device_params.copy())
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

        match str(ip_version).lower():
            case '4' | 'v4' | 'ipv4':
                self.families_to_try = [socket.AF_INET]
            case '6' | 'v6' | 'ipv6':
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
                logger.warning('Connection to server lost. Reconnecting...')
                break
            except Exception:
                logger.exception('Unexpected error during connection handling')

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
        logger.debug(f'Sent registration for device: {device.name} ({device.id})')

    async def handle_message(self, data: dict):
        msg_type = data.get('type')

        if msg_type == 'device_registered':
            device_id = data['device_id']
            temporary_id = data['temporary_id']

            device = self.device_manager.device_map.pop(temporary_id, None)

            if not device:
                logger.warning(f'Unknown temporary device id: {temporary_id}')
                return

            # Move from temp to real ID and set attribute
            device.id = device_id
            device.group_id = data.get('group_id')
            device.is_connected = True
            self.device_manager.device_map[device_id] = device

            logger.info(f'Device registered: {device.name} ({device.id}) in group {device.group_id}')
            logger.info(f'Open {self.url}/?group_id={device.group_id} to join group {device.group_id}')

        elif msg_type == 'key_event':
            device_id = data.get('device_id')
            event_name = data.get('code')
            value = int(data.get('state', 0))
            try:
                self.device_manager.emit(device_id, event_name, value)
            except ValueError as error:
                logger.warning(str(error))

        elif msg_type == 'rename_output':
            device_id = data.get('device_id')
            new_name = data.get('name')
            try:
                self.device_manager.rename_device(device_id, new_name)
            except ValueError as error:
                logger.warning(str(error))

        elif msg_type == 'ping':
            await self.websocket.send(json.dumps({
                'type': 'pong',
                'id': data.get('id'),
            }))

    async def connect(self):
        # Reconnect loop
        while not self.stop_event.is_set():
            success = False
            for family in self.families_to_try:
                try:
                    async with websockets.connect(self.websocket_uri, family=family, open_timeout=2) as websocket:
                        self.websocket = websocket
                        logger.info(f'Connected to server at {self.websocket_uri}')
                        await self.handle_connection()
                    success = True
                    break
                except (
                    ConnectionAbortedError,
                    ConnectionRefusedError,
                    OSError,
                    websockets.exceptions.InvalidMessage,
                    websockets.exceptions.InvalidStatus,
                ) as error:

                    ip_version = 'IPv6' if family == socket.AF_INET6 else 'IPv4'
                    logger.warning(f'Connection attempt with {ip_version} failed: {error}', exc_info=True)
                    continue

            if not success:
                logger.warning('All connection attempts failed. Retrying in 3 seconds...')
                if self.stop_event.is_set():
                    continue
                await asyncio.sleep(3)

    def disconnect(self):
        logger.info('Shutting down...')
        self.stop_event.set()
        if self.websocket:
            asyncio.create_task(self.websocket.close())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--settings', default='device_settings.yaml', help='YAML settings file')
    parser.add_argument('--log-level', default='INFO', help='Set logging level (DEBUG, INFO, WARNING, ERROR)')
    args = parser.parse_args()

    setup_logging(args.log_level)

    config: dict[str, dict] = {}

    settings_path = pathlib.Path(args.settings)
    if settings_path.is_file():
        with settings_path.open() as file:
            config = yaml.safe_load(file) or {}
    else:
        logger.warning(f'Settings file not found: {args.settings}')

    connection_details: dict[str] = config.get('connection', {})
    device_config: dict[str, dict] = config.get('devices', {})
    keybind_preset_library: dict[str, list[list]] = config.get('keybind_preset_library', {})
    keybind_preset_library: dict[str, list[tuple[str, str]]] = {
        preset_name: [(key, event) for key, event in keybinds] for preset_name, keybinds in keybind_preset_library.items()
    }

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
