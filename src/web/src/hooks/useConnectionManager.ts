import { useCallback, useMemo, useReducer, useState } from "react";
import {
  Status,
  type Device,
  type GroupState,
  type GroupUpdateAction,
  type Keybind,
  type SlotPresets,
  type WebSocketIncomingMessage,
  type WebSocketMessageKeybind,
  type WebSocketOutgoingMessage,
} from "../types";
import useWebSocket from "react-use-websocket";

const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const websocketUrl = `${protocol}://${window.location.host}/ws/user`;

function groupStateReducer(state: GroupState, action: GroupUpdateAction) {
  switch (action.type) {
    case "clear":
      return { users: [], devices: [] };
    case "set_users_and_devices":
      return { users: action.users, devices: action.devices };
    case "activity_and_ping":
      state.users.forEach((user, index) => {
        if (action.users && user.id in action.users) {
          const updatedLastActivity = action.users?.[user.id][0];
          const updatedPing = action.users?.[user.id][1];

          state.users[index].lastActivityTime =
            updatedLastActivity || user.lastActivityTime;
          state.users[index].lastPing = updatedPing || null;
        }
      });
      state.devices.forEach((device, index) => {
        if (action.devices && device.id in action.devices) {
          const updatedPing = action.devices?.[device.id];

          state.devices[index].lastPing = updatedPing || null;
        }
      });
      return state;
    default:
      return state;
  }
}

interface UseConnectionManagerProps {
  lastGroupId: string;
  setLastGroupId: React.Dispatch<React.SetStateAction<string>>;
  setSlotPresets: React.Dispatch<React.SetStateAction<SlotPresets>>;
  setUserColor: React.Dispatch<React.SetStateAction<string>>;
  setUserName: React.Dispatch<React.SetStateAction<string>>;
}

