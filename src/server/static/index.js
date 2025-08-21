// === Constants ===
const DEFAULT_COLOR = "#ff6f61";

const STORAGE_NAME_KEY = "dvc_name";
const STORAGE_COLOR_KEY = "dvc_color";

// === Application State ===
let websocket = null;
let selectedOutputDeviceIds = [];
let groupId = null;
let userId = null;
let userName = null;
let usersList = [];
let outputDevicesList = [];
let deviceIdToKeybindsNameMap = {};

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

  const params = new URLSearchParams();
  params.append("name", encodeURIComponent(userName));
  params.append("color", encodeURIComponent(colorInput.value));
  if (newGroupId) params.append("group_id", newGroupId);

  if (params.toString()) url += `?${params.toString()}`;
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
  } else if (data.type === "activity_and_ping") {
    handleActivityAndPingMessage(data);
  } else if (data.type === "ping") {
    websocket.send(
      JSON.stringify({
        type: "pong",
        id: data.id,
      })
    );
  }
}

function handleConfigMessage(data) {
  groupId = data.group_id;
  userId = data.user_id;
  activeGroupIdElement.textContent = groupId;

  joinGroupContainer.classList.add("d-none");
  leaveGroupContainer.classList.remove("d-none");
}

function handleGroupStateMessage(data) {
  usersList = (data.users || []).map((user) => ({
    id: user.id,
    name: user.name,
    color: user.color,
    lastActivity: user.last_activity,
    ping: user.ping,
    selectedOutputDevices: user.selected_output_devices,
  }));

  outputDevicesList = (data.output_devices || []).map((device) => ({
    id: device.id,
    name: device.name,
    connectedUsers: device.connected_users || [],
    keybindPresets: device.keybind_presets || {},
    ping: device.ping,
  }));

  const currentUser = usersList.find((user) => user.id === userId);
  selectedOutputDeviceIds = currentUser?.selectedOutputDevices || [];

  renderUsers();
  renderOutputDevices();
}

function handleActivityAndPingMessage(data) {
  const userUpdates = data.users;
  const outputDeviceUpdates = data.output_devices;

  usersList.forEach((user) => {
    const userUpdate = userUpdates[user.id];
    if (userUpdate) {
      user.lastActivity = userUpdate[0];
      user.ping = userUpdate[1];
    }
  });

  outputDevicesList.forEach((device) => {
    const deviceUpdate = outputDeviceUpdates[device.id];
    if (deviceUpdate) device.ping = deviceUpdate;
  });
}

