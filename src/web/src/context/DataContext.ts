import { createContext } from "react";

import type { User, Device, CustomKeybind, SlotPresets } from "../types";

export interface DataContextType {
  groupState: { users: User[]; devices: Device[] };

  customKeybinds: CustomKeybind[];
  setCustomKeybinds: React.Dispatch<React.SetStateAction<CustomKeybind[]>>;

  groupId: string;
  setGroupId: React.Dispatch<React.SetStateAction<string>>;

  userId: string | null;
  setUserId: React.Dispatch<React.SetStateAction<string | null>>;

  userColor: string;
  setUserColor: React.Dispatch<React.SetStateAction<string>>;

  userName: string;
  setUserName: React.Dispatch<React.SetStateAction<string>>;

  slotPresets: SlotPresets;
  setSlotPresets: (newSlotPresets: SlotPresets) => void;

  user: User | null;

  activeKeybinds: Record<string, [string, string][]>;

  connectionStatus: number;

  handleJoinGroup: (groupId: string) => void;
  handleLeaveGroup: React.Dispatch<void>; // TODO: fix typing
  handleRenameOutput: (deviceId: string, newName: string) => void;
  handleSelectOutput: (deviceId: string, state: boolean) => void;
  handleSelectKeybindPreset: (deviceSlot: number, presetName: string) => void;

  usersById: Record<string, User>;
  devicesById: Record<string, Device>;
  devicesBySlot: Record<number, Device>;
  showKeybindEditor: boolean;
  setShowKeybindEditor: (newState: boolean) => void;

  customKeybindActiveListener: number | null;
  setCustomKeybindActiveListener: React.Dispatch<
    React.SetStateAction<number | null>
  >;
}

export const DataContext = createContext<DataContextType | undefined>(
  undefined
);
