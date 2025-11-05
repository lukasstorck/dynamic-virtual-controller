import {
  useState,
  useMemo,
  useEffect,
  type ReactNode,
  useCallback,
} from "react";

import { DataContext } from "./DataContext";
import { Status, type User } from "../types";
import { useLocalStorageUserData } from "../hooks/useLocalStorage";
import { useConnectionManager } from "../hooks/useConnectionManager";

export default function DataContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [showKeybindEditor, setShowKeybindEditor] = useState(false);

  // load user name, color, slot presets and
  // custom keybinds from local storage
  const {
    userName,
    setUserName,
    userColor,
    setUserColor,
    lastGroupId,
    setLastGroupId,
    slotPresets,
    setSlotPresets,
    customKeybinds,
    setCustomKeybinds,
  } = useLocalStorageUserData();

  const {
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
  } = useConnectionManager({
    setSlotPresets,
    lastGroupId,
    setLastGroupId,
    setUserName,
    setUserColor,
  });

  useEffect(() => {
    if (connectionStatus === Status.Connected) return;
    // update user data
    sendMessage({
      type: "update_user_data",
      name: userName.trim(),
      color: userColor,
    });
  }, [connectionStatus, userName, userColor, sendMessage]);

  useEffect(() => {
    // read group id from url paramters and clean up url
    const url = new URL(window.location.href);
    const urlGroupId = url.searchParams.get("group_id")?.trim();

    if (urlGroupId) {
      const newUrl = `${url.origin}${url.pathname}`;
      window.history.replaceState({}, document.title, newUrl);
    }

    // take the group id from url paramters or from
    // local storage and auto join
    const newGroupId = urlGroupId || lastGroupId;
    if (!newGroupId) return;
    setGroupId(newGroupId);
    setLastGroupId(newGroupId);
  }, []);

  const usersById = useMemo(() => {
    const byId: Record<string, User> = {};

    users.forEach((user) => {
      byId[user.id] = user;
    });
    return byId;
  }, [users]);

  const activeKeybinds = useMemo(() => {
    // TODO: allow for multiple keybinds on one input key (map<key-string, list<tuple<device-string, output-key-string>>>)
    const map: Record<string, Record<string, string>> = {};
    if (!user) return map;

    // Preset keybinds
    user.connectedDeviceIds.forEach((deviceId) => {
      const device = devicesById[deviceId];

      // skip keybind if device is not present
      if (!device) return;

      // skip keybind if device slot has no preset stored
      if (!(device.slot in slotPresets)) return;

      const selectedPresetName = slotPresets[device.slot];
      // skip keybind if selected preset name is undefined or null or "None"
      if (!selectedPresetName || selectedPresetName === "None") return;
      // skip keybind if device does not have a preset with the selected preset name
      if (!(selectedPresetName in device.keybindPresets)) return;

      const selectedKeybinds = device.keybindPresets[selectedPresetName];
      // skip keybind if keybinds of selected preset are undefined or null
      if (!selectedKeybinds) return;

      Object.entries(selectedKeybinds).forEach((keybind) => {
        const [key, event] = keybind;

        if (!key || !event) return;
        if (!map[key]) map[key] = {};
        const eventf: any = event; // TODO fix
        map[key][device.id] = eventf;
      });

      // TODO use keybind object, not loose variables as above
      // presetKeybinds.map((keybind) => {
      //   if (!keybind.key || !keybind.event) return;
      //   if (!map[keybind.key]) map[keybind.key] = {};
      //   map[keybind.key][device.id] = keybind.event;
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
      if (!device || !user.connectedDeviceIds.includes(device.id)) return;

      if (!map[keybind.key]) map[keybind.key] = {};
      map[keybind.key][device.id] = keybind.event;
    });

    return map;
  }, [user, devicesById, devicesBySlot, customKeybinds]);

  // TODO: split or move to useConnectionManager
  const handleKeyPress = useCallback(
    (event: KeyboardEvent, state: number) => {
      // only capture and send keys when connected
      if (connectionStatus !== Status.JoinedGroup) return;

      // do not capture key events when editing device name
      // TODO: also deny on active modal
      const clickedDOMTagName = (
        event.target as HTMLElement
      ).tagName.toLowerCase();
      if (["button", "input"].includes(clickedDOMTagName)) return;

      const keyMappings = activeKeybinds[event.code];
      if (!keyMappings) return;

      Object.entries(keyMappings).forEach(([deviceId, buttonCode]) => {
        sendMessage({
          type: "keypress",
          device_id: deviceId,
          code: buttonCode,
          state: state,
        });
      });
    },
    [connectionStatus, activeKeybinds, sendMessage]
  );

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
        slotPresets,
        setSlotPresets,
        handleSelectKeybindPreset,
        user,
        activeKeybinds,
        connectionStatus,
        handleJoinGroup,
        handleLeaveGroup,
        handleRenameOutput,
        handleSelectOutput,
        handleKeyPress,
        usersById,
        devicesById,
        devicesBySlot,
        showKeybindEditor,
        setShowKeybindEditor,
      }}
    >
      {children}
    </DataContext>
  );
}
