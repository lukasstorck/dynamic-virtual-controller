import asyncio
import contextlib
import fastapi
import json
import time
import uuid


def is_too_white(hex_color: str, threshold: int = 240):
    '''Return True if the hex color is close to white.'''
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:  # expand shorthand like #fff
        hex_color = ''.join(c * 2 for c in hex_color)

    try:
        r, g, b = tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return True  # invalid = reject

    # perceived luminance formula
    luminance = 0.299 * r + 0.587 * g + 0.114 * b
    return luminance > threshold


class User:
    def __init__(
        self,
        id: str,
        websocket: fastapi.WebSocket,
        name: str | None = None,
        color: str | None = None,
    ):
        self.id = id
        self.websocket = websocket
        self.name = name or id

        if not color or is_too_white(color):
            color = '#ff6f61'
        self.color = color

        self.last_activity_time = time.time()
        self.connected_device_ids: dict[str, bool] = {}
        self.pings: list[float] = []

    def get_ping_average(self):
        return sum(self.pings) / len(self.pings) if self.pings else None

    def serialize(self):
        return {
            'id': self.id,
            'name': self.name,
            'color': self.color,
            'last_activity_time': self.last_activity_time,
            'last_ping': self.get_ping_average(),
            'connected_device_ids': [device_id for device_id, state in self.connected_device_ids.items() if state],
        }


class OutputDevice:
    def __init__(self, id: str, websocket: fastapi.WebSocket, name: str, group_id: str, slot: int, keybind_presets: dict[str, list[tuple[str, str]]], allowed_events: set[str]):
        self.id = id
        self.group_id = group_id
        self.websocket = websocket
        self.name = name or id
        self.slot = slot
        self.keybind_presets: dict[str, list[tuple[str, str]]] = keybind_presets
        self.allowed_events: set[str] = allowed_events
        self.pings: list[float] = []

    def get_ping_average(self):
        return sum(self.pings) / len(self.pings) if self.pings else None

    def serialize(self, connected_users: list[str]):
        return {
            'id': self.id,
            'name': self.name,
            'slot': self.slot,
            'connected_users': connected_users,
            'keybind_presets': self.keybind_presets,
            'allowed_events': list(self.allowed_events),
            'last_ping': self.get_ping_average(),
        }


class OutputClient:
    def __init__(self, id: str, websocket: fastapi.WebSocket):
        self.id = id
        self.websocket = websocket
        self.devices: dict[str, OutputDevice] = {}

    async def connect_device(
            self,
            output_device_id: str,
            group_id: str,
            device_name: str,
            allowed_events: set[str],
            keybind_presets: dict[str, list[tuple[str, str]]],
    ):
        group = await ConnectionManager.get().get_group(group_id)

        # Find the lowest available slot number
        used_slots = {device.slot for device in group.output_devices.values()}
        slot = 1
        while slot in used_slots:
            slot += 1

        output_device = OutputDevice(
            id=output_device_id,
            websocket=self.websocket,
            name=device_name,
            group_id=group.id,
            slot=slot,
            keybind_presets=keybind_presets,
            allowed_events=allowed_events,
        )
        group.output_devices[output_device.id] = output_device
        self.devices[output_device.id] = output_device
        return output_device

    async def remove_all_devices(self):
        groups: set[Group] = set()

        for device in self.devices.values():
            group = await ConnectionManager.get().get_group(device.group_id)
            for user in group.users.values():
                user.connected_device_ids.pop(device.id, None)
            group.output_devices.pop(device.id, None)
            print(f'[INFO] Device {device.id} (slot {device.slot}) removed from group {group.id}')
            groups.add(group)

        self.devices.clear()
        for group in groups:
            await group.broadcast_to_users(json.dumps(group.serialize_state()))


class Group:
    def __init__(self, group_id: str):
        self.id = group_id
        self.users: dict[str, User] = {}
        self.output_devices: dict[str, OutputDevice] = {}

    def serialize_state(self):
        users_data = [user.serialize() for user in self.users.values()]

        output_devices_data = []
        for output_device in self.output_devices.values():
            connected_users = [
                user.id for user in self.users.values()
                if output_device.id in user.connected_device_ids
            ]
            output_devices_data.append(output_device.serialize(connected_users))

        output_devices_data.sort(key=lambda device: device['slot'])

        return {
            'type': 'group_state',
            'group_id': self.id,
            'users': users_data,
            'devices': output_devices_data,
        }

    def serialize_activity_and_ping(self):
        users = {user.id: [user.last_activity_time, user.get_ping_average()] for user in self.users.values()}
        output_devices = {output_device.id: [output_device.get_ping_average()] for output_device in self.output_devices.values()}

        return {
            'type': 'activity_and_ping',
            'users': users,
            'devices': output_devices,
        }

    async def broadcast(self, message: str, receivers: list[User | OutputDevice] = None):
        if receivers is None:
            receivers = list(self.users.values()) + list(self.output_devices.values())

        for receiver in receivers:
            try:
                await receiver.websocket.send_text(message)
            except Exception:
                pass

    async def broadcast_to_users(self, message: str):
        await self.broadcast(message, list(self.users.values()))

    async def broadcast_to_output_devices(self, message: str):
        await self.broadcast(message, list(self.output_devices.values()))


