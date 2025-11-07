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
  const [customKeybindActiveListener, setCustomKeybindActiveListener] =
    useState<number | null>(null);

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
    groupState,
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

    groupState.users.forEach((user) => {
      byId[user.id] = user;
    });
    return byId;
  }, [groupState]);

  const activeKeybinds = useMemo(() => {
    // list of tuples [(device id, output event), ...] = map[input event]
    const map: Record<string, [string, string][]> = {};
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

      selectedKeybinds.forEach((keybind) => {
        if (!keybind.key || !keybind.event) return;

        if (!map[keybind.key]) map[keybind.key] = [];
        map[keybind.key].push([device.id, keybind.event]);
      });
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

      if (!map[keybind.key]) map[keybind.key] = [];
      map[keybind.key].push([device.id, keybind.event]);
    });

    return map;
  }, [user, devicesById, devicesBySlot, customKeybinds, slotPresets]);

  const handleKeyPress = useCallback(
    (event: KeyboardEvent, state: number) => {
      // only capture and send keys when connected
      if (connectionStatus !== Status.JoinedGroup) return;

      // do not capture key events e.g. when editing device name
      const clickedDOMTagName = (
        event.target as HTMLElement
      ).tagName.toLowerCase();
      if (["button", "input"].includes(clickedDOMTagName)) return;

      const keyMappings = activeKeybinds[event.code];
      if (!keyMappings || keyMappings.length === 0) return;

      keyMappings.forEach(([deviceId, buttonCode]) => {
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      handleKeyPress(event, 1);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      handleKeyPress(event, 0);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyPress]);

  return (
    <DataContext
      value={{
        groupState,
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
        usersById,
        devicesById,
        devicesBySlot,
        showKeybindEditor,
        setShowKeybindEditor,
        customKeybindActiveListener,
        setCustomKeybindActiveListener,
      }}
    >
      {children}
    </DataContext>
  );
}
