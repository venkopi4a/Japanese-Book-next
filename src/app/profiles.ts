/**
 * People who study on this device. Each person has their own database and settings, so progress never mixes.
 * The first person ever created gets the id "local": that is the database the app used before profiles existed,
 * so earlier progress carries over untouched.
 */
export interface Profile { id: string; name: string; colour: number }

export const COLOURS = ['#C9442C', '#2B3A6B', '#3F7D5C', '#A8601A'];
export const MAX_PROFILES = 4;
const base = () => import.meta.env.BASE_URL;
const listKey = () => `jb:${base()}:profiles`;
const lastKey = () => `jb:${base()}:profile`;

export const settingsKey = (id: string) => (id === 'local' ? `jb:${base()}:settings` : `jb:${base()}:settings:${id}`);

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: lasts for this visit only */ }
}

export const loadProfiles = (): Profile[] => read<Profile[]>(listKey(), []);
export const lastProfileId = (): string | null => read<string | null>(lastKey(), null);
export const rememberProfile = (id: string) => write(lastKey(), id);

export function addProfile(name: string): Profile {
  const list = loadProfiles();
  const used = new Set(list.map((p) => p.colour));
  const p: Profile = {
    id: list.some((x) => x.id === 'local') ? `p${Date.now().toString(36)}` : 'local',
    name: name.trim().slice(0, 24) || `Person ${list.length + 1}`,
    colour: COLOURS.findIndex((_, i) => !used.has(i)) === -1 ? list.length % COLOURS.length : COLOURS.findIndex((_, i) => !used.has(i)),
  };
  write(listKey(), [...list, p]);
  return p;
}

export function renameProfile(id: string, name: string) {
  write(listKey(), loadProfiles().map((p) => (p.id === id && name.trim() ? { ...p, name: name.trim().slice(0, 24) } : p)));
}

/** Removes a person from the list and their settings. The caller deletes their database. */
export function removeProfile(id: string) {
  write(listKey(), loadProfiles().filter((p) => p.id !== id));
  try { localStorage.removeItem(settingsKey(id)); if (lastProfileId() === id) localStorage.removeItem(lastKey()); } catch { /* nothing stored */ }
}

/** Which person to open straight away: the only one, or nobody (the picker shows) when there are several. */
export function autoProfile(list: Profile[]): Profile | null {
  return list.length === 1 ? list[0]! : null;
}
