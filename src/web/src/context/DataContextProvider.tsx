import { useState, useMemo, type ReactNode } from "react";

import { DataContext } from "./DataContext";
import type { User, Device, CustomKeybind } from "../types";

export default function DataContextProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [customKeybinds, setCustomKeybinds] = useState<CustomKeybind[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

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
        setUserId,
        user,
        activeKeybinds,
      }}
    >
      {children}
    </DataContext>
  );
}
