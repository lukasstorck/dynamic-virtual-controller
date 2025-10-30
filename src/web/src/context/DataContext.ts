import { createContext } from "react";

import type { User, Device, CustomKeybind, SlotPresets } from "../types";

export interface DataContextType {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;

  devices: Device[];
  setDevices: React.Dispatch<React.SetStateAction<Device[]>>;

  customKeybinds: CustomKeybind[];
  setCustomKeybinds: React.Dispatch<React.SetStateAction<CustomKeybind[]>>;

  groupId: string;
  setGroupId: React.Dispatch<React.SetStateAction<string>>;

  userId: string | null; // TODO: check if needed
  setUserId: React.Dispatch<React.SetStateAction<string | null>>;

  userColor: string;
  setUserColor: React.Dispatch<React.SetStateAction<string>>;

  userName: string;
  setUserName: React.Dispatch<React.SetStateAction<string>>;

  slotPresets: SlotPresets;
  setSlotPresets: (newSlotPresets: SlotPresets) => void;

  user: User | null;

  activeKeybinds: Record<string, Record<string, string>>;

  isConnected: boolean;

  handleJoinGroup: (groupId: string) => void;
  handleLeaveGroup: React.Dispatch<void>; // TODO: fix typing
  handleRenameOutput: (deviceId: string, newName: string) => void;
  handleSelectOutput: (deviceId: string, state: boolean) => void;
  handleKeyPress: (event: KeyboardEvent, state: number) => void;
  handleSelectKeybindPreset: (deviceSlot: number, presetName: string) => void;

  usersById: Record<string, User>;
  devicesById: Record<string, Device>;
  devicesBySlot: Record<number, Device>;
  showKeybindEditor: boolean;
  setShowKeybindEditor: (newState: boolean) => void;
}

export const DataContext = createContext<DataContextType | undefined>(
  undefined
);
