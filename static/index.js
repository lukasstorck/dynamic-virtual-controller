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

let ws = null;
let selectedOutput = null;
let groupId = null;

document.getElementById("join-btn").addEventListener("click", () => {
  joinFromInput();
});

function joinFromInput() {
  groupId = document.getElementById("group_id").value.trim();
  if (!groupId) {
    groupId = "group_" + crypto.randomUUID().replace(/-/g, "");
  }
  connectToGroup(groupId);
}

function connectToGroup(gid) {
  ws = new WebSocket(`ws://${window.location.host}/ws/input?group_id=${gid}`);

  ws.onopen = () => {
    document.getElementById("group-section").classList.remove("d-none");
    document.getElementById("join-section").classList.add("d-none");
    document.getElementById("status").innerText = "Connected to group " + gid;
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "welcome") {
      populateOutputs(data.available_outputs);
    } else if (data.type === "output_available") {
      addOutputOption(data.output_id);
    } else if (data.type === "output_unavailable") {
      removeOutputOption(data.output_id);
    } else if (data.type === "output_selected") {
      selectedOutput = data.output_id;
    }
  };
}

function populateOutputs(outputs) {
  const sel = document.getElementById("output-select");
  sel.innerHTML = `<option value="">-- No output selected --</option>`;
  outputs.forEach((o) => addOutputOption(o));
}

function addOutputOption(outputId) {
  const sel = document.getElementById("output-select");
  if (!Array.from(sel.options).some((opt) => opt.value === outputId)) {
    const opt = document.createElement("option");
    opt.value = outputId;
    opt.text = outputId;
    sel.appendChild(opt);
  }
}

function removeOutputOption(outputId) {
  const sel = document.getElementById("output-select");
  sel
    .querySelectorAll(`option[value="${outputId}"]`)
    .forEach((opt) => opt.remove());
}

document.getElementById("output-select").addEventListener("change", (event) => {
  selectedOutput = event.target.value;
  if (selectedOutput) {
    ws.send(
      JSON.stringify({
        type: "select_output",
        output_id: selectedOutput,
      })
    );
  }
});

function sendButtonEvent(code, state) {
  if (!selectedOutput) return;
  const btn = KEY_TO_BUTTON[code];
  if (!btn) return;
  ws.send(
    JSON.stringify({
      type: "keypress",
      code: btn,
      state: state,
    })
  );
}

document.addEventListener("keydown", (event) => {
  sendButtonEvent(event.code, 1);
});

document.addEventListener("keyup", (event) => {
  sendButtonEvent(event.code, 0);
});

window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const urlGroupId = params.get("group_id");
  if (urlGroupId) {
    // remove id from URL
    window.history.replaceState({}, document.title, window.location.pathname);
    groupId = urlGroupId.trim();
    connectToGroup(groupId);
  }
});
