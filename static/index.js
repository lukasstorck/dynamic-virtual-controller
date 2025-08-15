// === Constants ===
const DEFAULT_BUTTON_MAP = {
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

const DEFAULT_COLOR = "#ff6f61";

const STORAGE_NAME_KEY = "dvc_name";
const STORAGE_COLOR_KEY = "dvc_color";

// === Application State ===
let websocket = null;
let selectedOutputId = null;
let groupId = null;
let userId = null;
let userName = null;
let usersList = [];
let outputDevicesList = [];

// === DOM Elements ===
const nameInput = document.getElementById("user-name");
const colorInput = document.getElementById("color");
const groupIdInput = document.getElementById("group-id");

const joinGroupContainer = document.getElementById("join-group-container");
const leaveGroupContainer = document.getElementById("leave-group-container");
const joinGroupButton = document.getElementById("join-btn");
const leaveGroupButton = document.getElementById("leave-btn");
const copyGroupLinkButton = document.getElementById("copy-link-btn");
const copyGroupLinkButtonClickedText = "Copied!";
const copyGroupLinkButtonDefaultText = copyGroupLinkButton.textContent;
const activeGroupIdElement = document.getElementById("active-group-id");

const noUsersElement = document.getElementById("no-users-wrapper");
const usersTableWrapper = document.getElementById("users-table-wrapper");
const usersTableBody = document.getElementById("users-table-body");

const noDevicesElement = document.getElementById("no-devices-wrapper");
const outputDevicesContainer = document.getElementById(
  "output-devices-container"
);

// === Utility Functions ===
function saveUserPreferences(name, color) {
  localStorage.setItem(STORAGE_NAME_KEY, name);
  localStorage.setItem(STORAGE_COLOR_KEY, color);
}

function loadUserPreferences() {
  const storedName = localStorage.getItem(STORAGE_NAME_KEY) || "";
  const storedColor = localStorage.getItem(STORAGE_COLOR_KEY) || DEFAULT_COLOR;
  return { storedName, storedColor };
}

// === WebSocket Handling ===
function connectToGroup(newGroupId) {
  if (websocket) websocket.close();

  let protocol = window.location.protocol === "https:" ? "wss" : "ws";
  let url = `${protocol}://${window.location.host}/ws/user`;
  if (newGroupId) url += `?group_id=${newGroupId}`;
  websocket = new WebSocket(url);

  websocket.onmessage = handleWebSocketMessage;
  websocket.onclose = () => {
    console.info("WebSocket closed");
    handleLeaveGroup();
  };
  websocket.onerror = (error) => {
    console.error("WebSocket error", error);
    handleLeaveGroup();
  };
}

function handleWebSocketMessage(event) {
  const data = JSON.parse(event.data);

  if (data.type === "config") {
    handleConfigMessage(data);
  } else if (data.type === "group_state") {
    handleGroupStateMessage(data);
  } else if (data.type === "output_selected") {
    selectedOutputId = data.id || null;
  }
}

function handleConfigMessage(data) {
  groupId = data.group_id;
  userId = data.user_id;
  activeGroupIdElement.textContent = groupId;

  joinGroupContainer.classList.add("d-none");
  leaveGroupContainer.classList.remove("d-none");

  updateUserData();
}

function handleGroupStateMessage(data) {
  usersList = (data.users || []).map((user) => ({
    id: user.id,
    name: user.name,
    color: user.color,
    lastActivity: user.lastActivity,
    devices: user.selected_output ? [user.selected_output] : [],
  }));

  outputDevicesList = (data.output_devices || []).map((device) => ({
    id: device.id,
    name: device.name,
    connectedUsers: device.connected_users || [],
  }));

  const currentUser = usersList.find((user) => user.id === userId);
  selectedOutputId = currentUser
    ? currentUser.devices[0] || null
    : selectedOutputId;

  renderUsers();
  renderOutputDevices();
}

// === User Data Updates ===
function updateUserData() {
  userName = nameInput.value.trim() || userName;
  const currentColor = colorInput.value;
  saveUserPreferences(userName, currentColor);

  if (websocket?.readyState === WebSocket.OPEN) {
    websocket.send(
      JSON.stringify({
        type: "register",
        name: userName,
        color: currentColor,
      })
    );
  }
}

// === Key Events ===
function sendButtonEvent(event, state) {
  // do not toggle, when editing device name
  if (event.target.contentEditable === "true") return;
  if (!selectedOutputId) return;

  const buttonCode = DEFAULT_BUTTON_MAP[event.code];
  if (!buttonCode) return;

  websocket.send(
    JSON.stringify({
      type: "keypress",
      code: buttonCode,
      state,
    })
  );
}

// === Rendering Functions ===
function renderUsers() {
  usersTableBody.innerHTML = "";

  if (usersList.length === 0) {
    usersTableWrapper.classList.add("d-none");
    noUsersElement.classList.remove("d-none");
    return;
  }

  usersTableWrapper.classList.remove("d-none");
  noUsersElement.classList.add("d-none");

  usersList.forEach((user) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    const nameTag = document.createElement("span");
    nameTag.className = "user-tag";
    nameTag.style.backgroundColor = user.color || "#ccc";
    nameTag.textContent = user.id === userId ? `${user.name} (You)` : user.name;
    nameCell.appendChild(nameTag);

    const activityCell = document.createElement("td");
    activityCell.textContent = user.lastActivity;

    const devicesCell = document.createElement("td");
    devicesCell.textContent = user.devices
      .map(
        (deviceId) =>
          outputDevicesList.find((device) => device.id === deviceId)?.name
      )
      .join(", ");

    row.append(nameCell, activityCell, devicesCell);
    usersTableBody.appendChild(row);
  });
}

