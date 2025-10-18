import {
  useState,
  useMemo,
  useEffect,
  type ReactNode,
  useCallback,
  useRef,
} from "react";

import { DataContext } from "./DataContext";
import type { User, Device, CustomKeybind } from "../types";
import { DEFAULT_COLOR, DEFAULT_NAME } from "../hooks/useLocalStorage";

type WebSocketMessage =
  | { type: "config"; user_id: string; group_id: string }
  | { type: "group_state"; users?: User[]; output_devices?: Device[] }
  | {
      type: "activity_and_ping";
      users?: Record<string, [number, number]>; //TODO: update with variable names for last activity and ping
      output_devices?: Record<string, number>;
    }
  | { type: "ping"; id: string };

export default function DataContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [customKeybinds, setCustomKeybinds] = useState<CustomKeybind[]>([]);
  const [groupId, setGroupId] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userColor, setUserColor] = useState<string>(DEFAULT_COLOR);
  const [userName, setUserName] = useState<string>(DEFAULT_NAME);
  const websocket = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    if (!isConnected) return;
    // update user data
    websocket.current?.send(
      JSON.stringify({
        type: "update_user_data",
        name: userName.trim(),
        color: userColor,
      })
    );
  }, [isConnected, userName, userColor]);

  const handleCopyGroupLink = useCallback(() => {
    const params = new URLSearchParams({
      group_id: groupId,
    }).toString();
    const link = `${window.location.origin}?${params}`;
    navigator.clipboard.writeText(link);
  }, [groupId]);

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
            const updatedDevices = data.output_devices!.map((device) => {
              const oldDevice = prevDevices.find((d) => d.id === device.id);
              const oldSelectedPreset = oldDevice?.selected_preset;
              const isOldSelectedPresetPresent =
                oldSelectedPreset &&
                oldSelectedPreset in device.keybind_presets;

              // if a preset was selected and that preset is still present, reselect it
              // otherwise, chose the first available preset (or null)
              const selectedPreset = isOldSelectedPresetPresent
                ? oldSelectedPreset
                : Object.keys(device.keybind_presets)[0] || null;

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
                selected_preset: selectedPreset, // TODO: fix case in js object
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

  const handleJoinGroup = () => {
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
        name: newName,
      })
    );
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

  const user = useMemo(() => {
    if (!userId) return null;
    return users.find((user) => user.id === userId) || null;
  }, [userId, users]);

  const usersById = useMemo(() => {
    const byId: Record<string, User> = {};

    users.forEach((user) => {
      byId[user.id] = user;
    });
    return byId;
  }, [users]);

  const { devicesById, devicesBySlot } = useMemo(() => {
    const byId: Record<string, Device> = {};
    const bySlot: Record<number, Device> = {};

    devices.forEach((device) => {
      byId[device.id] = device;
      bySlot[device.slot] = device;
    });

    return { devicesById: byId, devicesBySlot: bySlot };
  }, [devices]);

  const activeKeybinds = useMemo(() => {
    // TODO: allow for multiple keybinds on one input key (map<key-string, list<tuple<device-string, output-key-string>>>)
    const map: Record<string, Record<string, string>> = {};
    if (!user) return map;

    // Preset keybinds
    user.selected_output_devices.forEach((deviceId) => {
      const device = devicesById[deviceId];
      if (!device || !device.selected_preset) return;

      const presetKeybinds = device.keybind_presets[device.selected_preset];
      if (!presetKeybinds) return;

      // console.log(presetKeybinds);                           // TODO fix
      // Object.keys(presetKeybinds).forEach((keybind) => {
      //   if (keybind.key && keybind.event) {
      //     if (!map[keybind.key]) map[keybind.key] = {};
      //     map[keybind.key][device.id] = keybind.event;
      //   }
      // });
    });

    // Active custom keybinds
    customKeybinds.forEach((keybind) => {
      if (
        !keybind.active ||
        !keybind.key ||
        !keybind.event ||
        keybind.slot === null
      )
        return;
      const device = devicesBySlot[keybind.slot];
      if (!device || !user.selected_output_devices.includes(device.id)) return;

      if (!map[keybind.key]) map[keybind.key] = {};
      map[keybind.key][device.id] = keybind.event;
    });

    return map;
  }, [user, devicesById, devicesBySlot, customKeybinds]);

  return (
    <DataContext
      value={{
        users,
        setUsers,
        devices,
        setDevices,
        customKeybinds,
        setCustomKeybinds,
        groupId,
        setGroupId,
        userId,
        setUserId,
        userColor,
        setUserColor,
        userName,
        setUserName,
        user,
        websocket,
        activeKeybinds,
        isConnected,
        handleJoinGroup,
        handleLeaveGroup,
        handleCopyGroupLink,
        handleRenameOutput,
        handleSelectOutput,
        usersById,
        devicesById,
        devicesBySlot,
      }}
    >
      {children}
    </DataContext>
  );
}
