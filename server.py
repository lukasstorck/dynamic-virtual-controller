import asyncio
import json
import uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
import datetime

app = FastAPI()

BASE_URL = "http://localhost:8000"  # change if you deploy elsewhere

# --- default mapping (frontend and server agree on the semantic keys) ---
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

# Templates + static
templates = Jinja2Templates(directory="templates")
static_dir = Path(__file__).parent / "static"
if not static_dir.exists():
    static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")


class Controller:
    def __init__(self, controller_id: str = None):
        if controller_id is None:
            controller_id = uuid.uuid4().hex[:8]

        self.id = controller_id
        self.name: str = f"Controller-{controller_id}"
        self.mapping: dict[str, str] = DEFAULT_MAPPING.copy()
        self.last_states: dict[str, int] = {}
        self.input_connections: list[WebSocket] = []
        self.output_ws: WebSocket = None
        self.created_at = datetime.datetime.now(datetime.timezone.utc)
        self.updated_at = datetime.datetime.now(datetime.timezone.utc)

    def touch(self):
        self.updated_at = datetime.datetime.now(datetime.timezone.utc)


controllers: dict[str, Controller] = {}
controllers_lock = asyncio.Lock()


async def get_controller(controller_id: str = None):
    async with controllers_lock:
        if controller_id is None or controller_id not in controllers:
            controller = Controller(controller_id)
            controllers[controller.id] = controller
        return controllers[controller_id]


@app.get("/controller/{controller_id}", response_class=HTMLResponse)
async def controller_page(request: Request, controller_id: str):
    # serve the main client page for a specific controller
    return templates.TemplateResponse("controller.html", {
        "request": request,
        "controller_id": controller_id,
        "ws_input_url": f"ws://{request.client.host}:8000/ws/input/{controller_id}",  # not used by JS, but informative
        "DEFAULT_MAPPING": DEFAULT_MAPPING,
    })


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request, "base_url": BASE_URL})


# --- WebSocket for browser input clients ---
@app.websocket("/ws/input/{controller_id}")
async def ws_input(websocket: WebSocket, controller_id: str):
    """
    Browsers connect here for a given controller id. Many browser clients can connect and send key events.
    """
    await websocket.accept()
    controller = await get_controller(controller_id)
    controller.input_connections.append(websocket)
    controller.touch()
    print(f"[{controller_id}] Input client connected. Total inputs: {len(controller.input_connections)}")

    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                data: dict = json.loads(data_text)
            except Exception:
                print(f"[{controller_id}] Invalid JSON from input client: {data_text}")
                continue

            # Interpret messages by type
            message_type = data.get("type", "keypress")
            if message_type == "keypress":
                # expected fields: code, state (0/1), name (optional)
                code = data.get("code")
                state = int(data.get("state", 0))
                name = data.get("name")
                if name:
                    controller.name = name
                controller.last_states[code] = state
                controller.touch()
                # Forward to output if available
                if controller.output_ws:
                    try:
                        await controller.output_ws.send_text(json.dumps({
                            "type": "key_event",
                            "controller_name": controller.name,
                            "code": code,
                            "state": state
                        }))
                    except Exception as exception:
                        print(f"[{controller_id}] Error forwarding key_event to output: {exception}")
                # Optionally, echo ack back to the input client
                await websocket.send_text(json.dumps({"type": "ack", "code": code, "state": state}))
            elif message_type == "set_name":
                name = data.get("name")
                if name:
                    controller.name = name
                    controller.touch()
                    # notify output
                    if controller.output_ws:
                        await controller.output_ws.send_text(json.dumps({"type": "set_name", "name": name}))
            elif message_type == "map_update":
                mapping = data.get("mapping", {})
                # Validate minimal structure (keys are codes -> mapping names)
                controller.mapping.update(mapping)
                controller.touch()
                # push mapping to output if present
                if controller.output_ws:
                    await controller.output_ws.send_text(json.dumps({"type": "map_update", "mapping": controller.mapping}))
            else:
                print(f"[{controller_id}] unknown input message_type: {message_type} | {data}")
    except WebSocketDisconnect:
        controller.input_connections.remove(websocket)
        print(f"[{controller_id}] Input client disconnected. Remaining inputs: {len(controller.input_connections)}")


# --- WebSocket for output devices (python uinput clients) ---
@app.websocket("/ws/output")
async def ws_output(websocket: WebSocket):
    """
    Output clients connect here. Querystring may include ?controller_id=<id> to re-claim an existing controller.
    If not provided, server creates a new controller id and returns it.
    Server prints the join url to the console.
    """
    # each output client must be able to create or claim a controller
    await websocket.accept()

    requested_id = websocket.query_params.get("controller_id")
    controller = await get_controller(requested_id)

    # Bind this websocket as the output for the controller
    async with controllers_lock:
        controller.output_ws = websocket

    # inform the output client of assigned id, mapping and last state
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
    except Exception as exception:
        print(f"[{controller.id}] Failed to send initial config: {exception}")

    try:
        while True:
            text = await websocket.receive_text()
            # allow outputs to communicate back (e.g., ping, request re-send)
            try:
                data = json.loads(text)
            except Exception:
                continue
            # simple commands: "request_restore", "ping", "release"
            cmd = data.get("cmd")
            if cmd == "request_restore":
                await websocket.send_text(json.dumps({
                    "type": "restore",
                    "last_states": controller.last_states,
                    "mapping": controller.mapping,
                    "name": controller.name
                }))
            elif cmd == "release":
                # output requested to release the controller (but keep state)
                async with controllers_lock:
                    controller.output_ws = None
                await websocket.send_text(json.dumps({"type": "released"}))
                break
            elif cmd == "set_name":
                controller.name = data.get("name", controller.name)
                controller.touch()
            # else ignore
    except WebSocketDisconnect:
        async with controllers_lock:
            # keep controller object, just set output_ws None for persistence
            if controller.output_ws is websocket:
                controller.output_ws = None
        print(f"[{controller.id}] Output disconnected. Controller persisted for reconnection.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