// === User Data Updates ===
function updateUserData() {
  userName = nameInput.value.trim() || userName;
  const currentColor = colorInput.value;
  saveUserPreferences(userName, currentColor);

  if (websocket?.readyState === WebSocket.OPEN) {
    websocket.send(
      JSON.stringify({
        type: "update_user_data",
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

  for (const deviceId of selectedOutputDeviceIds) {
    const keybindsName = deviceIdToKeybindsNameMap[deviceId];
    const currentDevice = outputDevicesList.find(
      (device) => device.id === deviceId
    );
    const buttonCode = currentDevice?.keybindPresets[keybindsName][event.code];
    if (!buttonCode) continue;

    websocket.send(
      JSON.stringify({
        type: "keypress",
        device_id: currentDevice.id,
        code: buttonCode,
        state,
      })
    );
  }
}

// === Rendering Functions ===
function formatLastActivity(timestamp) {
  const secondsElapsed = Math.floor(Date.now() / 1000 - timestamp);

  if (secondsElapsed < 2) return "just now";

  const hours = Math.floor(secondsElapsed / 3600);
  const minutes = Math.floor((secondsElapsed % 3600) / 60);
  const seconds = secondsElapsed % 60;

  let parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if ((hours === 0 && seconds > 0) || parts.length === 0)
    parts.push(`${seconds}s`);

  return parts.join(" ") + " ago";
}

function formatPing(ping) {
  if (ping == null || isNaN(ping)) return "–";
  return `${Math.round(ping)} ms`;
}

function updateLastActivityFields() {
  document
    .querySelectorAll("#users-table-body td[data-user-id$='-last-activity']")
    .forEach((cell) => {
      const userId = cell.dataset.userId.replace("-last-activity", "");
      const user = usersList.find((user) => user.id === userId);
      if (!isNaN(user.lastActivity)) {
        cell.textContent = formatLastActivity(user.lastActivity);
      }
    });
}

function updatePingFields() {
  // Update user pings
  document
    .querySelectorAll("#users-table-body td[data-user-id$='-ping']")
    .forEach((cell) => {
      const userId = cell.dataset.userId.replace("-ping", "");
      const user = usersList.find((u) => u.id === userId);
      if (user) cell.textContent = formatPing(user.ping);
    });

  // Update device pings
  outputDevicesList.forEach((device) => {
    const el = document.querySelector(`[data-device-id='${device.id}-ping']`);
    if (el) el.textContent = "Ping: " + formatPing(device.ping);
  });
}

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
    nameTag.className = "d-inline-block px-2 py-1 rounded text-white small m-1";
    nameTag.style.backgroundColor = user.color;
    nameTag.textContent = user.id === userId ? `${user.name} (You)` : user.name;
    nameCell.appendChild(nameTag);

    const activityCell = document.createElement("td");
    activityCell.dataset.userId = user.id + "-last-activity";
    activityCell.textContent = formatLastActivity(user.lastActivity);

    const pingCell = document.createElement("td");
    pingCell.dataset.userId = user.id + "-ping";
    pingCell.textContent = formatPing(user.ping);

    const devicesCell = document.createElement("td");
    devicesCell.textContent = user.selectedOutputDevices
      .map(
        (deviceId) =>
          outputDevicesList.find((device) => device.id === deviceId)?.name
      )
      .join(", ");

    row.append(nameCell, activityCell, pingCell, devicesCell);
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
  column.className = "col-md-6 col-lg-5 col-xl-4";

  const card = document.createElement("div");
  card.className = "card h-100 shadow-sm";
  card.style.cursor = "pointer";
  if (selectedOutputDeviceIds.includes(device.id)) {
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
      sendDeviceNameUpdate(device, titleElement);
      titleElement.blur();
    }
  });

  // Save on button click
  saveButton.addEventListener("click", (event) => {
    event.stopPropagation();
    sendDeviceNameUpdate(device, titleElement);
  });

  saveButton.appendChild(checkIcon);
  titleWrapper.append(titleElement, saveButton);

  // === Keybinds selector & edit button ===
  const keybindsWrapper = document.createElement("div");
  keybindsWrapper.className = "d-flex align-items-center gap-2 mb-2";

  const dropdownLabel = document.createElement("label");
  dropdownLabel.className = "form-label mb-0 small text-nowrap";
  dropdownLabel.textContent = "Keybinds:";

  const dropdown = document.createElement("select");
  dropdown.className = "form-select form-select-sm flex-grow-1 mb-0";

  Object.keys(device.keybindPresets).forEach((keybindsName) => {
    const option = document.createElement("option");
    option.value = keybindsName;
    option.textContent = keybindsName;
    if (!deviceIdToKeybindsNameMap[device.id]) {
      deviceIdToKeybindsNameMap[device.id] = keybindsName;
    }

    if (keybindsName === deviceIdToKeybindsNameMap[device.id]) {
      option.selected = true;
    }
    dropdown.appendChild(option);
  });

  dropdown.addEventListener("change", (event) => {
    deviceIdToKeybindsNameMap[device.id] = event.target.value;
    event.target.blur();
  });

  const editButton = document.createElement("button");
  editButton.className =
    "btn btn-sm btn-outline-secondary d-inline-flex align-items-center justify-content-center flex-shrink-0 px-2 py-0";
  const editIcon = document.createElement("span");
  editIcon.className = "material-symbols-outlined";
  editIcon.textContent = "edit";

  editButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const selectedKeybinds = dropdown.value;
    alert(`Edit Keybinds "${selectedKeybinds}" for ${device.name}`);
  });

  editButton.appendChild(editIcon);
  keybindsWrapper.append(dropdownLabel, dropdown, editButton);

  // === Ping display ===
  const pingWrapper = document.createElement("div");
  pingWrapper.className = "small text-muted mb-2";
  pingWrapper.dataset.deviceId = device.id + "-ping";
  pingWrapper.textContent = "Ping: " + formatPing(device.ping);

  // === Connected users ===
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
      userTag.className =
        "d-inline-block px-2 py-1 rounded text-white small m-1";
      userTag.style.backgroundColor = userData.color;
      userTag.textContent =
        userData.id === userId ? `${userData.name} (You)` : userData.name;
      userListContainer.appendChild(userTag);
    });
  }

  connectedUsersSection.appendChild(userListContainer);

  body.append(
    titleWrapper,
    keybindsWrapper,
    pingWrapper,
    connectedUsersSection
  );
  card.appendChild(body);
  column.appendChild(card);

  return column;
}

function sendDeviceNameUpdate(device, titleElement) {
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
  if (["select", "option"].includes(event.target.tagName.toLowerCase())) return;
  if (!websocket || websocket.readyState !== WebSocket.OPEN) return;

  const currentDeviceConnectionState =
    selectedOutputDeviceIds.includes(deviceId);
  // toggle connection state
  websocket.send(
    JSON.stringify({
      type: "select_output",
      id: deviceId,
      state: !currentDeviceConnectionState,
    })
  );
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
  selectedOutputDeviceIds = [];
  groupId = null;
  activeGroupIdElement.textContent = "";
  userId = null;
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
setInterval(() => {
  updateLastActivityFields();
  updatePingFields();
}, 1000);