export function useConnectionManager({
  lastGroupId,
  setLastGroupId,
  setSlotPresets,
  setUserColor,
  setUserName,
}: UseConnectionManagerProps) {
  const { sendJsonMessage } = useWebSocket(websocketUrl, {
    onOpen: () => {
      setConnectionStatus(Status.Connected);

      if (lastGroupId) handleJoinGroup(lastGroupId);
    },
    onClose: (_) => {
      setConnectionStatus(Status.Disconnected);

      updateGroupState({ type: "clear" });
    },
    onMessage: (event) => handleWebSocketMessage(event),
    shouldReconnect: (_) => true,
  });

  const [connectionStatus, setConnectionStatus] = useState(Status.Disconnected);
  const [userId, setUserId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState("");
  const [groupState, updateGroupState] = useReducer(groupStateReducer, {
    users: [],
    devices: [],
  });

  const user = useMemo(() => {
    if (!userId) return null;
    return groupState.users.find((user) => user.id === userId) || null;
  }, [userId, groupState]);

  const { devicesById, devicesBySlot } = useMemo(() => {
    const byId: Record<string, Device> = {};
    const bySlot: Record<number, Device> = {};

    groupState.devices.forEach((device) => {
      byId[device.id] = device;
      bySlot[device.slot] = device;
    });

    return { devicesById: byId, devicesBySlot: bySlot };
  }, [groupState]);

  const sendMessage = useCallback(
    (data: WebSocketOutgoingMessage) => {
      sendJsonMessage(data);
    },
    [sendJsonMessage]
  );

  const handleActivityAndPingUpdateMessage = useCallback(
    (
      data: Extract<WebSocketIncomingMessage, { type: "activity_and_ping" }>
    ) => {
      updateGroupState(data);
    },
    []
  );

  const handleConfigMessage = useCallback(
    (data: Extract<WebSocketIncomingMessage, { type: "config" }>) => {
      if (data.user_id) setUserId(data.user_id);
      if (data.user_name) setUserName(data.user_name);
      if (data.user_color) setUserColor(data.user_color);
    },
    [setUserColor, setUserId, setUserName]
  );

  const handleGroupStateMessage = useCallback(
    (data: Extract<WebSocketIncomingMessage, { type: "group_state" }>) => {
      setGroupId(data.group_id);

      // cast users to User[]
      const users =
        data.users?.map((user) => ({
          id: user.id,
          name: user.name,
          color: user.color,
          connectedDeviceIds: user.connected_device_ids,
          lastActivityTime: user.last_activity_time,
          lastPing: user.last_ping,
        })) || [];

      // cast devices to Device[]
      const devices =
        data.devices?.map((device) => {
          // assemble list of users that are connected to this device
          // then create a list of user ids or an empty list
          const connectedUserIds =
            data.users
              ?.filter((user) => user.connected_device_ids.includes(device.id))
              .map((user) => user.id) || [];

          const keybindPresets: Record<string, Keybind[]> = Object.fromEntries(
            Object.entries(device.keybind_presets).map(
              ([presetName, keybinds]) => [
                presetName,
                keybinds.map(
                  ([key, event]: WebSocketMessageKeybind): Keybind => ({
                    key: key || null,
                    event: event || null,
                  })
                ),
              ]
            )
          );

          return {
            id: device.id,
            name: device.name,
            slot: device.slot,
            keybindPresets: keybindPresets,
            allowedEvents: device.allowed_events,
            lastPing: device.last_ping,
            connectedUserIds: connectedUserIds,
          };
        }) || [];

      // update slot presets
      setSlotPresets((prevSlotPresets) => {
        const updatedSlotPresets = { ...prevSlotPresets };

        data.devices?.forEach((device) => {
          if (device.slot in updatedSlotPresets) {
            if (
              updatedSlotPresets[device.slot] !== "None" &&
              !(updatedSlotPresets[device.slot] in device.keybind_presets)
            ) {
              // stored preset name is not available in device presets -> reset
              delete updatedSlotPresets[device.slot];
            }
          }

          // when no slot preset is stored (or if it was recently reset)
          // -> set to "default", the first keybind preset or "None"
          if (!(device.slot in updatedSlotPresets)) {
            updatedSlotPresets[device.slot] =
              "default" in device.keybind_presets
                ? "default"
                : Object.keys(device.keybind_presets)[0] || "None";
          }
        });

        return updatedSlotPresets;
      });

      devices.sort((a, b) => a.slot - b.slot);
      updateGroupState({
        type: "set_users_and_devices",
        users: users,
        devices: devices,
      });
    },
    [setGroupId, setSlotPresets]
  );

  const handlePingRequestMessage = useCallback(
    (data: Extract<WebSocketIncomingMessage, { type: "ping" }>) => {
      sendMessage({ type: "pong", id: data.id });
    },
    [sendMessage]
  );

  const handleWebSocketMessage = useCallback(
    (event: MessageEvent) => {
      const data: WebSocketIncomingMessage = JSON.parse(event.data);
      switch (data.type) {
        case "activity_and_ping":
          handleActivityAndPingUpdateMessage(data);
          break;
        case "config":
          handleConfigMessage(data);
          break;
        case "group_state":
          handleGroupStateMessage(data);
          break;
        case "ping":
          handlePingRequestMessage(data);
          break;
        default:
          console.warn("Unknown WebSocket message:", data);
          break;
      }
    },
    [
      handleActivityAndPingUpdateMessage,
      handleConfigMessage,
      handleGroupStateMessage,
      handlePingRequestMessage,
    ]
  );

  const handleJoinGroup = useCallback(
    (groupId: string) => {
      sendMessage({
        type: "join_group",
        group_id: groupId,
      });

      setConnectionStatus((previousStatus) => {
        return previousStatus == Status.Connected
          ? Status.JoinedGroup
          : previousStatus;
      });
      setLastGroupId(groupId);
    },
    [connectionStatus, setConnectionStatus, setLastGroupId, sendMessage]
  );

  const handleLeaveGroup = useCallback(() => {
    sendMessage({
      type: "leave_group",
    });

    updateGroupState({ type: "clear" });
    setLastGroupId("");

    setConnectionStatus((previousStatus) => {
      return previousStatus == Status.JoinedGroup
        ? Status.Connected
        : previousStatus;
    });
  }, [setConnectionStatus, sendMessage]);

  const handleRenameOutput = (deviceId: string, newName: string) => {
    if (connectionStatus !== Status.JoinedGroup) return;
    if (!(deviceId in devicesById)) return;
    if (devicesById[deviceId].name === newName) return;
    if (newName.trim() === "") return;

    sendMessage({
      type: "rename_output",
      id: deviceId,
      name: newName.trim(),
    });
  };

  const handleSelectKeybindPreset = (
    deviceSlot: number,
    presetName: string
  ) => {
    if (!(deviceSlot in devicesBySlot)) return;
    if (
      !(
        presetName === "None" ||
        presetName in devicesBySlot[deviceSlot].keybindPresets
      )
    )
      return;

    setSlotPresets((prevSlotPresets) => {
      const newSlotPresets = {
        ...prevSlotPresets,
      };
      newSlotPresets[deviceSlot] = presetName;
      return newSlotPresets;
    });
  };

  const handleSelectOutput = (deviceId: string, state: boolean) => {
    if (connectionStatus !== Status.JoinedGroup) return;
    if (user?.connectedDeviceIds.includes(deviceId) === state) return;

    sendMessage({
      type: "select_output",
      id: deviceId,
      state: state,
    });
  };

  return {
    connectionStatus,
    devicesById,
    devicesBySlot,
    groupId,
    setGroupId,
    groupState,
    handleJoinGroup,
    handleLeaveGroup,
    handleRenameOutput,
    handleSelectKeybindPreset,
    handleSelectOutput,
    sendMessage,
    user,
    userId,
    setUserId,
  };
}
