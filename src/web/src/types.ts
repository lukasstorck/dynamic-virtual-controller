export interface User {
  id: string;
  name: string;
  color: string;
  connected_device_ids: string[];
  last_activity_time: number;
  last_ping: number | null;
}

export interface Keybind {
  key: string | null; // e.g. "KeyW", "Space"
  event: string | null; // e.g. "BTN_DPAD_UP", "BTN_A"
}

export interface Device {
  id: string;
  name: string;
  slot: number;
  selected_preset: string | null;
  keybind_presets: Record<string, Keybind[]>;
  allowed_events: string[];
  ping: number | null;
}

export interface CustomKeybind extends Keybind {
  slot: number | null;
  active: boolean;
}
