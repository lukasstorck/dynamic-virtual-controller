import { createContext } from "react";

import type { User, Device, CustomKeybind } from "../types";

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

  user: User | null;

  websocket: React.Ref<WebSocket | null>;

  activeKeybinds: Record<string, Record<string, string>>;

  isConnected: boolean;

  handleJoinGroup: (groupId: string) => void;
  handleLeaveGroup: React.Dispatch<void>;   // TODO: fix typing
  handleCopyGroupLink: React.Dispatch<void>;
  handleRenameOutput: (deviceId: string, newName: string) => void;
  handleSelectOutput: (deviceId: string, state: boolean) => void;

  usersById: Record<string, User>;
  devicesById: Record<string, Device>;
  devicesBySlot: Record<number, Device>;
}

export const DataContext = createContext<DataContextType | undefined>(
  undefined
);
