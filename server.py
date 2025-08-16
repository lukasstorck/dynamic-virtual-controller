import asyncio
import fastapi
import fastapi.staticfiles
import json
import pathlib
import time
import urllib.parse
import uuid

app = fastapi.FastAPI()

groups: dict[str, 'Group'] = {}
groups_lock = asyncio.Lock()


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
        self.color = color or '#ff6f61'
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
    def __init__(self, id: str, websocket: fastapi.WebSocket, name: str | None = None):
        self.id = id
        self.websocket = websocket
        self.name = name or id
        self.keybind_presets: dict[str, dict[str, str]] = {}

    def serialize(self, connected_users: list[str]):
        return {
            'id': self.id,
            'name': self.name,
            'connected_users': connected_users,
            'keybind_presets': self.keybind_presets,
        }


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


async def get_group(group_id: str):
    async with groups_lock:
        if group_id not in groups:
            groups[group_id] = Group(group_id)
        return groups[group_id]


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
        name=urllib.parse.unquote_plus(query_params.get('name')),
        color=urllib.parse.unquote_plus(query_params.get('color')),
    )

    group = await get_group(group_id)
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
    query_params = websocket.query_params
    group_id = query_params.get('group_id') or uuid.uuid4().hex
    output_device_id = f'output_{uuid.uuid4().hex[:4]}'
    output_device_name = query_params.get('name') or output_device_id

    group = await get_group(group_id)
    output_device = OutputDevice(output_device_id, websocket, output_device_name)
    group.output_devices[output_device_id] = output_device

    await websocket.send_text(json.dumps({
        'type': 'config',
        'output_device_id': output_device.id,
        'output_device_name': urllib.parse.unquote_plus(output_device.name),
        'group_id': group_id,
    }))

    await group.broadcast_to_users(json.dumps(group.serialize_state()))

    try:
        while True:
            message = await websocket.receive_text()
            incoming_data: dict = json.loads(message)

            if incoming_data.get('type') == 'set_keybind_presets':
                keybind_presets: dict[str, str] = incoming_data.get('keybind_presets')
                output_device.keybind_presets = keybind_presets
                await group.broadcast_to_users(json.dumps(group.serialize_state()))

    except fastapi.WebSocketDisconnect:
        for user in group.users.values():
            if output_device.id in user.selected_output_devices:
                user.selected_output_devices.pop(output_device.id, None)

        group.output_devices.pop(output_device.id, None)
        await group.broadcast_to_users(json.dumps(group.serialize_state()))
        print(f'[{group.id}] Output {output_device.id} disconnected.')


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('server:app', host='0.0.0.0', port=8000, reload=True)