class ConnectionManager:
    connection_manager = None
    ping_interval = 0.2  # seconds

    def __init__(self):
        self.users: dict[str, User] = {}
        self.output_clients: dict[str, OutputClient] = {}
        self.groups: dict[str, Group] = {}
        self.groups_lock = asyncio.Lock()
        self.pending_pings: dict[str, tuple[str, float]] = {}

    @classmethod
    def get(cls):
        if cls.connection_manager is None:
            cls.connection_manager = ConnectionManager()
        return cls.connection_manager

    async def get_group(self, group_id: str):
        async with self.groups_lock:
            if group_id not in self.groups:
                self.groups[group_id] = Group(group_id)
            return self.groups[group_id]

    async def ping_monitor(self):
        i = 0
        while True:
            await asyncio.sleep(self.ping_interval)
            for group in self.groups.values():
                # Ping all users
                for user_id, user in group.users.items():
                    try:
                        ping_id = str(uuid.uuid4())
                        start_time = time.time()

                        # Store pending ping
                        self.pending_pings[user_id] = (ping_id, start_time)

                        await user.websocket.send_text(json.dumps({
                            'type': 'ping',
                            'id': ping_id
                        }))
                    except Exception:
                        self.pending_pings.pop(user_id, None)

                # Ping all output clients
                for output_client_id, output_client in self.output_clients.items():
                    try:
                        ping_id = str(uuid.uuid4())
                        start_time = time.time()

                        # Store pending ping
                        self.pending_pings[output_client_id] = (ping_id, start_time)

                        await output_client.websocket.send_text(json.dumps({
                            'type': 'ping',
                            'id': ping_id
                        }))
                    except Exception:
                        self.pending_pings.pop(output_client_id, None)

            # Clean up old pending pings
            cutoff_time = time.time() - 3 * self.ping_interval
            self.pending_pings = {
                k: v for k, v in self.pending_pings.items()
                if v[1] > cutoff_time
            }

            if i < 10:
                i += 1
                continue

            for group in self.groups.values():
                await group.broadcast_to_users(json.dumps(group.serialize_activity_and_ping()))

    async def handle_pong(self, sender_id: str, pong_data: dict):
        'Handle pong response from user or device'
        ping_id = pong_data.get('id')
        if not ping_id:
            return

        pending_ping = self.pending_pings.pop(sender_id, None)
        if pending_ping:
            expected_ping_id, start_time = pending_ping
            if ping_id == expected_ping_id:
                ping_ms = (time.time() - start_time) * 1000

                # Update ping for user or device
                if sender_id in self.users:
                    self.users[sender_id].pings.append(ping_ms)
                    if len(self.users[sender_id].pings) > 10:
                        self.users[sender_id].pings = self.users[sender_id].pings[-10:]
                elif sender_id in self.output_clients:
                    for device in self.output_clients[sender_id].devices.values():
                        device.pings.append(ping_ms)
                        if len(device.pings) > 10:
                            device.pings = device.pings[-10:]


@contextlib.asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    task = asyncio.create_task(ConnectionManager.get().ping_monitor())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

app = fastapi.FastAPI(lifespan=lifespan)


