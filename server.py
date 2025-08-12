import asyncio
import json
import uuid
import datetime
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

BASE_URL = "http://localhost:8000"  # change if you deploy elsewhere

# --- default mapping ---
DEFAULT_MAPPING = {
    "KeyW": "BTN_DPAD_UP",
    "KeyA": "BTN_DPAD_LEFT",
    "KeyS": "BTN_DPAD_DOWN",
    "KeyD": "BTN_DPAD_RIGHT",
    "KeyE": "BTN_A",
    "KeyQ": "BTN_B",
    "KeyX": "BTN_X",
    "KeyY": "BTN_Y",
    "Tab": "BTN_TL",
    "KeyR": "BTN_TR",
    "Escape": "BTN_START",
    "Space": "BTN_A",
    "KeyZ": "BTN_Y",
    "KeyF": "BTN_Y",
}

# Static files
static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")


class Controller:
    def __init__(self, controller_id: str = None):
        if controller_id is None:
            controller_id = uuid.uuid4().hex[:8]
        self.id = controller_id
        self.name = f"Controller-{controller_id}"
        self.mapping = DEFAULT_MAPPING.copy()
        self.last_states = {}
        self.input_connections = []
        self.output_ws = None
        self.created_at = datetime.datetime.now(datetime.timezone.utc)
        self.updated_at = datetime.datetime.now(datetime.timezone.utc)

    def touch(self):
        self.updated_at = datetime.datetime.now(datetime.timezone.utc)


controllers = {}
controllers_lock = asyncio.Lock()


async def get_controller(controller_id: str = None):
    async with controllers_lock:
        if controller_id is None or controller_id not in controllers:
            controller = Controller(controller_id)
            controllers[controller.id] = controller
            return controller
        else:
            return controllers[controller_id]


@app.get("/")
async def index():
    return FileResponse(static_dir / "index.html")


@app.get("/controller/{controller_id}")
async def controller_page(controller_id: str):
    return FileResponse(static_dir / "controller.html")


# --- WebSocket for browser input clients ---
@app.websocket("/ws/input/{controller_id}")
async def ws_input(websocket: WebSocket, controller_id: str):
    await websocket.accept()
    controller = await get_controller(controller_id)
    controller.input_connections.append(websocket)
    controller.touch()
    print(f"[{controller_id}] Input client connected. Total inputs: {len(controller.input_connections)}")

    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                data = json.loads(data_text)
            except Exception:
                print(f"[{controller_id}] Invalid JSON from input client: {data_text}")
                continue

            message_type = data.get("type", "keypress")
            if message_type == "keypress":
                code = data.get("code")
                state = int(data.get("state", 0))
                name = data.get("name")
                if name:
                    controller.name = name
                controller.last_states[code] = state
                controller.touch()
                if controller.output_ws:
                    try:
                        await controller.output_ws.send_text(json.dumps({
                            "type": "key_event",
                            "controller_name": controller.name,
                            "code": code,
                            "state": state
                        }))
                    except Exception as e:
                        print(f"[{controller_id}] Error forwarding key_event to output: {e}")
                await websocket.send_text(json.dumps({"type": "ack", "code": code, "state": state}))

            elif message_type == "set_name":
                name = data.get("name")
                if name:
                    controller.name = name
                    controller.touch()
                    if controller.output_ws:
                        await controller.output_ws.send_text(json.dumps({"type": "set_name", "name": name}))

            elif message_type == "map_update":
                mapping = data.get("mapping", {})
                controller.mapping.update(mapping)
                controller.touch()
                if controller.output_ws:
                    await controller.output_ws.send_text(json.dumps({"type": "map_update", "mapping": controller.mapping}))
            else:
                print(f"[{controller_id}] unknown input message_type: {message_type} | {data}")

    except WebSocketDisconnect:
        controller.input_connections.remove(websocket)
        print(f"[{controller_id}] Input client disconnected. Remaining inputs: {len(controller.input_connections)}")


# --- WebSocket for output devices ---
@app.websocket("/ws/output")
async def ws_output(websocket: WebSocket):
    await websocket.accept()
    requested_id = websocket.query_params.get("controller_id")
    controller = await get_controller(requested_id)
    async with controllers_lock:
        controller.output_ws = websocket

    join_url = f"{BASE_URL}/controller/{controller.id}"
    info = {
        "type": "config",
        "controller_id": controller.id,
        "join_url": join_url,
        "mapping": controller.mapping,
        "name": controller.name,
        "last_states": controller.last_states,
    }
    print(f"[SERVER] Output connected. Controller id: {controller.id}. Join link: {join_url}")

    try:
        await websocket.send_text(json.dumps(info))
    except Exception as e:
        print(f"[{controller.id}] Failed to send initial config: {e}")

    try:
        while True:
            text = await websocket.receive_text()
            try:
                data = json.loads(text)
            except Exception:
                continue

            cmd = data.get("cmd")
            if cmd == "request_restore":
                await websocket.send_text(json.dumps({
                    "type": "restore",
                    "last_states": controller.last_states,
                    "mapping": controller.mapping,
                    "name": controller.name
                }))
            elif cmd == "release":
                async with controllers_lock:
                    controller.output_ws = None
                await websocket.send_text(json.dumps({"type": "released"}))
                break
            elif cmd == "set_name":
                controller.name = data.get("name", controller.name)
                controller.touch()

    except WebSocketDisconnect:
        async with controllers_lock:
            if controller.output_ws is websocket:
                controller.output_ws = None
        print(f"[{controller.id}] Output disconnected. Controller persisted for reconnection.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
