import { useCallback, useMemo, useRef, useState } from "react";
import type { Device, SlotPresets, User } from "../types";

type WebSocketIncomingMessage =
  | { type: "config"; user_id: string; group_id: string }
  | { type: "group_state"; users?: User[]; output_devices?: Device[] }
  | {
      type: "activity_and_ping";
      users?: Record<string, [number, number]>; //TODO: update with variable names for last activity and ping
      output_devices?: Record<string, number>;
    }
  | { type: "ping"; id: string };

type WebSocketOutgoingMessage =
  | { type: "pong"; id: string }
  | { type: "rename_output"; id: string; name: string }
  | { type: "select_output"; id: string; state: boolean }
  | { type: "update_user_data"; name: string; color: string }
  | { type: "keypress"; device_id: string; code: string; state: number };

export function useConnectionManager({
  setSlotPresets,
  setLastGroupId,
}: {
  setSlotPresets: React.Dispatch<React.SetStateAction<SlotPresets>>;
  setLastGroupId: React.Dispatch<React.SetStateAction<string>>;
}) {
  const websocketRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
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

  const sendMessage = useCallback((data: WebSocketOutgoingMessage) => {
    const socket = websocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.error(`Sending message ${data} failed: socket is not open`);
      return;
    }
    socket.send(JSON.stringify(data));
  }, []);

  const handleConfigMessage = useCallback(
    (data: Extract<WebSocketIncomingMessage, { type: "config" }>) => {
      if (data.group_id) setGroupId(data.group_id);
      if (data.user_id) setUserId(data.user_id);
    },
    []
  );

  const handleGroupStateMessage = useCallback(
    (data: Extract<WebSocketIncomingMessage, { type: "group_state" }>) => {
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
    []
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
    []
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

  const handleLeaveGroup = useCallback(() => {
    if (websocketRef.current) websocketRef.current.close();
  }, []);

  const openConnection = useCallback(
    (userName: string, userColor: string, groupId: string) => {
      // TODO: actually connect only once and then handle user name/color and group joining/leaving via messages (like with devices on server side)

      // close previous connection, if any
      handleLeaveGroup();

      // assemble websocket url
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      let url = `${protocol}://${window.location.host}/ws/user`;
      const params = new URLSearchParams({
        name: encodeURIComponent(userName), // TODO: is encode encodeURIComponent() needed in URLSearchParams
        color: encodeURIComponent(userColor),
        group_id: encodeURIComponent(groupId), // TODO: check if also on server side is uri encoded
      }).toString();

      // initialize new connection
      const socket = new WebSocket(params ? `${url}?${params}` : url);
      socket.onmessage = handleWebSocketMessage;
      socket.onopen = () => {
        setIsConnected(true);
        setLastGroupId(groupId);
        console.info("WebSocket opened");
      };
      socket.onerror = (event) => console.error("WebSocket error:", event);
      socket.onclose = () => {
        setIsConnected(false);
        // websocketRef.current = null; // TODO: this leads to errors when reloading as some message (like ping) are send the old socket which is now null
        // TODO: it seems that the old connection is sometimes still active and was not closed, as sometimes there are duplicated devices and also two connections on the server

        // reset state
        setUsers([]);
        setDevices([]);
        setLastGroupId(""); // TODO: only reset las group id when actively leaving the server, not on reload, page close or when losing the connection

        console.info("WebSocket closed");
      };

      websocketRef.current = socket;
    },
    [handleLeaveGroup, handleWebSocketMessage]
  );

  const handleRenameOutput = (deviceId: string, newName: string) => {
    if (!isConnected) return;
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
    if (!isConnected) return;
    if (user?.selected_output_devices.includes(deviceId) === state) return;

    sendMessage({
      type: "select_output",
      id: deviceId,
      state: state,
    });
  };

  return {
    isConnected,
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
    handleLeaveGroup,
    openConnection,
    handleRenameOutput,
    handleSelectKeybindPreset,
    handleSelectOutput,
    sendMessage,
  };
}
