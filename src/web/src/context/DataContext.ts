import { createContext } from "react";

import type { User, Device, CustomKeybind } from "../types";

export interface DataContextType {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;

  devices: Device[];
  setDevices: React.Dispatch<React.SetStateAction<Device[]>>;

  customKeybinds: CustomKeybind[];
  setCustomKeybinds: React.Dispatch<React.SetStateAction<CustomKeybind[]>>;

  groupId: string | null;
  setGroupId: React.Dispatch<React.SetStateAction<string | null>>;

  setUserId: React.Dispatch<React.SetStateAction<string | null>>;

  user: User | null;

  activeKeybinds: Record<string, Record<string, string>>;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);