function renderOutputDevices() {
  outputDevicesContainer.innerHTML = "";

  if (outputDevicesList.length === 0) {
    outputDevicesContainer.classList.add("d-none");
    noDevicesElement.classList.remove("d-none");
    return;
  }

  outputDevicesContainer.classList.remove("d-none");
  noDevicesElement.classList.add("d-none");

  outputDevicesList.forEach((device) => {
    outputDevicesContainer.appendChild(createDeviceCard(device));
  });
}

function createDeviceCard(device) {
  const column = document.createElement("div");
  column.className = "col-md-4 col-lg-3";

  const card = document.createElement("div");
  card.className = "card h-100 shadow-sm";
  card.style.cursor = "pointer";
  if (selectedOutputId === device.id) {
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
  titleWrapper.className = "d-flex align-items-center w-100 gap-2 mb-2";

  const titleElement = document.createElement("h6");
  titleElement.className = "fw-bold mb-0 flex-grow-1 text-truncate";
  titleElement.contentEditable = "true";
  titleElement.textContent = device.name;

  const saveButton = document.createElement("button");
  saveButton.className =
    "d-inline-flex align-items-center justify-content-center invisible btn btn-outline-success btn-sm flex-shrink-0 px-2 py-0";

  const checkIcon = document.createElement("span");
  checkIcon.className = "material-symbols-outlined";
  checkIcon.textContent = "check";

  titleElement.addEventListener("input", () => {
    if (titleElement.textContent.trim() === device.name) {
      saveButton.classList.add("invisible");
    } else {
      saveButton.classList.remove("invisible");
    }
  });

  // Save on Enter
  titleElement.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault(); // prevent new line
      sendDeviceNameUpdate(device, titleElement, saveButton);
      titleElement.blur();
    }
  });

  // Save on button click
  saveButton.addEventListener("click", (event) => {
    event.stopPropagation();
    sendDeviceNameUpdate(device, titleElement, saveButton);
  });

  saveButton.appendChild(checkIcon);
  titleWrapper.append(titleElement, saveButton);

  const mapButton = document.createElement("button");
  mapButton.className = "btn btn-sm btn-outline-primary mb-2";
  mapButton.textContent = "Open Button Map";
  mapButton.addEventListener("click", (event) => {
    event.stopPropagation();
    alert(`Button map for ${device.name}`);
  });

  const connectedUsersSection = document.createElement("div");
  const connectedUsersLabel = document.createElement("strong");
  connectedUsersLabel.textContent = "Connected Users:";
  connectedUsersSection.appendChild(connectedUsersLabel);

  const userListContainer = document.createElement("div");

  if (device.connectedUsers.length === 0) {
    const noUsersHint = document.createElement("span");
    noUsersHint.className = "text-muted fst-italic small";
    noUsersHint.textContent = "No users connected";
    userListContainer.appendChild(noUsersHint);
  } else {
    device.connectedUsers.forEach((connectedUserId) => {
      const userData = usersList.find((user) => user.id === connectedUserId);
      const userTag = document.createElement("span");
      userTag.className = "user-tag";
      userTag.style.backgroundColor = userData?.color || "#ccc";
      userTag.textContent =
        userData?.id === userId
          ? `${userData.name} (You)`
          : userData?.name || "";
      userListContainer.appendChild(userTag);
    });
  }

  connectedUsersSection.appendChild(userListContainer);

  body.append(titleWrapper, mapButton, connectedUsersSection);
  card.appendChild(body);
  column.appendChild(card);

  return column;
}

