import {
  useState,
  useMemo,
  useEffect,
  type ReactNode,
  useCallback,
  useRef,
} from "react";

import { DataContext } from "./DataContext";
import type { User, Device } from "../types";
import { useLocalStorageUserData } from "../hooks/useLocalStorage";

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
  const [groupId, setGroupId] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const websocket = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
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
      console.log("set slot preset", deviceSlot, presetName);   // TODO remove
      const newSlotPresets = {
        ...prevSlotPresets,
      };
      newSlotPresets[deviceSlot] = presetName;
      return newSlotPresets;
    });

    // slotPresets[deviceSlot] = presetName; // TODO: do not overwrite the whole object, but also give signal to local storage update (missing here)
  };

  useEffect(() => console.log(slotPresets), [slotPresets]);   // TODO remove

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
        websocket.current?.send(
          JSON.stringify({
            type: "keypress",
            device_id: deviceId,
            code: buttonCode,
            state: state,
          })
        );
      });
    },
    [isConnected, activeKeybinds]
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
        handleCopyGroupLink,
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
