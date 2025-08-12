import asyncio
import json
import uuid
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

groups: dict[str, 'Group'] = {}  # group_id -> Group
groups_lock = asyncio.Lock()


class Group:
    def __init__(self, group_id):
        self.id = group_id
        self.inputs: dict[str, WebSocket] = {}   # input_id -> WebSocket
        self.outputs: dict[str, WebSocket] = {}  # output_id -> WebSocket


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


@app.get('/controller/{group_id}')
async def controller_page(group_id: str):
    return FileResponse(static_dir / 'controller.html')


@app.websocket('/ws/input')
async def ws_input(websocket: WebSocket):
    await websocket.accept()
    query = websocket.query_params
    group_id = query.get('group_id') or f'group_{uuid.uuid4().hex}'
    input_id = query.get('input_id') or f'input_{uuid.uuid4().hex[:4]}'

    group = await get_group(group_id)
    group.inputs[input_id] = websocket
    selected_output = None

    # Send available outputs list
    await websocket.send_text(json.dumps({
        'type': 'welcome',
        'input_id': input_id,
        'group_id': group_id,
        'available_outputs': list(group.outputs.keys()),
    }))

    try:
        while True:
            msg = await websocket.receive_text()
            data: dict[str, str] = json.loads(msg)
            message_type = data.get('type')

            if message_type == 'select_output':
                target = data.get('output_id')
                if target in group.outputs:
                    selected_output = target
                    await websocket.send_text(json.dumps({
                        'type': 'output_selected',
                        'output_id': selected_output,
                    }))
                else:
                    await websocket.send_text(json.dumps({
                        'type': 'error',
                        'message': f'Output {target} not found in group.',
                    }))

            elif message_type == 'keypress' and selected_output:
                if selected_output in group.outputs:
                    await group.outputs[selected_output].send_text(json.dumps({
                        'type': 'key_event',
                        'input_id': input_id,
                        'code': data.get('code'),
                        'state': data.get('state'),
                    }))
    except WebSocketDisconnect:
        del group.inputs[input_id]
        print(f'[{group_id}] Input {input_id} disconnected.')


@app.websocket('/ws/output')
async def ws_output(websocket: WebSocket):
    await websocket.accept()
    query = websocket.query_params
    group_id = query.get('group_id') or f'group_{uuid.uuid4().hex}'
    output_id = query.get('output_id') or f'output_{uuid.uuid4().hex[:4]}'

    group = await get_group(group_id)
    group.outputs[output_id] = websocket

    # Notify all inputs of new output
    for ws in group.inputs.values():
        try:
            await ws.send_text(json.dumps({
                'type': 'output_available',
                'output_id': output_id
            }))
        except Exception:
            pass

    # Send config to output client
    await websocket.send_text(json.dumps({
        'type': 'config',
        'output_id': output_id,
        'group_id': group_id
    }))

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        del group.outputs[output_id]
        # Notify inputs of removal
        for ws in group.inputs.values():
            try:
                await ws.send_text(json.dumps({
                    'type': 'output_unavailable',
                    'output_id': output_id
                }))
            except Exception:
                pass
        print(f'[{group_id}] Output {output_id} disconnected.')

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('server:app', host='0.0.0.0', port=8000, reload=True)
