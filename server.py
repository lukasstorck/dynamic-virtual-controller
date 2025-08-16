import asyncio
import json
import time
import uuid
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

groups: dict[str, 'Group'] = {}
groups_lock = asyncio.Lock()


class User:
    def __init__(
        self,
        id: str,
        websocket: WebSocket,
        name: str | None = None,
        color: str = '#cccccc',
    ):
        self.id = id
        self.websocket = websocket
        self.name = name or id
        self.color = color
        self.last_activity = time.time()
        self.selected_output: str | None = None

    def serialize(self):
        return {
            'id': self.id,
            'name': self.name,
            'color': self.color,
            'lastActivity': self.last_activity,
            'selected_output': self.selected_output,
        }


class OutputDevice:
    def __init__(self, id: str, websocket: WebSocket, name: str | None = None):
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
                if user.selected_output == output_device.id
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
static_dir = Path(__file__).parent / 'static'
static_dir.mkdir(exist_ok=True)
app.mount('/static', StaticFiles(directory=static_dir), name='static')


@app.get('/')
async def index():
    return FileResponse(static_dir / 'index.html')


@app.get('/favicon.ico')
async def favicon():
    return FileResponse(static_dir / 'favicon.ico')


# === User WebSocket ===
@app.websocket('/ws/user')
async def ws_user(websocket: WebSocket):
    await websocket.accept()
    query_params = websocket.query_params
    group_id = query_params.get('group_id') or uuid.uuid4().hex
    user_id = f'user_{uuid.uuid4().hex[:4]}'

    group = await get_group(group_id)
    group.users[user_id] = User(user_id, websocket)

    await websocket.send_text(json.dumps({
        'type': 'config',
        'user_id': user_id,
        'group_id': group_id,
    }))

    try:
        await group.broadcast(json.dumps(group.serialize_state()))

        while True:
            message = await websocket.receive_text()
            incoming_data: dict[str, str] = json.loads(message)
            current_user = group.users[user_id]
            current_user.last_activity = time.time()

            if incoming_data.get('type') == 'register':
                current_user.name = incoming_data.get('name') or user_id
                current_user.color = incoming_data.get('color', '#cccccc')

            elif incoming_data.get('type') == 'select_output':
                selected_device = incoming_data.get('id')
                if selected_device and selected_device in group.output_devices:
                    current_user.selected_output = selected_device
                    await websocket.send_text(json.dumps({
                        'type': 'output_selected',
                        'id': selected_device,
                    }))
                else:
                    current_user.selected_output = None
                    await websocket.send_text(json.dumps({
                        'type': 'output_selected',
                        'id': None,
                    }))

            elif incoming_data.get('type') == 'keypress':
                if current_user.selected_output in group.output_devices:
                    output_websocket = group.output_devices[current_user.selected_output].websocket
                    await output_websocket.send_text(json.dumps({
                        'type': 'key_event',
                        'user_id': user_id,
                        'code': incoming_data.get('code'),
                        'state': incoming_data.get('state'),
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

            await group.broadcast(json.dumps(group.serialize_state()))

    except WebSocketDisconnect:
        group.users.pop(user_id, None)
        await group.broadcast(json.dumps(group.serialize_state()))


# === Output WebSocket ===
@app.websocket('/ws/output')
async def ws_output(websocket: WebSocket):
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
        'output_device_name': output_device.name,
        'group_id': group_id,
    }))

    await group.broadcast(json.dumps(group.serialize_state()))

    try:
        while True:
            message = await websocket.receive_text()
            incoming_data = json.loads(message)

            if incoming_data.get('type') == 'rename' and 'name' in incoming_data:
                output_device.name = incoming_data['name']
                await group.broadcast(json.dumps(group.serialize_state()))

            elif incoming_data.get('type') == 'set_keybind_presets':
                keybind_presets: dict[str, str] = incoming_data.get('keybind_presets')
                output_device.keybind_presets = keybind_presets
                await group.broadcast(json.dumps(group.serialize_state()))

    except WebSocketDisconnect:
        group.output_devices.pop(output_device.id, None)
        await group.broadcast(json.dumps(group.serialize_state()))
        print(f'[{group.id}] Output {output_device.id} disconnected.')


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('server:app', host='0.0.0.0', port=8000, reload=True)
