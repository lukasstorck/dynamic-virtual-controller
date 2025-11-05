import { useCallback, useMemo, useState } from "react";
import { Status, type Device, type SlotPresets, type User } from "../types";
import useWebSocket from "react-use-websocket";

type WebSocketIncomingMessage =
  | { type: "config"; user_id: string; user_name?: string; user_color?: string }
  | {
      type: "group_state";
      group_id: string;
      users?: User[];
      output_devices?: Device[];
    }
  | {
      type: "activity_and_ping";
      users?: Record<string, [number, number]>; //TODO: update with variable names for last activity and ping
      output_devices?: Record<string, number>;
    }
  | { type: "ping"; id: string };

type WebSocketOutgoingMessage =
  | { type: "pong"; id: string }
  | { type: "join_group"; group_id: string }
  | { type: "leave_group" }
  | { type: "rename_output"; id: string; name: string }
  | { type: "select_output"; id: string; state: boolean }
  | { type: "update_user_data"; name: string; color: string }
  | { type: "keypress"; device_id: string; code: string; state: number };

const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const websocketUrl = `${protocol}://${window.location.host}/ws/user`;

export function useConnectionManager({
  setSlotPresets,
  lastGroupId,
  setLastGroupId,
  setUserName,
  setUserColor,
}: {
  setSlotPresets: React.Dispatch<React.SetStateAction<SlotPresets>>;
  lastGroupId: string;
  setLastGroupId: React.Dispatch<React.SetStateAction<string>>;
  setUserName: React.Dispatch<React.SetStateAction<string>>;
  setUserColor: React.Dispatch<React.SetStateAction<string>>;
}) {
  const { sendJsonMessage } = useWebSocket(websocketUrl, {
    onOpen: () => {
      setConnectionStatus(Status.Connected);

      if (lastGroupId) handleJoinGroup(lastGroupId);
    },
    onClose: (_) => {
      setConnectionStatus(Status.Disconnected);

      setUsers([]);
      setDevices([]);
    },
    onMessage: (event) => handleWebSocketMessage(event),
    shouldReconnect: (_) => true,
  });

  const [connectionStatus, setConnectionStatus] = useState(Status.Disconnected);
  const [userId, setUserId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);

  const user = useMemo(() => {
    if (!userId) return null;
    return users.find((user) => user.id === userId) || null;
  }, [userId, users]);

  const { devicesById, devicesBySlot } = useMemo(() => {
    const byId: Record<string, Device> = {};
    const bySlot: Record<number, Device> = {};

    devices.forEach((device) => {
      byId[device.id] = device;
      bySlot[device.slot] = device;
    });

    return { devicesById: byId, devicesBySlot: bySlot };
  }, [devices]);

  const sendMessage = useCallback(
    (data: WebSocketOutgoingMessage) => {
      sendJsonMessage(data);
    },
    [sendJsonMessage]
  );

  const handleConfigMessage = useCallback(
    (data: Extract<WebSocketIncomingMessage, { type: "config" }>) => {
      if (data.user_id) setUserId(data.user_id);
      if (data.user_name) setUserName(data.user_name);
      if (data.user_color) setUserColor(data.user_color);
    },
    [setUserId, setUserName, setUserColor]
  );

  const handleGroupStateMessage = useCallback(
    (data: Extract<WebSocketIncomingMessage, { type: "group_state" }>) => {
      setGroupId(data.group_id);

      // update users
      setUsers(data.users || []);

      // update devices
      const updatedDevices = data.output_devices!.map((device) => {
        // assemble list of users that are connected to this device
        // then create a list of user ids or an empty list
        const connected_user_ids = // TODO: fix case in js object
          data.users
            ?.filter((user) => user.selected_output_devices.includes(device.id))
            .map((user) => user.id) || [];

        return {
          ...device,
          connected_user_ids: connected_user_ids, // TODO: fix case in js object
        };
      });

      // update slot presets
      setSlotPresets((prevSlotPresets) => {
        const updatedSlotPresets = { ...prevSlotPresets };

        data.output_devices?.forEach((device) => {
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

      updatedDevices.sort((a, b) => a.slot - b.slot);
      setDevices(updatedDevices || []);
    },
    [setGroupId, setUsers, setSlotPresets, setDevices]
  );

  const handleActivityAndPingUpdateMessage = useCallback(
    (
      data: Extract<WebSocketIncomingMessage, { type: "activity_and_ping" }>
    ) => {
      // update ping and activity for users
      setUsers((prevUsers) =>
        prevUsers.map((user) => {
          const updatedLastActivity = data.users?.[user.id][0];
          const updatedPing = data.users?.[user.id][1];
          return {
            ...user,
            lastActivity: updatedLastActivity || user.last_activity,
            ping: updatedPing || null,
          };
        })
      );

      // update ping for devices
      setDevices((prevDevices) =>
        prevDevices.map((device) => {
          const updatedPing = data.output_devices?.[device.id];
          return { ...device, ping: updatedPing || null };
        })
      );
    },
    [setUsers, setDevices]
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
        case "config":
          handleConfigMessage(data);
          break;
        case "group_state":
          handleGroupStateMessage(data);
          break;
        case "activity_and_ping":
          handleActivityAndPingUpdateMessage(data);
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
      handleConfigMessage,
      handleGroupStateMessage,
      handleActivityAndPingUpdateMessage,
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
    [sendMessage, connectionStatus, setConnectionStatus, setLastGroupId]
  );

  const handleLeaveGroup = useCallback(() => {
    sendMessage({
      type: "leave_group",
    });

    setUsers([]);
    setDevices([]);
    setLastGroupId("");

    setConnectionStatus((previousStatus) => {
      return previousStatus == Status.JoinedGroup
        ? Status.Connected
        : previousStatus;
    });
  }, [sendMessage, setConnectionStatus]);

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
        presetName in devicesBySlot[deviceSlot].keybind_presets
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
    if (user?.selected_output_devices.includes(deviceId) === state) return;

    sendMessage({
      type: "select_output",
      id: deviceId,
      state: state,
    });
  };

  return {
    connectionStatus,
    userId,
    setUserId,
    groupId,
    setGroupId,
    users,
    setUsers,
    devices,
    setDevices,
    user,
    devicesById,
    devicesBySlot,
    handleJoinGroup,
    handleLeaveGroup,
    handleRenameOutput,
    handleSelectKeybindPreset,
    handleSelectOutput,
    sendMessage,
  };
}
