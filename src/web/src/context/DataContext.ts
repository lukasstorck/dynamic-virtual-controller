import { createContext } from "react";

import type { Device, CustomKeybind, SlotPresets, User } from "../types";

export interface DataContextType {
  customKeybinds: CustomKeybind[];
  setCustomKeybinds: React.Dispatch<React.SetStateAction<CustomKeybind[]>>;

  slotPresets: SlotPresets;
  setSlotPresets: (newSlotPresets: SlotPresets) => void;

  userColor: string;
  setUserColor: React.Dispatch<React.SetStateAction<string>>;

  userName: string;
  setUserName: React.Dispatch<React.SetStateAction<string>>;

  connectionStatus: number;
  devicesById: Record<string, Device>;
  devicesBySlot: Record<number, Device>;

  groupId: string;
  setGroupId: React.Dispatch<React.SetStateAction<string>>;

  groupState: { users: User[]; devices: Device[] };

  handleJoinGroup: (groupId: string) => void;
  handleLeaveGroup: React.Dispatch<void>; // TODO: fix typing
  handleRenameOutput: (deviceId: string, newName: string) => void;
  handleSelectKeybindPreset: (deviceSlot: number, presetName: string) => void;
  handleSelectOutput: (deviceId: string, state: boolean) => void;

  user: User | null;

  userId: string | null;
  setUserId: React.Dispatch<React.SetStateAction<string | null>>;

  activeKeybinds: Record<string, [string, string][]>;

  customKeybindActiveListener: number | null;
  setCustomKeybindActiveListener: React.Dispatch<
    React.SetStateAction<number | null>
  >;

  showKeybindEditor: boolean;
  setShowKeybindEditor: (newState: boolean) => void;

  usersById: Record<string, User>;
}

export const DataContext = createContext<DataContextType | undefined>(
  undefined
);
