import { useEffect, useState } from "react";
import type { CustomKeybind, SlotPresets } from "../types";

export const DEFAULT_COLOR = "#ff6f61";
export const DEFAULT_NAME = `User-${crypto.randomUUID().slice(0, 4)}`;

const STORAGE_COLOR_KEY = "dvc_color";
const STORAGE_CUSTOM_KEYBINDS_KEY = "dvc_custom_keybinds";
const STORAGE_LAST_GROUP_ID_KEY = "dvc_last_group_id";
const STORAGE_NAME_KEY = "dvc_name";
const STORAGE_SLOT_PRESETS_KEY = "dvc_slot_presets";

export function saveUserPreferences(
  color: string,
  lastGroupId: string,
  name: string
) {
  localStorage.setItem(STORAGE_COLOR_KEY, color);
  localStorage.setItem(STORAGE_LAST_GROUP_ID_KEY, lastGroupId);
  localStorage.setItem(STORAGE_NAME_KEY, name);
}

export function loadUserPreferences() {
  const storedName = localStorage.getItem(STORAGE_NAME_KEY) || DEFAULT_NAME;
  const storedColor = localStorage.getItem(STORAGE_COLOR_KEY) || DEFAULT_COLOR;
  const storedLastGroupId =
    localStorage.getItem(STORAGE_LAST_GROUP_ID_KEY) || "";
  return { storedName, storedColor, storedLastGroupId };
}

export function saveSlotPresets(slotPresets: SlotPresets) {
  localStorage.setItem(STORAGE_SLOT_PRESETS_KEY, JSON.stringify(slotPresets));
}

export function loadSlotPresets() {
  let slotPresets: SlotPresets = {};
  const stored = localStorage.getItem(STORAGE_SLOT_PRESETS_KEY);
  if (stored) slotPresets = JSON.parse(stored);
  return slotPresets;
}

export function saveCustomKeybinds(customKeybinds: CustomKeybind[]) {
  localStorage.setItem(
    STORAGE_CUSTOM_KEYBINDS_KEY,
    JSON.stringify(customKeybinds)
  );
}

export function loadCustomKeybinds() {
  let customKeybinds: CustomKeybind[] = [];
  const stored = localStorage.getItem(STORAGE_CUSTOM_KEYBINDS_KEY);
  if (stored) customKeybinds = JSON.parse(stored);
  return customKeybinds;
}

export function useLocalStorageUserData() {
  // create state variables and load data from local storage (or default values)
  const { storedName, storedColor, storedLastGroupId } = loadUserPreferences();
  const [slotPresets, setSlotPresets] = useState<SlotPresets>(
    loadSlotPresets()
  );
  const [lastGroupId, setLastGroupId] = useState(storedLastGroupId);
  const [userColor, setUserColor] = useState<string>(storedColor);
  const [userName, setUserName] = useState<string>(storedName);
  const [customKeybinds, setCustomKeybinds] = useState<CustomKeybind[]>(
    loadCustomKeybinds()
  );

  // save values to local storage on change
  useEffect(() => {
    saveUserPreferences(userColor, lastGroupId, userName);
  }, [userColor, lastGroupId, userName]);

  useEffect(() => {
    saveSlotPresets(slotPresets);
  }, [slotPresets]);

  useEffect(() => {
    saveCustomKeybinds(customKeybinds);
  }, [customKeybinds]);

  return {
    customKeybinds,
    setCustomKeybinds,
    lastGroupId,
    setLastGroupId,
    slotPresets,
    setSlotPresets,
    userColor,
    setUserColor,
    userName,
    setUserName,
  };
}
