import { createContext } from "react";

import type { Device, CustomKeybind, SlotPresets, User } from "../types";

export interface DataContextType {
  readonly customKeybinds: CustomKeybind[];
  setCustomKeybinds: React.Dispatch<React.SetStateAction<CustomKeybind[]>>;

  readonly slotPresets: SlotPresets;
  setSlotPresets: React.Dispatch<React.SetStateAction<SlotPresets>>;

  readonly userColor: string;
  setUserColor: React.Dispatch<React.SetStateAction<string>>;

  readonly userName: string;
  setUserName: React.Dispatch<React.SetStateAction<string>>;

  readonly connectionStatus: number;
  readonly devicesById: Record<string, Device>;
  readonly devicesBySlot: Record<number, Device>;

  readonly groupId: string;
  setGroupId: React.Dispatch<React.SetStateAction<string>>;

  readonly groupState: { users: User[]; devices: Device[] };

  handleJoinGroup: (groupId: string) => void;
  handleLeaveGroup: () => void;
  handleRenameOutput: (deviceId: string, newName: string) => void;
  handleSelectKeybindPreset: (deviceSlot: number, presetName: string) => void;
  handleSelectOutput: (deviceId: string, state: boolean) => void;

  readonly user: User | null;

  readonly userId: string | null;
  setUserId: React.Dispatch<React.SetStateAction<string | null>>;

  readonly activeKeybinds: Record<string, [string, string][]>;

  readonly customKeybindActiveListener: number | null;
  setCustomKeybindActiveListener: React.Dispatch<
    React.SetStateAction<number | null>
  >;

  readonly showKeybindEditor: boolean;
  setShowKeybindEditor: React.Dispatch<React.SetStateAction<boolean>>;

  readonly usersById: Record<string, User>;
}

export const DataContext = createContext<DataContextType | undefined>(
  undefined
);
