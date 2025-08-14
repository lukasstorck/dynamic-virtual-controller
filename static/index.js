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
let inputClientId = null;
let currentUser = null;
let inputClients = [];
let outputDevices = [];

// ==== DOM Elements ====
const nameInput = document.getElementById("name");
const colorInput = document.getElementById("color");
const groupIdInput = document.getElementById("group-id");

const joinContainer = document.getElementById("join-group-container");
const leaveContainer = document.getElementById("leave-group-container");
const joinBtn = document.getElementById("join-btn");
const leaveBtn = document.getElementById("leave-btn");
const activeGroupIdElement = document.getElementById("active-group-id");

const clientsTableBody = document.getElementById("clients-table-body");
const outputDevicesContainer = document.getElementById(
  "output-devices-container"
);

// ==== WebSocket Connection ====
function updateUserData(event = null) {
  currentUser = nameInput.value.trim() || currentUser;
  currentColor = colorInput.value;
  localStorage.setItem("dvc_name", currentUser);
  localStorage.setItem("dvc_color", currentColor);

  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(
      JSON.stringify({
        type: "register",
        name: currentUser,
        color: currentColor,
      })
    );
  }
}

function connectToGroup(new_group_id) {
  // close previous connection, if there is one
  if (websocket) websocket.close();
  websocket = new WebSocket(
    `ws://${window.location.host}/ws/input?group_id=${new_group_id}`
  );

  websocket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "config") {
      groupId = data.group_id;
      inputClientId = data.input_client_id;
      activeGroupIdElement.textContent = groupId;
      joinContainer.classList.add("d-none");
      leaveContainer.classList.remove("d-none");
      updateUserData();
    } else if (data.type === "group_state") {
      inputClients = (data.input_clients || []).map((inputClient) => ({
        id: inputClient.id,
        name: inputClient.name,
        color: inputClient.color,
        lastActivity: inputClient.lastActivity,
        devices: inputClient.selected_output
          ? [inputClient.selected_output]
          : [],
      }));

      outputDevices = (data.output_devices || []).map((outputDevice) => ({
        id: outputDevice.id,
        name: outputDevice.name,
        connectedClients: outputDevice.connected_inputs || [],
      }));

      const currentClient = inputClients.find(
        (inputClient) => inputClient.id === inputClientId
      );
      selectedOutput = currentClient
        ? currentClient.devices[0] || null
        : selectedOutput;

      renderInputClients();
      renderOutputDevices();
    } else if (data.type === "output_selected") {
      selectedOutput = data.id || null;
    }
  };
}

// ==== Event Sending ====
function sendButtonEvent(event, state) {
  // do not toggle, when editing device name
  if (event.target.contentEditable === "true") return;

  if (!selectedOutput) return;
  const btn = KEY_TO_BUTTON[event.code];
  if (!btn) return;
  websocket.send(JSON.stringify({ type: "keypress", code: btn, state }));
}

document.addEventListener("keydown", (event) => sendButtonEvent(event, 1));
document.addEventListener("keyup", (event) => sendButtonEvent(event, 0));

// ==== UI Rendering ====
function renderInputClients() {
  clientsTableBody.innerHTML = "";
  inputClients.forEach((client) => {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    const tag = document.createElement("span");
    tag.className = "client-tag";
    tag.style.backgroundColor = client.color || "#ccc";
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

    // Editable title
    const titleWrapper = document.createElement("div");
    titleWrapper.className = "d-flex align-items-center w-100 gap-2";

    const title = document.createElement("h6");
    title.className = "fw-bold mb-0 flex-grow-1 text-truncate";
    title.contentEditable = "true";
    title.textContent = device.name;

    let originalName = device.name;

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "✔";
    saveBtn.className = "btn btn-success btn-sm";
    saveBtn.classList.add("flex-shrink-0", "px-2", "py-0");
    saveBtn.style.display = "none"; // hidden until change

    function updateSaveButtonVisibility() {
      saveBtn.style.display =
        title.textContent.trim() !== originalName ? "inline-block" : "none";
    }

    function sendNameUpdate() {
      const newName = title.textContent.trim();
      if (newName && newName !== originalName) {
        originalName = newName;
        saveBtn.style.display = "none";
        device.name = newName;

        if (websocket && websocket.readyState === WebSocket.OPEN) {
          websocket.send(
            JSON.stringify({
              type: "rename_output",
              id: device.id,
              name: newName,
            })
          );
        }
      }
    }

    title.addEventListener("input", updateSaveButtonVisibility);

    // Save on Enter
    title.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault(); // prevent new line
        sendNameUpdate();
        title.blur(); // optional: remove focus
      }
    });

    // Save on button click
    saveBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      sendNameUpdate();
    });

    titleWrapper.append(title, saveBtn);

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
      const clientData = inputClients.find((c) => c.name === clientName);
      const tag = document.createElement("span");
      tag.className = "client-tag";
      tag.style.backgroundColor = clientData?.color || "#ccc";
      tag.textContent = clientName;
      clientsList.appendChild(tag);
    });

    clientsDiv.appendChild(clientsList);
    body.append(titleWrapper, idInfo, btn, clientsDiv);
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
  websocket.send(JSON.stringify({ type: "select_output", id: newTarget }));
}

// ==== Initial Load ====
function handleJoinGroupButton(event) {
  event.preventDefault();
  const group_id = groupIdInput.value.trim();
  connectToGroup(group_id || null);
}

function handleLeaveGroupButton(event) {
  event.preventDefault();
  if (websocket) {
    websocket.close();
    websocket = null;
  }

  groupId = null;
  activeGroupIdElement.textContent = "";
  inputClients = [];
  outputDevices = [];
  renderInputClients();
  renderOutputDevices();

  joinContainer.classList.remove("d-none");
  leaveContainer.classList.add("d-none");
}

function removeGroupIdFromURL() {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  const urlGroupId = params.get("group_id");
  if (urlGroupId === null) return;
  groupId = urlGroupId.trim();

  const newUrl = `${url.origin}${url.pathname}`;
  window.history.replaceState({}, document.title, newUrl);

  if (groupId) connectToGroup(groupId);
}

function loadDataFromLocalStorage() {
  const savedName = localStorage.getItem("dvc_name");
  const savedColor = localStorage.getItem("dvc_color");

  if (savedName) {
    nameInput.value = savedName;
    currentUser = savedName;
  }
  if (savedColor) {
    colorInput.value = savedColor;
    currentColor = savedColor;
  }
}

nameInput.addEventListener("input", updateUserData);
colorInput.addEventListener("input", updateUserData);
joinBtn.addEventListener("click", handleJoinGroupButton);
leaveBtn.addEventListener("click", handleLeaveGroupButton);
window.addEventListener("DOMContentLoaded", () => {
  currentUser =
    nameInput.value.trim() ||
    localStorage.getItem("dvc_name") ||
    `User-${crypto.randomUUID().slice(0, 4)}`;
  currentColor =
    colorInput.value || localStorage.getItem("dvc_color") || "#ff6f61";
  removeGroupIdFromURL();
  loadDataFromLocalStorage();
});