# === User WebSocket ===
@app.websocket('/ws/user')
async def ws_user(websocket: fastapi.WebSocket):
    await websocket.accept()
    user = User(
        id=f'user_{uuid.uuid4().hex[:4]}',
        websocket=websocket,
    )
    ConnectionManager.get().users[user.id] = user
    print(f'[INFO] User {user.name} ({user.id}) started connection')

    group: Group | None = None

    await websocket.send_text(json.dumps({
        'type': 'config',
        'user_id': user.id,
    }))

    while True:
        try:
            message = await websocket.receive_text()
            incoming_data: dict[str, str] = json.loads(message)

            if incoming_data.get('type') == 'update_user_data':
                user.name = incoming_data.get('name')
                color = incoming_data.get('color').lower().strip()
                if color != '' and not is_too_white(color):
                    user.color = incoming_data.get('color')
                user.last_activity_time = time.time()
                if group:
                    await group.broadcast_to_users(json.dumps(group.serialize_state()))
                else:
                    await websocket.send_text(json.dumps({
                        'type': 'config',
                        'user_id': user.id,
                        'user_name': user.name,
                        'user_color': user.color,
                    }))

            elif incoming_data.get('type') == 'join_group':
                if group:
                    group.users.pop(user.id, None)
                    await group.broadcast_to_users(json.dumps(group.serialize_state()))
                    print(f'[INFO] User {user.name} ({user.id}) left group {group.id}')

                group_id = incoming_data.get('group_id')
                if not group_id:
                    group_id = uuid.uuid4().hex

                group = await ConnectionManager.get().get_group(group_id)
                group.users[user.id] = user

                await group.broadcast_to_users(json.dumps(group.serialize_state()))
                print(f'[INFO] User {user.name} ({user.id}) joined group {group.id}')

            elif incoming_data.get('type') == 'leave_group':
                if not group:
                    continue

                group.users.pop(user.id, None)
                await group.broadcast_to_users(json.dumps(group.serialize_state()))
                print(f'[INFO] User {user.name} ({user.id}) left group {group.id}')
                group = None

            elif incoming_data.get('type') == 'select_output':
                if not group:
                    continue

                selected_device = incoming_data.get('id')
                state = incoming_data.get('state')
                if selected_device and selected_device in group.output_devices:
                    if state:
                        user.connected_device_ids[selected_device] = True
                    else:
                        user.connected_device_ids.pop(selected_device, None)
                user.last_activity_time = time.time()
                await group.broadcast_to_users(json.dumps(group.serialize_state()))

            elif incoming_data.get('type') == 'keypress':
                device_id = incoming_data.get('device_id')
                if not group or device_id not in user.connected_device_ids or device_id not in group.output_devices:
                    continue

                selected_device = group.output_devices[device_id]

                await selected_device.websocket.send_text(json.dumps({
                    'type': 'key_event',
                    'device_id': selected_device.id,
                    'user_id': user.id,
                    'code': incoming_data.get('code'),
                    'state': incoming_data.get('state'),
                }))
                user.last_activity_time = time.time()

            elif incoming_data.get('type') == 'rename_output':
                if not group:
                    continue

                target_id = incoming_data.get('id')
                new_name = incoming_data.get('name')
                if target_id in group.output_devices and isinstance(new_name, str):
                    device = group.output_devices[target_id]
                    if new_name := new_name.strip():
                        device.name = new_name
                    target_ws = device.websocket

                    await target_ws.send_text(json.dumps({
                        'type': 'rename_output',
                        'device_id': target_id,
                        'name': device.name,
                    }))
                user.last_activity_time = time.time()
                await group.broadcast_to_users(json.dumps(group.serialize_state()))

            elif incoming_data.get('type') == 'pong':
                await ConnectionManager.get().handle_pong(user.id, incoming_data)

        except (
            RuntimeError,
            fastapi.WebSocketDisconnect
        ) as error:
            if isinstance(error, RuntimeError):
                print(f'[ERROR] received message on closed connection (probably due to a race condition between shortly timed normal and close message): {error}')

            if group:
                group.users.pop(user.id, None)
                await group.broadcast_to_users(json.dumps(group.serialize_state()))
                print(f'[INFO] User {user.name} ({user.id}) left group {group.id}')
            ConnectionManager.get().users.pop(user.id, None)
            print(f'[INFO] User {user.name} ({user.id}) disconnected')

            break


# === Output WebSocket ===
@app.websocket('/ws/output')
async def ws_output(websocket: fastapi.WebSocket):
    await websocket.accept()

    output_client = OutputClient(
        id=f'output_{uuid.uuid4().hex[:4]}',
        websocket=websocket,
    )
    ConnectionManager.get().output_clients[output_client.id] = output_client

    while True:
        try:
            message = await websocket.receive_text()
            incoming_data: dict = json.loads(message)

            if incoming_data.get('type') == 'register_device':
                try:
                    temporary_id = incoming_data.get('temporary_id')
                    output_device_id = f'output_{uuid.uuid4().hex[:4]}'
                    group_id = incoming_data.get('group_id') or uuid.uuid4().hex
                    device_name = incoming_data.get('device_name')
                    allowed_events = incoming_data.get('allowed_events')
                    keybind_presets = incoming_data.get('keybind_presets')
                except Exception as error:
                    print(f'Error registering device: {error}')
                    continue

                output_device = await output_client.connect_device(
                    output_device_id=output_device_id,
                    group_id=group_id,
                    device_name=device_name,
                    allowed_events=allowed_events,
                    keybind_presets=keybind_presets,
                )

                await output_device.websocket.send_text(json.dumps({
                    'type': 'device_registered',
                    'device_id': output_device.id,
                    'temporary_id': temporary_id,
                    'group_id': output_device.group_id,
                    'slot': output_device.slot,
                }))

                group = await ConnectionManager.get().get_group(output_device.group_id)
                await group.broadcast_to_users(json.dumps(group.serialize_state()))
                print(f'[INFO] Device {output_device.id} registered in group {group.id} with slot {output_device.slot}')

            elif incoming_data.get('type') == 'pong':
                await ConnectionManager.get().handle_pong(output_client.id, incoming_data)

        except fastapi.WebSocketDisconnect:
            await output_client.remove_all_devices()
            ConnectionManager.get().output_clients.pop(output_client.id)
            break


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('server:app', host='0.0.0.0', port=8000, reload=True)
