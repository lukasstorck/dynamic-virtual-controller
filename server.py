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


class Group:
    def __init__(self, group_id):
        self.id = group_id
        self.input_clients: dict[str, dict] = {}
        self.output_devices: dict[str, dict] = {}

    def serialize_state(self):
        input_clients = []
        for input_id, info in self.input_clients.items():
            input_clients.append({
                'input_id': input_id,
                'name': info.get('name') or input_id,
                'lastActivity': info.get('lastActivity', 'just now'),
                'selected_output': info.get('selected_output')
            })
        output_devices = []
        for output_id, info in self.output_devices.items():
            connected = [
                input_info.get('name') or input_id
                for input_id, input_info in self.input_clients.items()
                if input_info.get('selected_output') == output_id
            ]
            output_devices.append({
                'output_id': output_id,
                'name': info.get('name') or output_id,
                'connected_inputs': connected
            })
        return {'type': 'group_state', 'group_id': self.id, 'input_clients': input_clients, 'output_devices': output_devices}


async def get_group(group_id: str):
    async with groups_lock:
        if group_id not in groups:
            groups[group_id] = Group(group_id)
        return groups[group_id]

static_dir = Path(__file__).parent / 'static'
static_dir.mkdir(exist_ok=True)
app.mount('/static', StaticFiles(directory=static_dir), name='static')


@app.get('/')
async def index():
    return FileResponse(static_dir / 'index.html')


@app.websocket('/ws/input')
async def ws_input(websocket: WebSocket):
    await websocket.accept()
    query = websocket.query_params
    group_id = query.get('group_id') or f'group_{uuid.uuid4().hex}'
    input_id = query.get('input_id') or f'input_{uuid.uuid4().hex[:4]}'

    group = await get_group(group_id)
    group.input_clients[input_id] = {'ws': websocket, 'name': None, 'lastActivity': 'just now', 'selected_output': None}

    try:
        for ws in [p['ws'] for p in group.input_clients.values()]:
            try:
                await ws.send_text(json.dumps(group.serialize_state()))
            except Exception:
                pass

        while True:
            data: dict[str, str] = json.loads(await websocket.receive_text())
            if data.get('type') == 'register':
                group.input_clients[input_id]['name'] = data.get('name') or input_id
                group.input_clients[input_id]['lastActivity'] = 'just now'
            elif data.get('type') == 'select_output':
                target = data.get('output_id')
                if target and target in group.output_devices:
                    group.input_clients[input_id]['selected_output'] = target
                    await websocket.send_text(json.dumps({'type': 'output_selected', 'output_id': target}))
                else:
                    group.input_clients[input_id]['selected_output'] = None
                    await websocket.send_text(json.dumps({'type': 'output_selected', 'output_id': None}))
            elif data.get('type') == 'keypress':
                selected_output = group.input_clients[input_id].get('selected_output')
                if selected_output and selected_output in group.output_devices:
                    await group.output_devices[selected_output]['ws'].send_text(json.dumps({
                        'type': 'key_event',
                        'input_id': input_id,
                        'code': data.get('code'),
                        'state': data.get('state'),
                    }))
            for ws in [p['ws'] for p in group.input_clients.values()]:
                await ws.send_text(json.dumps(group.serialize_state()))
    except WebSocketDisconnect:
        group.input_clients.pop(input_id, None)
        for ws in [p['ws'] for p in group.input_clients.values()]:
            await ws.send_text(json.dumps(group.serialize_state()))


@app.websocket('/ws/output')
async def ws_output(websocket: WebSocket):
    await websocket.accept()
    query = websocket.query_params
    group_id = query.get('group_id') or f'group_{uuid.uuid4().hex}'
    output_id = query.get('output_id') or f'output_{uuid.uuid4().hex[:4]}'
    output_name = query.get('name') or output_id

    group = await get_group(group_id)
    group.output_devices[output_id] = {'ws': websocket, 'name': output_name}

    for ws in [p['ws'] for p in group.input_clients.values()]:
        await ws.send_text(json.dumps(group.serialize_state()))

    await websocket.send_text(json.dumps({
        'type': 'config',
        'output_id': output_id,
        'group_id': group_id
    }))

    try:
        while True:
            data = json.loads(await websocket.receive_text())
            if data.get('type') == 'rename' and 'name' in data:
                group.output_devices[output_id]['name'] = data['name']
                for ws in [p['ws'] for p in group.input_clients.values()]:
                    await ws.send_text(json.dumps(group.serialize_state()))
    except WebSocketDisconnect:
        group.output_devices.pop(output_id, None)
        for ws in [p['ws'] for p in group.input_clients.values()]:
            await ws.send_text(json.dumps(group.serialize_state()))
        print(f'[{group_id}] Output {output_id} disconnected.')

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('server:app', host='0.0.0.0', port=8000, reload=True)
