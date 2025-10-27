import { useCallback, useMemo, useRef, useState } from "react";
import type { Device, SlotPresets, User } from "../types";

type WebSocketMessage =
  | { type: "config"; user_id: string; group_id: string }
  | { type: "group_state"; users?: User[]; output_devices?: Device[] }
  | {
      type: "activity_and_ping";
      users?: Record<string, [number, number]>; //TODO: update with variable names for last activity and ping
      output_devices?: Record<string, number>;
    }
  | { type: "ping"; id: string };

export function useConnectionManager({
  userName,
  userColor,
  slotPresets,
  setSlotPresets,
  setLastGroupId,
}: {
  userName: string;
  userColor: string;
  slotPresets: SlotPresets;
  setSlotPresets: React.Dispatch<React.SetStateAction<SlotPresets>>;
  setLastGroupId: React.Dispatch<React.SetStateAction<string>>;
}) {
  const websocket = useRef<WebSocket | null>(null);
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

  const handleWebSocketMessage = useCallback(
    (data: WebSocketMessage) => {
      switch (data.type) {
        case "config": {
          if (data.group_id) setGroupId(data.group_id);
          if (data.user_id) setUserId(data.user_id);
          break;
        }

        case "group_state": {
          // update users
          setUsers(data.users || []);
          // update devices
          setDevices((prevDevices) => {
            // TODO: clean up structure, no callback needed to set device (old variable not needed)
            const updatedDevices = data.output_devices!.map((device) => {
              if (device.slot in slotPresets) {
                if (
                  slotPresets[device.slot] !== "None" &&
                  !(slotPresets[device.slot] in device.keybind_presets)
                ) {
                  // stored preset name is not available in device presets -> reset
                  delete slotPresets[device.slot];
                }
              }

              // when no slot preset is stored (or recently reset)
              // -> set to "default", the first keybind preset or "None"
              if (!(device.slot in slotPresets)) {
                if ("default" in device.keybind_presets) {
                  slotPresets[device.slot] = "default"; // TODO: check if this direct manipulation is ok (also see delete above and setter below)
                } else {
                  slotPresets[device.slot] =
                    Object.keys(device.keybind_presets)[0] || "None";
                }
              }

              // assemble list of users that are connected to this device
              // then create a list of user ids or an empty list
              const connected_user_ids = // TODO: fix case in js object
                data.users
                  ?.filter((user) =>
                    user.selected_output_devices.includes(device.id)
                  )
                  .map((user) => user.id) || [];

              return {
                ...device,
                connected_user_ids: connected_user_ids, // TODO: fix case in js object
              };
            });

            return updatedDevices.sort((a, b) => a.slot - b.slot) || [];
          });
          break;
        }

        case "activity_and_ping": {
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
          break;
        }

        case "ping": {
          websocket.current?.send(
            JSON.stringify({ type: "pong", id: data.id })
          );
          break;
        }

        default: {
          console.warn("Unknown WebSocket message:", data);
          break;
        }
      }
      return;
    },
    [websocket.current]
  );

  const handleLeaveGroup = useCallback(() => {
    if (websocket.current) websocket.current.close();
    websocket.current = null;
    setUsers([]);
    setDevices([]);
  }, []);

  const handleJoinGroup = (groupId: string) => {
    if (websocket.current) websocket.current.close();

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    let url = `${protocol}://${window.location.host}/ws/user`;
    url = url.replace(":5173", ":8000"); // TODO remove, only debugging without nginx
    const params = new URLSearchParams({
      name: encodeURIComponent(user?.name ?? userName),
      color: encodeURIComponent(userColor),
      group_id: groupId,
    }).toString();

    const newSocket = new WebSocket(params ? `${url}?${params}` : url);
    newSocket.onmessage = (event: MessageEvent) => {
      const data: WebSocketMessage = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };

    newSocket.onopen = () => {
      setIsConnected(true);
      setLastGroupId(groupId);
      console.info("WebSocket opened");
    };
    newSocket.onerror = () => console.error("WebSocket error");
    newSocket.onclose = () => {
      setIsConnected(false);
      console.info("WebSocket closed");
      handleLeaveGroup();
    };

    websocket.current = newSocket;
  };

  const handleRenameOutput = (deviceId: string, newName: string) => {
    if (!isConnected) return;
    if (!(deviceId in devicesById)) return;
    if (devicesById[deviceId].name === newName) return;
    if (newName.trim() === "") return;

    websocket.current?.send(
      JSON.stringify({
        type: "rename_output",
        id: deviceId,
        name: newName.trim(),
      })
    );
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

    // slotPresets[deviceSlot] = presetName; // TODO: do not overwrite the whole object, but also give signal to local storage update (missing here)
  };

  const handleSelectOutput = (deviceId: string, state: boolean) => {
    if (!isConnected) return;
    if (user?.selected_output_devices.includes(deviceId) === state) return;

    websocket.current?.send(
      JSON.stringify({
        type: "select_output",
        id: deviceId,
        state: state,
      })
    );
  };

  return {
    websocket,
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
    handleJoinGroup,
    handleRenameOutput,
    handleSelectKeybindPreset,
    handleSelectOutput,
  };
}
