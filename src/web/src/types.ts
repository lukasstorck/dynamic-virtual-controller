export interface User {
  id: string;
  name: string;
  color: string;
  connectedDeviceIds: string[];
  lastActivityTime: number;
  lastPing: number | null;
}

export interface Keybind {
  key: string | null; // e.g. "KeyW", "Space"
  event: string | null; // e.g. "BTN_DPAD_UP", "BTN_A"
}

export interface Device {
  id: string;
  name: string;
  slot: number;
  keybindPresets: Record<string, Keybind[]>;
  allowedEvents: string[];
  lastPing: number | null;
  connectedUserIds: string[];
}

export interface CustomKeybind extends Keybind {
  slot: number | null;
  active: boolean;
}

export interface SlotPresets {
  [slot: number]: string;
}

export interface GroupState {
  users: User[];
  devices: Device[];
}

export type GroupUpdateAction =
  | { type: "clear" }
  | { type: "set_users_and_devices"; users: User[]; devices: Device[] }
  | {
      type: "activity_and_ping";
      users?: Record<string, [number, number]>; //TODO: update with variable names for last activity and ping
      devices?: Record<string, number>;
    };

export const Status = {
  Disconnected: 0,
  Connected: 1,
  JoinedGroup: 2,
};

export type WebSocketIncomingMessage =
  | { type: "config"; user_id: string; user_name?: string; user_color?: string }
  | {
      type: "group_state";
      group_id: string;
      users?: WebSocketMessageUser[];
      devices?: WebSocketMessageDevice[];
    }
  | {
      type: "activity_and_ping";
      users?: Record<string, [number, number]>; //TODO: update with variable names for last activity and ping
      devices?: Record<string, number>;
    }
  | { type: "ping"; id: string };

export type WebSocketOutgoingMessage =
  | { type: "pong"; id: string }
  | { type: "join_group"; group_id: string }
  | { type: "leave_group" }
  | { type: "rename_output"; id: string; name: string }
  | { type: "select_output"; id: string; state: boolean }
  | { type: "update_user_data"; name: string; color: string }
  | { type: "keypress"; device_id: string; code: string; state: number };

export interface WebSocketMessageDevice {
  id: string;
  name: string;
  slot: number;
  keybind_presets: Record<string, WebSocketMessageKeybind[]>;
  allowed_events: string[];
  last_ping: number | null;
  connected_user_ids: string[];
}

export type WebSocketMessageKeybind = [string, string];

export interface WebSocketMessageUser {
  id: string;
  name: string;
  color: string;
  connected_device_ids: string[];
  last_activity_time: number;
  last_ping: number | null;
}
