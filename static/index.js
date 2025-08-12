const KEY_TO_BUTTON = {
  KeyW: "BTN_DPAD_UP",
  KeyA: "BTN_DPAD_LEFT",
  KeyS: "BTN_DPAD_DOWN",
  KeyD: "BTN_DPAD_RIGHT",
  KeyE: "BTN_A",
  KeyQ: "BTN_B",
  KeyX: "BTN_X",
  KeyY: "BTN_Y",
  Tab: "BTN_TL",
  KeyR: "BTN_TR",
  Escape: "BTN_START",
  Space: "BTN_A",
  KeyZ: "BTN_Y",
  KeyF: "BTN_Y",
};

let websocket = null;
let selectedOutput = null;
let groupId = null;
let currentUser = null;
let inputClients = [];
let outputDevices = [];

// Color palette for clients
const clientColors = [
  "#ff6f61",
  "#6b5b95",
  "#88b04b",
  "#f7cac9",
  "#92a8d1",
  "#955251",
  "#b565a7",
  "#009b77",
];
const clientColorMap = new Map();

// ==== DOM Elements ====
const joinBtn = document.getElementById("join-btn");
const nameInput = document.getElementById("name");
const groupIdInput = document.getElementById("group-id");
const clientsTableBody = document.querySelector("#clients-table-body");
const outputDevicesContainer = document.querySelector(
  "#output-devices-container"
);

// ==== Helpers ====
function getClientColor(name) {
  if (!clientColorMap.has(name)) {
    const color = clientColors[clientColorMap.size % clientColors.length];
    clientColorMap.set(name, color);
  }
  return clientColorMap.get(name);
}

// ==== WebSocket Connection ====
function connectToGroup(gid) {
  // close previous connection, if there is one
  if (websocket) websocket.close();
  websocket = new WebSocket(
    `ws://${window.location.host}/ws/input?group_id=${gid}`
  );

  websocket.onopen = () => {
    const displayName =
      nameInput.value.trim() || `User-${crypto.randomUUID().slice(0, 4)}`;
    currentUser = displayName;
    websocket.send(JSON.stringify({ type: "register", name: displayName }));
  };

  websocket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "group_state") {
      inputClients = (data.input_clients || []).map((inputClient) => ({
        id: inputClient.input_id,
        name: inputClient.name,
        lastActivity: inputClient.lastActivity,
        devices: inputClient.selected_output
          ? [inputClient.selected_output]
          : [],
      }));

      outputDevices = (data.output_devices || []).map((outputDevice) => ({
        id: outputDevice.output_id,
        name: outputDevice.name,
        connectedClients: outputDevice.connected_inputs || [],
      }));

      const currentClient = inputClients.find(
        (inputClient) => inputClient.name === currentUser
      );
      selectedOutput = currentClient
        ? currentClient.devices[0] || null
        : selectedOutput;

      renderInputClients();
      renderOutputDevices();
    } else if (data.type === "output_selected") {
      selectedOutput = data.output_id || null;
    }
  };
}

// ==== Event Sending ====
function sendButtonEvent(code, state) {
  if (!selectedOutput) return;
  const btn = KEY_TO_BUTTON[code];
  if (!btn) return;
  websocket.send(JSON.stringify({ type: "keypress", code: btn, state }));
}

document.addEventListener("keydown", (event) => sendButtonEvent(event.code, 1));
document.addEventListener("keyup", (event) => sendButtonEvent(event.code, 0));

// ==== UI Rendering ====
function renderInputClients() {
  clientsTableBody.innerHTML = "";
  inputClients.forEach((client) => {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    const tag = document.createElement("span");
    tag.className = "client-tag";
    tag.style.backgroundColor = getClientColor(client.name);
    tag.textContent = client.name;
    tdName.appendChild(tag);

    const tdActivity = document.createElement("td");
    tdActivity.textContent = client.lastActivity;

    const tdDevices = document.createElement("td");
    tdDevices.textContent = client.devices.join(", ");

    tr.append(tdName, tdActivity, tdDevices);
    clientsTableBody.appendChild(tr);
  });
}

function renderOutputDevices() {
  outputDevicesContainer.innerHTML = "";
  outputDevices.forEach((device) => {
    const col = document.createElement("div");
    col.className = "col-md-4 col-lg-3";

    const card = document.createElement("div");
    card.className = "card h-100 shadow-sm";
    card.style.cursor = "pointer";
    if (selectedOutput === device.id) {
      card.classList.add("border-3");
      card.style.boxShadow = "0 0 0 0.25rem rgba(13,110,253,0.12)";
    }
    card.addEventListener("click", (event) =>
      toggleDeviceConnection(event, device.id)
    );

    const body = document.createElement("div");
    body.className = "card-body";

    const title = document.createElement("h6");
    title.className = "fw-bold";
    title.contentEditable = "true";
    title.textContent = device.name;

    const idInfo = document.createElement("p");
    idInfo.className = "text-muted";
    idInfo.textContent = `ID: ${device.id}`;

    const btn = document.createElement("button");
    btn.className = "btn btn-sm btn-outline-primary mb-2";
    btn.textContent = "Open Button Map";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      alert(`Button map for ${device.name}`);
    });

    const clientsDiv = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = "Connected Clients:";
    clientsDiv.appendChild(strong);

    const clientsList = document.createElement("div");
    device.connectedClients.forEach((clientName) => {
      const tag = document.createElement("span");
      tag.className = "client-tag";
      tag.style.backgroundColor = getClientColor(clientName);
      tag.textContent = clientName;
      clientsList.appendChild(tag);
    });

    clientsDiv.appendChild(clientsList);
    body.append(title, idInfo, btn, clientsDiv);
    card.appendChild(body);
    col.appendChild(card);
    outputDevicesContainer.appendChild(col);
  });
}

// ==== Device Selection ====
function toggleDeviceConnection(event, deviceId) {
  // do not toggle, when editing device name
  if (event.target.contentEditable === "true") return;

  if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
  const newTarget = selectedOutput === deviceId ? null : deviceId;
  websocket.send(
    JSON.stringify({ type: "select_output", output_id: newTarget })
  );
}

// ==== Initial Load ====
joinBtn.addEventListener("click", () => {
  const gid =
    groupIdInput.value.trim() ||
    `group_${crypto.randomUUID().replaceAll("-", "")}`;
  connectToGroup(gid);
});

window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const urlGroupId = params.get("group_id");
  if (urlGroupId) {
    window.history.replaceState({}, document.title, window.location.pathname);
    groupId = urlGroupId.trim();
    connectToGroup(groupId);
  }
});
