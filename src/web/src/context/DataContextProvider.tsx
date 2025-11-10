import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { DataContext } from "./DataContext";
import { Status, type User } from "../types";
import { useConnectionManager } from "../hooks/useConnectionManager";
import { useLocalStorageUserData } from "../hooks/useLocalStorage";

interface DataContextProviderProps {
  children: ReactNode;
}

export default function DataContextProvider({
  children,
}: DataContextProviderProps) {
  const [customKeybindActiveListener, setCustomKeybindActiveListener] =
    useState<number | null>(null);
  const [showKeybindEditor, setShowKeybindEditor] = useState(false);

  // load user name, color, slot presets and
  // custom keybinds from local storage
  const {
    customKeybinds,
    setCustomKeybinds,
    lastGroupId,
    setLastGroupId,
    slotPresets,
    setSlotPresets,
    userColor,
    setUserColor,
    userName,
    setUserName,
  } = useLocalStorageUserData();

  const {
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
  } = useConnectionManager({
    lastGroupId,
    setLastGroupId,
    setSlotPresets,
    setUserColor,
    setUserName,
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

      // Browser pseudo-device
      if (keybind.slot === -1) {
        if (!map[keybind.key]) map[keybind.key] = [];
        map[keybind.key].push(["BROWSER", keybind.event]);
        return;
      }

      // Real devices
      const device = devicesBySlot[keybind.slot];
      if (!device || !user.connectedDeviceIds.includes(device.id)) return;

      if (!map[keybind.key]) map[keybind.key] = [];
      map[keybind.key].push([device.id, keybind.event]);
    });

    return map;
  }, [customKeybinds, devicesById, devicesBySlot, slotPresets, user]);

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

      event.preventDefault();
      event.stopPropagation();

      keyMappings.forEach(([deviceId, buttonCode]) => {
        // Browser pseudo-device
        if (deviceId === "BROWSER") {
          if (state === 0) return;

          const allSlots = Object.keys(devicesBySlot)
            .map(Number)
            .sort((a, b) => a - b);

          const devicesBySlotArray = allSlots.map(
            (slot) => devicesBySlot[slot]
          );

          if (buttonCode.startsWith("Switch to Slot ")) {
            const targetSlot = Number(
              buttonCode.replace("Switch to Slot ", "")
            );
            devicesBySlotArray.forEach((device) => {
              const state = device.slot === targetSlot;
              handleSelectOutput(device.id, state);
            });
          } else if (buttonCode.startsWith("Toggle Slot ")) {
            const targetSlot = Number(buttonCode.replace("Toggle Slot ", ""));
            const device = devicesBySlot[targetSlot];
            if (device) {
              const isActive =
                user?.connectedDeviceIds.includes(device.id) ?? false;
              handleSelectOutput(device.id, !isActive);
            }
          } else if (buttonCode === "Switch to next Slot") {
            const activeSlots = devicesBySlotArray.filter((d) =>
              user?.connectedDeviceIds.includes(d.id)
            );
            const currentSlot =
              activeSlots.length > 0
                ? Math.min(...activeSlots.map((d) => d.slot))
                : allSlots[allSlots.length - 1];
            const nextSlot =
              allSlots.find((s) => s > currentSlot) ?? allSlots[0];

            devicesBySlotArray.forEach((device) =>
              handleSelectOutput(device.id, device.slot === nextSlot)
            );
          } else if (buttonCode === "Switch to previous Slot") {
            const activeSlots = devicesBySlotArray.filter((d) =>
              user?.connectedDeviceIds.includes(d.id)
            );
            const currentSlot =
              activeSlots.length > 0
                ? Math.max(...activeSlots.map((d) => d.slot))
                : allSlots[0];
            const prevSlot =
              [...allSlots].reverse().find((s) => s < currentSlot) ??
              allSlots[allSlots.length - 1];

            devicesBySlotArray.forEach((device) =>
              handleSelectOutput(device.id, device.slot === prevSlot)
            );
          }

          return;
        }

        // Real device keypress
        sendMessage({
          type: "keypress",
          device_id: deviceId,
          code: buttonCode,
          state: state,
        });
      });
    },
    [
      activeKeybinds,
      connectionStatus,
      devicesBySlot,
      sendMessage,
      slotPresets,
      setSlotPresets,
    ]
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
        customKeybinds,
        setCustomKeybinds,
        slotPresets,
        setSlotPresets,
        userColor,
        setUserColor,
        userName,
        setUserName,

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
        user,
        userId,
        setUserId,

        activeKeybinds,
        customKeybindActiveListener,
        setCustomKeybindActiveListener,
        showKeybindEditor,
        setShowKeybindEditor,
        usersById,
      }}
    >
      {children}
    </DataContext>
  );
}
