import {
  useState,
  useMemo,
  useEffect,
  type ReactNode,
  useCallback,
} from "react";

import { DataContext } from "./DataContext";
import type { User } from "../types";
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
    sendMessage,
  } = useConnectionManager({
    userName,
    userColor,
    slotPresets,
    setSlotPresets,
    setLastGroupId,
  });

  useEffect(() => {
    if (!isConnected) return;
    // update user data
    sendMessage({
      type: "update_user_data",
      name: userName.trim(),
      color: userColor,
    });
  }, [isConnected, userName, userColor, sendMessage]);

  // TODO: add keybind editor modal and behavior

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
    if (!websocket.current) handleJoinGroup(newGroupId);
    // note: usually the line above would only run once, but React in strict mode executes this
    // effect twice therefore handleJoinGroup() would run twice and the second time intterupts
    // the connection of the first and there are errors. The check for the empty websocket variable
    // is added to avoid this behavior.
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
    user.selected_output_devices.forEach((deviceId) => {
      const device = devicesById[deviceId];
      // TODO: get selected preset from slotPreset variable slotPreset[device.slot]
      // TODO: when devices are loaded or updated, ensure that the stored preset name in slotPreset is present for that slot

      // skip keybind if device is not present
      if (!device) return;

      // skip keybind if device slot has no preset stored
      if (!(device.slot in slotPresets)) return;

      const selectedPresetName = slotPresets[device.slot];
      // skip keybind if selected preset name is undefined or null or "None"
      if (!selectedPresetName || selectedPresetName === "None") return;
      // skip keybind if device does not have a preset with the selected preset name
      if (!(selectedPresetName in device.keybind_presets)) return;

      const selectedKeybinds = device.keybind_presets[selectedPresetName];
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
      if (!device || !user.selected_output_devices.includes(device.id)) return;

      if (!map[keybind.key]) map[keybind.key] = {};
      map[keybind.key][device.id] = keybind.event;
    });

    return map;
  }, [user, devicesById, devicesBySlot, customKeybinds]);

  // TODO: split or move to useConnectionManager
  const handleKeyPress = useCallback(
    (event: KeyboardEvent, state: number) => {
      // only capture and send keys when connected
      if (!isConnected) return;

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
    [isConnected, activeKeybinds, sendMessage]
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
        websocket,
        activeKeybinds,
        isConnected,
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
