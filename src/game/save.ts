import { migrateSave, newSave, type SaveData } from './economy';

const KEY = 'fs2028-save';

export function loadSave(): { save: SaveData; existed: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { save: migrateSave(JSON.parse(raw)), existed: true };
  } catch { /* storage blocked or corrupt: start fresh */ }
  return { save: newSave(), existed: false };
}

export function writeSave(s: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