function sendDeviceNameUpdate(device, titleElement, saveButton) {
  const newName = titleElement.textContent.trim();
  if (!newName) {
    // do not accept empty name
    titleElement.textContent = device.name;
    return;
  }
  if (newName !== device.name) {
    device.name = newName;
    if (websocket?.readyState === WebSocket.OPEN) {
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

// === Device Selection ===
function toggleDeviceConnection(event, deviceId) {
  // do not toggle, when editing device name
  if (event.target.contentEditable === "true") return;
  if (!websocket || websocket.readyState !== WebSocket.OPEN) return;

  const newTarget = selectedOutputId === deviceId ? null : deviceId;
  websocket.send(JSON.stringify({ type: "select_output", id: newTarget }));
}

// === UI Event Handlers ===
function handleJoinGroup(event) {
  if (event.type === "keydown" && event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  const groupInputValue = groupIdInput.value.trim();
  connectToGroup(groupInputValue || null);
}

function handleLeaveGroup(event) {
  if (event) event.preventDefault();
  if (websocket) {
    websocket.close();
    websocket = null;
  }
  groupId = null;
  activeGroupIdElement.textContent = "";
  usersList = [];
  outputDevicesList = [];
  renderUsers();
  renderOutputDevices();

  joinGroupContainer.classList.remove("d-none");
  leaveGroupContainer.classList.add("d-none");
}

function handleCopyGroupLink(event) {
  event.preventDefault();
  if (!groupId) return;

  const groupLink = `${window.location.origin}/?group_id=${groupId}`;
  navigator.clipboard
    .writeText(groupLink)
    .then(() => {
      copyGroupLinkButton.textContent = copyGroupLinkButtonClickedText;
      setTimeout(() => {
        copyGroupLinkButton.textContent = copyGroupLinkButtonDefaultText;
      }, 1500);
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
    });
}

function removeGroupIdFromUrl() {
  const url = new URL(window.location.href);
  const urlGroupId = url.searchParams.get("group_id");
  if (!urlGroupId) return;

  groupId = urlGroupId.trim();

  const newUrl = `${url.origin}${url.pathname}`;
  window.history.replaceState({}, document.title, newUrl);

  if (groupId) connectToGroup(groupId);
}

// === Event Listeners ===
nameInput.addEventListener("input", updateUserData);
colorInput.addEventListener("input", updateUserData);
joinGroupButton.addEventListener("click", handleJoinGroup);
groupIdInput.addEventListener("keydown", handleJoinGroup);
leaveGroupButton.addEventListener("click", handleLeaveGroup);
copyGroupLinkButton.addEventListener("click", handleCopyGroupLink);

document.addEventListener("keydown", (event) => sendButtonEvent(event, 1));
document.addEventListener("keyup", (event) => sendButtonEvent(event, 0));

window.addEventListener("DOMContentLoaded", () => {
  const { storedName, storedColor } = loadUserPreferences();
  userName = storedName.trim() || `User-${crypto.randomUUID().slice(0, 4)}`;
  nameInput.value = userName;
  colorInput.value = storedColor;
  removeGroupIdFromUrl();
});
