export interface User {
  id: string;
  name: string;
  color: string;
  selected_output_devices: string[]; // TODO: rename to connected_device_ids
  last_activity: number; // TODO: rename to last_activity_time
  ping: number | null; // TODO: rename to last_ping_time
}

export interface Keybind {
  key: string | null; // e.g. "KeyW", "Space"
  event: string | null; // e.g. "BTN_DPAD_UP", "BTN_A"
}

export interface Device {
  id: string;
  name: string;
  slot: number;
  keybind_presets: Record<string, Keybind[]>;
  allowed_events: string[];
  ping: number | null; // TODO: rename to last_ping_time
  connected_user_ids: string[];
}

export interface CustomKeybind extends Keybind {
  slot: number | null;
  active: boolean;
}

export interface SlotPresets {
  [slot: number]: string;
}
