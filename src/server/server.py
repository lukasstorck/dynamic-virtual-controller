import asyncio
import fastapi
import fastapi.staticfiles
import json
import pathlib
import time
import urllib.parse
import uuid

app = fastapi.FastAPI()


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

        if color == '' or is_too_white(color):
            color = '#ff6f61'
        self.color = color

        self.last_activity = time.time()
        self.selected_output_devices: dict[str, bool] = {}

    def serialize(self):
        return {
            'id': self.id,
            'name': self.name,
            'color': self.color,
            'last_activity': self.last_activity,
            'selected_output_devices': [device_id for device_id, state in self.selected_output_devices.items() if state],
        }


class OutputDevice:
    def __init__(self, id: str, websocket: fastapi.WebSocket, name: str, group_id: str, keybind_presets: dict[str, dict[str, str]], allowed_events: set[str]):
        self.id = id
        self.group_id = group_id
        self.websocket = websocket
        self.name = name or id
        self.keybind_presets: dict[str, dict[str, str]] = keybind_presets
        self.allowed_events: set[str] = allowed_events

    def serialize(self, connected_users: list[str]):
        return {
            'id': self.id,
            'name': self.name,
            'connected_users': connected_users,
            'keybind_presets': self.keybind_presets,
            'allowed_events': list(self.allowed_events),
        }


class OutputClient:
    def __init__(self, id: str, websocket: fastapi.WebSocket):
        self.websocket = websocket
        self.devices: dict[str, OutputDevice] = {}

    async def connect_device(
            self,
            temporary_id: str,
            output_device_id: str,
            group_id: str,
            device_name: str,
            allowed_events: set[str],
            keybind_presets: dict[str, dict[str, str]],
    ):
        group = await connection_manager.get_group(group_id)
        output_device = OutputDevice(
            id=output_device_id,
            websocket=self.websocket,
            name=device_name,
            group_id=group.id,
            keybind_presets=keybind_presets,
            allowed_events=allowed_events,
        )
        group.output_devices[output_device.id] = output_device
        self.devices[output_device.id] = output_device
        return output_device

    async def remove_all_devices(self):
        groups: set[Group] = set()

        for device in self.devices.values():
            group = await connection_manager.get_group(device.group_id)
            for user in group.users.values():
                user.selected_output_devices.pop(device.id, None)
            group.output_devices.pop(device.id, None)
            print(f'[INFO] Device {device.id} removed from group {group.id}')
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
                if output_device.id in user.selected_output_devices
            ]
            output_devices_data.append(output_device.serialize(connected_users))

        return {
            'type': 'group_state',
            'group_id': self.id,
            'users': users_data,
            'output_devices': output_devices_data,
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
    def __init__(self):
        self.groups: dict[str, Group] = {}
        self.groups_lock = asyncio.Lock()

    async def get_group(self, group_id: str):
        async with self.groups_lock:
            if group_id not in self.groups:
                self.groups[group_id] = Group(group_id)
            return self.groups[group_id]


connection_manager = ConnectionManager()

# === Static Files ===
static_dir = pathlib.Path(__file__).parent / 'static'
static_dir.mkdir(exist_ok=True)
app.mount('/static', fastapi.staticfiles.StaticFiles(directory=static_dir), name='static')


@app.get('/')
async def index():
    return fastapi.responses.FileResponse(static_dir / 'index.html')


@app.get('/favicon.ico')
async def favicon():
    return fastapi.responses.FileResponse(static_dir / 'favicon.ico')


# === User WebSocket ===
@app.websocket('/ws/user')
async def ws_user(websocket: fastapi.WebSocket):
    await websocket.accept()
    query_params = websocket.query_params
    group_id = query_params.get('group_id') or uuid.uuid4().hex

    user = User(
        id=f'user_{uuid.uuid4().hex[:4]}',
        websocket=websocket,
        name=urllib.parse.unquote_plus(query_params.get('name', '')).strip(),
        color=urllib.parse.unquote_plus(query_params.get('color', '')).strip().lower(),
    )

    group = await connection_manager.get_group(group_id)
    group.users[user.id] = user

    await websocket.send_text(json.dumps({
        'type': 'config',
        'user_id': user.id,
        'group_id': group_id,
    }))

    try:
        await group.broadcast_to_users(json.dumps(group.serialize_state()))

        while True:
            message = await websocket.receive_text()
            incoming_data: dict[str, str] = json.loads(message)
            user.last_activity = time.time()

            if incoming_data.get('type') == 'update_user_data':
                user.name = incoming_data.get('name')
                color = incoming_data.get('color').lower().strip()
                if color != '' and not is_too_white(color):
                    user.color = incoming_data.get('color')
                await group.broadcast_to_users(json.dumps(group.serialize_state()))

            elif incoming_data.get('type') == 'select_output':
                selected_device = incoming_data.get('id')
                state = incoming_data.get('state')
                if selected_device and selected_device in group.output_devices:
                    if state:
                        user.selected_output_devices[selected_device] = True
                    else:
                        del user.selected_output_devices[selected_device]
                await group.broadcast_to_users(json.dumps(group.serialize_state()))

            elif incoming_data.get('type') == 'keypress':
                device_id = incoming_data.get('device_id')
                if device_id not in user.selected_output_devices or device_id not in group.output_devices:
                    return

                selected_device = group.output_devices[device_id]

                await selected_device.websocket.send_text(json.dumps({
                    'type': 'key_event',
                    'device_id': selected_device.id,
                    'user_id': user.id,
                    'code': incoming_data.get('code'),
                    'state': incoming_data.get('state'),
                }))

                await group.broadcast_to_users(json.dumps({
                    'type': 'activity',
                    'user_id': user.id,
                    'timestamp': time.time(),
                }))

            elif incoming_data.get('type') == 'rename_output':
                target_id = incoming_data.get('id')
                new_name = incoming_data.get('name')
                if target_id in group.output_devices and isinstance(new_name, str):
                    old_name = group.output_devices[target_id].name
                    group.output_devices[target_id].name = new_name.strip() or old_name
                    target_ws = group.output_devices[target_id].websocket

                    await target_ws.send_text(json.dumps({
                        'type': 'rename_output',
                        'device_id': target_id,
                        'name': new_name,
                    }))
                await group.broadcast_to_users(json.dumps(group.serialize_state()))

    except fastapi.WebSocketDisconnect:
        group.users.pop(user.id, None)
        await group.broadcast_to_users(json.dumps(group.serialize_state()))


# === Output WebSocket ===
@app.websocket('/ws/output')
async def ws_output(websocket: fastapi.WebSocket):
    await websocket.accept()

    output_client = OutputClient(
        id=f'output_{uuid.uuid4().hex[:4]}',
        websocket=websocket,
    )

    try:
        while True:
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
                    temporary_id=temporary_id,
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
                }))

                group = await connection_manager.get_group(output_device.group_id)
                await group.broadcast_to_users(json.dumps(group.serialize_state()))

    except fastapi.WebSocketDisconnect:
        await output_client.remove_all_devices()


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('server:app', host='0.0.0.0', port=8000, reload=True)
