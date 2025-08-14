# server.py
import asyncio
import json
import uuid
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

groups: dict[str, 'Group'] = {}
groups_lock = asyncio.Lock()


class InputClient:
    def __init__(self, input_id: str, websocket: WebSocket, name: str = None, color: str = '#cccccc'):
        self.id = input_id
        self.websocket = websocket
        self.name = name or input_id
        self.color = color
        self.last_activity = 'just now'
        self.selected_output: str | None = None

    def serialize(self):
        return {
            'input_id': self.id,
            'name': self.name,
            'color': self.color,
            'lastActivity': self.last_activity,
            'selected_output': self.selected_output
        }


class OutputDevice:
    def __init__(self, output_id: str, websocket: WebSocket, name: str = None):
        self.id = output_id
        self.websocket = websocket
        self.name = name or output_id

    def serialize(self, connected_inputs: list[str]):
        return {
            'output_id': self.id,
            'name': self.name,
            'connected_inputs': connected_inputs,
        }


class Group:
    def __init__(self, group_id):
        self.id = group_id
        self.input_clients: dict[str, InputClient] = {}
        self.output_devices: dict[str, OutputDevice] = {}

    def serialize_state(self):
        input_clients = [input_client.serialize() for input_client in self.input_clients.values()]

        output_devices = []
        for output_device in self.output_devices.values():
            connected = [
                client.name
                for client in self.input_clients.values()
                if client.selected_output == output_device.id
            ]
            output_devices.append(output_device.serialize(connected))

        return {
            'type': 'group_state',
            'group_id': self.id,
            'input_clients': input_clients,
            'output_devices': output_devices,
        }

    async def broadcast_group_state(self):
        state = json.dumps(self.serialize_state())
        for input_client in list(self.input_clients.values()) + list(self.output_devices.values()):
            try:
                await input_client.websocket.send_text(state)
            except Exception:
                pass


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


# === Input WebSocket ===
@app.websocket('/ws/input')
async def ws_input(websocket: WebSocket):
    await websocket.accept()
    query = websocket.query_params
    group_id = query.get('group_id') or f'group_{uuid.uuid4().hex}'
    input_client_id = query.get('input_id') or f'input_{uuid.uuid4().hex[:4]}'

    group = await get_group(group_id)
    group.input_clients[input_client_id] = InputClient(input_client_id, websocket)

    try:
        await group.broadcast_group_state()

        while True:
            data: dict[str, str] = json.loads(await websocket.receive_text())
            client = group.input_clients[input_client_id]

            if data.get('type') == 'register':
                client.name = data.get('name') or input_client_id
                client.color = data.get('color', '#cccccc')
                client.last_activity = 'just now'

            elif data.get('type') == 'select_output':
                target = data.get('output_id')
                if target and target in group.output_devices:
                    client.selected_output = target
                    await websocket.send_text(json.dumps({
                        'type': 'output_selected',
                        'output_id': target
                    }))
                else:
                    client.selected_output = None
                    await websocket.send_text(json.dumps({
                        'type': 'output_selected',
                        'output_id': None
                    }))

            elif data.get('type') == 'keypress':
                if client.selected_output and client.selected_output in group.output_devices:
                    output_websocket = group.output_devices[client.selected_output].websocket
                    await output_websocket.send_text(json.dumps({
                        'type': 'key_event',
                        'input_id': input_client_id,
                        'code': data.get('code'),
                        'state': data.get('state'),
                    }))

            elif data.get('type') == 'rename_output':
                target = data.get('output_id')
                new_name = data.get('name')
                if target in group.output_devices and isinstance(new_name, str):
                    group.output_devices[target].name = new_name
                    await group.broadcast_group_state()

            await group.broadcast_group_state()

    except WebSocketDisconnect:
        group.input_clients.pop(input_client_id, None)
        await group.broadcast_group_state()


# === Output WebSocket ===
@app.websocket('/ws/output')
async def ws_output(websocket: WebSocket):
    await websocket.accept()
    query = websocket.query_params
    group_id = query.get('group_id') or f'group_{uuid.uuid4().hex}'
    output_id = query.get('output_id') or f'output_{uuid.uuid4().hex[:4]}'
    output_name = query.get('name') or output_id

    group = await get_group(group_id)
    group.output_devices[output_id] = OutputDevice(output_id, websocket, output_name)

    await websocket.send_text(json.dumps({
        'type': 'config',
        'output_id': output_id,
        'group_id': group_id
    }))

    await group.broadcast_group_state()

    try:
        while True:
            data = json.loads(await websocket.receive_text())
            if data.get('type') == 'rename' and 'name' in data:
                group.output_devices[output_id].name = data['name']
                await group.broadcast_group_state()
    except WebSocketDisconnect:
        group.output_devices.pop(output_id, None)
        await group.broadcast_group_state()
        print(f'[{group_id}] Output {output_id} disconnected.')


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('server:app', host='0.0.0.0', port=8000, reload=True)
