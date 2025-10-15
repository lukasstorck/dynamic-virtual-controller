import { useState, useMemo, type ReactNode, useCallback } from "react";

import { DataContext } from "./DataContext";
import type { User, Device, CustomKeybind } from "../types";
import { DEFAULT_COLOR, DEFAULT_NAME } from "../hooks/useLocalStorage";

type WebSocketMessage =
  | { type: "config"; group_id: string }
  | { type: "group_state"; users?: User[]; output_devices?: Device[] }
  | {
      type: "activity_and_ping";
      users?: Record<string, [number, number]>;
      output_devices?: Record<string, number>;
    }
  | { type: "update_user_data"; name: string; color: string };

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
  const [websocket, setWebsocket] = useState<WebSocket | null>(null);
  const [websocketState, setWebsocketState] = useState<number>(-1);

  const isConnected = useMemo(() => {
    if (websocketState !== WebSocket.OPEN) return false;
    return true;
  }, [websocketState]);

  const handleCopyGroupLink = useCallback(() => {
    const params = new URLSearchParams({
      group_id: groupId,
    }).toString();
    const link = `${window.location.origin}?${params}`;
    navigator.clipboard.writeText(link);
  }, [groupId]);

  const handleWebSocketMessage = useCallback((data: WebSocketMessage) => {
    return;
  }, []);

  const handleLeaveGroup = useCallback(() => {
    if (websocket) websocket.close();
  }, [websocket]);

  const handleJoinGroup = useCallback(() => {
    if (groupId) {
      if (websocket) websocket.close();

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
      console.log(newSocket.readyState);

      newSocket.onopen = () => {
        setWebsocketState(WebSocket.OPEN);
        console.info("WebSocket opened");
      };
      newSocket.onerror = () => console.error("WebSocket error");
      newSocket.onclose = () => {
        setWebsocketState(WebSocket.CLOSED);
        console.info("WebSocket closed");
      };
      setWebsocket(newSocket);
    }
  }, [groupId, websocket]);

  const user = useMemo(() => {
    if (!userId) return null;
    return users.find((u) => u.id === userId) || null;
  }, [userId, users]);

  const { devicesById, devicesBySlot } = useMemo(() => {
    const byId: Record<string, Device> = {};
    const bySlot: Record<number, Device> = {};

    devices.forEach((d) => {
      byId[d.id] = d;
      bySlot[d.slot] = d;
    });

    return { devicesById: byId, devicesBySlot: bySlot };
  }, [devices]);

  const activeKeybinds = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    if (!user) return map;

    // Preset keybinds
    user.connected_device_ids.forEach((deviceId) => {
      const device = devicesById[deviceId];
      if (!device || !device.selected_preset) return;

      const presetKeybinds = device.keybind_presets[device.selected_preset];
      if (!presetKeybinds) return;

      presetKeybinds.forEach((kb) => {
        if (kb.key && kb.event) {
          if (!map[kb.key]) map[kb.key] = {};
          map[kb.key][device.id] = kb.event;
        }
      });
    });

    // Active custom keybinds
    customKeybinds.forEach((kb) => {
      if (!kb.active || !kb.key || !kb.event || kb.slot === null) return;
      const device = devicesBySlot[kb.slot];
      if (!device || !user.connected_device_ids.includes(device.id)) return;

      if (!map[kb.key]) map[kb.key] = {};
      map[kb.key][device.id] = kb.event;
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
        setWebsocket,
        activeKeybinds,
        isConnected,
        handleJoinGroup,
        handleLeaveGroup,
        handleCopyGroupLink,
      }}
    >
      {children}
    </DataContext>
  );
}
