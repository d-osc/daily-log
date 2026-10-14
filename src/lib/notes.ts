import { BaseDirectory, exists, mkdir, readDir, readTextFile, remove, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import type { DateEntry, Note } from "../types";
import { parseNote } from "./frontmatter";
import { toKey } from "./date";
import { loadNotesFolder } from "./settings";

const NOTES_DIR = "notes";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface NoteStore {
  kind: "tauri" | "browser";
  list(): Promise<Note[]>;
  write(fileName: string, raw: string): Promise<void>;
  /** Move a note to the trash folder (recoverable). */
  trash(fileName: string): Promise<void>;
  listTrash(): Promise<Note[]>;
  /** Move a note out of trash. Returns the (possibly re-suffixed) file name. */
  restore(fileName: string): Promise<string>;
  deleteForever(fileName: string): Promise<void>;
  emptyTrash(): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  exists(fileName: string): Promise<boolean>;
}

function parseStored(fileName: string, raw: string): Note {
  const { meta, content } = parseNote(raw);
  return { fileName, meta, content };
}

const TRASH_DIR = "notes/.trash";

const tauriStore: NoteStore = {
  kind: "tauri",
  async list() {
    await ensureDir(NOTES_DIR);
    const entries = await readDir(NOTES_DIR, { baseDir: BaseDirectory.AppData });
    const names = entries.map((e) => e.name).filter((n) => n.toLowerCase().endsWith(".md")).sort();
    const notes: Note[] = [];
    for (const name of names) {
      const raw = await readTextFile(`${NOTES_DIR}/${name}`, { baseDir: BaseDirectory.AppData });
      notes.push(parseStored(name, raw));
    }
    return notes;
  },
  async write(fileName, raw) {
    await writeTextFile(`${NOTES_DIR}/${fileName}`, raw, { baseDir: BaseDirectory.AppData });
  },
  async trash(fileName) {
    await ensureDir(TRASH_DIR);
    const target = await uniqueNameIn(TRASH_DIR, fileName);
    await rename(`${NOTES_DIR}/${fileName}`, `${TRASH_DIR}/${target}`, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
  },
  async listTrash() {
    if (!(await exists(TRASH_DIR, { baseDir: BaseDirectory.AppData }))) return [];
    const entries = await readDir(TRASH_DIR, { baseDir: BaseDirectory.AppData });
    const names = entries.map((e) => e.name).filter((n) => n.toLowerCase().endsWith(".md")).sort();
    const notes: Note[] = [];
    for (const name of names) {
      const raw = await readTextFile(`${TRASH_DIR}/${name}`, { baseDir: BaseDirectory.AppData });
      notes.push(parseStored(name, raw));
    }
    return notes;
  },
  async restore(fileName) {
    await ensureDir(NOTES_DIR);
    const target = await uniqueNameIn(NOTES_DIR, fileName);
    await rename(`${TRASH_DIR}/${fileName}`, `${NOTES_DIR}/${target}`, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
    return target;
  },
  async deleteForever(fileName) {
    await remove(`${TRASH_DIR}/${fileName}`, { baseDir: BaseDirectory.AppData });
  },
  async emptyTrash() {
    if (!(await exists(TRASH_DIR, { baseDir: BaseDirectory.AppData }))) return;
    const entries = await readDir(TRASH_DIR, { baseDir: BaseDirectory.AppData });
    for (const entry of entries) {
      await remove(`${TRASH_DIR}/${entry.name}`, { baseDir: BaseDirectory.AppData });
    }
  },
  async rename(from, to) {
    await rename(`${NOTES_DIR}/${from}`, `${NOTES_DIR}/${to}`, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
  },
  async exists(fileName) {
    return exists(`${NOTES_DIR}/${fileName}`, { baseDir: BaseDirectory.AppData });
  },
};

async function ensureDir(path: string) {
  if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) {
    await mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true });
  }
}

async function uniqueNameIn(dir: string, fileName: string): Promise<string> {
  const base = fileName.replace(/\.md$/i, "");
  let candidate = fileName;
  let i = 2;
  while (await exists(`${dir}/${candidate}`, { baseDir: BaseDirectory.AppData })) {
    candidate = `${base}-${i++}.md`;
  }
  return candidate;
}

const LS_KEY = "daily-log:files";
const LS_TRASH_KEY = "daily-log:trash";

function loadMap(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function saveMap(key: string, map: Record<string, string>) {
  localStorage.setItem(key, JSON.stringify(map));
}

function uniqueKeyIn(map: Record<string, string>, fileName: string): string {
  const base = fileName.replace(/\.md$/i, "");
  let candidate = fileName;
  let i = 2;
  while (candidate in map) {
    candidate = `${base}-${i++}.md`;
  }
  return candidate;
}

/**
 * Browser fallback (when running `npm run dev` outside Tauri) so the UI can be
 * developed without the desktop shell — notes are kept in localStorage.
 */
const browserStore: NoteStore = {
  kind: "browser",
  async list() {
    const map = loadMap(LS_KEY);
    return Object.keys(map).sort().map((name) => parseStored(name, map[name]));
  },
  async write(fileName, raw) {
    const map = loadMap(LS_KEY);
    map[fileName] = raw;
    saveMap(LS_KEY, map);
  },
  async trash(fileName) {
    const files = loadMap(LS_KEY);
    const trashMap = loadMap(LS_TRASH_KEY);
    if (!(fileName in files)) return;
    trashMap[uniqueKeyIn(trashMap, fileName)] = files[fileName];
    delete files[fileName];
    saveMap(LS_KEY, files);
    saveMap(LS_TRASH_KEY, trashMap);
  },
  async listTrash() {
    const trashMap = loadMap(LS_TRASH_KEY);
    return Object.keys(trashMap).sort().map((name) => parseStored(name, trashMap[name]));
  },
  async restore(fileName) {
    const files = loadMap(LS_KEY);
    const trashMap = loadMap(LS_TRASH_KEY);
    if (!(fileName in trashMap)) return fileName;
    const target = uniqueKeyIn(files, fileName);
    files[target] = trashMap[fileName];
    delete trashMap[fileName];
    saveMap(LS_KEY, files);
    saveMap(LS_TRASH_KEY, trashMap);
    return target;
  },
  async deleteForever(fileName) {
    const trashMap = loadMap(LS_TRASH_KEY);
    delete trashMap[fileName];
    saveMap(LS_TRASH_KEY, trashMap);
  },
  async emptyTrash() {
    saveMap(LS_TRASH_KEY, {});
  },
  async rename(from, to) {
    const map = loadMap(LS_KEY);
    if (from in map) {
      map[to] = map[from];
      delete map[from];
      saveMap(LS_KEY, map);
    }
  },
  async exists(fileName) {
    return fileName in loadMap(LS_KEY);
  },
};

export const noteStore: NoteStore = isTauri ? tauriStore : browserStore;

/**
 * Store bound to a user-chosen folder (e.g. a Google Drive / Dropbox desktop
 * sync folder). Uses trusted app commands so any absolute path works.
 */
function folderStore(root: string): NoteStore {
  const trashDir = () => `${root}/.trash`;
  const join = (dir: string, name: string) => `${dir}/${name}`;
  const uniqueIn = async (dir: string, fileName: string) => {
    const base = fileName.replace(/\.md$/i, "");
    let candidate = fileName;
    let i = 2;
    while (await invoke<boolean>("fs_path_exists", { path: join(dir, candidate) })) {
      candidate = `${base}-${i++}.md`;
    }
    return candidate;
  };
  const readAll = async (dir: string) => {
    const names = await invoke<string[]>("fs_read_dir_md", { folder: dir });
    const notes: Note[] = [];
    for (const name of names) {
      const raw = await invoke<string>("fs_read_file", { path: join(dir, name) });
      notes.push(parseStored(name, raw));
    }
    return notes;
  };
  return {
    kind: "tauri",
    async list() {
      return readAll(root);
    },
    async write(fileName, raw) {
      await invoke("fs_write_file", { path: join(root, fileName), contents: raw });
    },
    async trash(fileName) {
      const target = await uniqueIn(trashDir(), fileName);
      await invoke("fs_rename_file", { oldPath: join(root, fileName), newPath: join(trashDir(), target) });
    },
    async listTrash() {
      return readAll(trashDir());
    },
    async restore(fileName) {
      const target = await uniqueIn(root, fileName);
      await invoke("fs_rename_file", { oldPath: join(trashDir(), fileName), newPath: join(root, target) });
      return target;
    },
    async deleteForever(fileName) {
      await invoke("fs_remove_file", { path: join(trashDir(), fileName) });
    },
    async emptyTrash() {
      const names = await invoke<string[]>("fs_read_dir_md", { folder: trashDir() });
      for (const name of names) {
        await invoke("fs_remove_file", { path: join(trashDir(), name) });
      }
    },
    async rename(from, to) {
      await invoke("fs_rename_file", { oldPath: join(root, from), newPath: join(root, to) });
    },
    async exists(fileName) {
      return invoke<boolean>("fs_path_exists", { path: join(root, fileName) });
    },
  };
}

/** The store currently in use: custom folder when configured, default otherwise. */
let activeStore: NoteStore | null = null;

function defaultStore(): NoteStore {
  if (!isTauri) return browserStore;
  const custom = loadNotesFolder();
  return custom ? folderStore(custom) : tauriStore;
}

export function getNoteStore(): NoteStore {
  if (!activeStore) activeStore = defaultStore();
  return activeStore;
}

/** Re-create the store after the notes folder setting changed. */
export function resetNoteStore() {
  activeStore = null;
}

export function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    // \p{M} keeps Thai combining vowels/tone marks attached to their base consonant
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return base || "note";
}

export function fileNameFor(meta: { name: string; dates: DateEntry[] }): string {
  const date = meta.dates[0]?.date || toKey(new Date());
  return `${date}-${slugify(meta.name)}.md`;
}

export async function uniqueFileName(meta: { name: string; dates: DateEntry[] }, skip?: string): Promise<string> {
  const base = fileNameFor(meta).replace(/\.md$/, "");
  let candidate = `${base}.md`;
  let i = 2;
  while (candidate !== skip && (await getNoteStore().exists(candidate))) {
    candidate = `${base}-${i++}.md`;
  }
  return candidate;
}

/** Predefined note categories shown in the editor's Type dropdown. */
export const NOTE_TYPES = ["ทำงานปกติ", "วันหยุด", "ลา"] as const;

/** Default per-date status values (extendable in Settings). */
export const NOTE_STATUSES = ["develop", "support", "release"] as const;

/** Default per-date environment values (extendable in Settings). */
export const NOTE_ENVIRONMENTS = ["develop", "sit", "pvt", "release"] as const;

/** Fixed hues for the standard categories so their color stays consistent. */
const FIXED_TYPE_HUES: Record<string, number> = {
  "ทำงานปกติ": 217, // น้ำเงิน
  "วันหยุด": 0, // แดง
  "ลา": 38, // ส้มอำพัน
};

function hashHue(label: string): number {
  let h = 0;
  for (const ch of label) {
    h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  }
  return h;
}

/**
 * Color set for a type label, used for badges/chips. Colors are expressed with
 * CSS variables (--chip-*-l lightness levels) so they adapt to dark mode.
 * Known categories use fixed hues; anything else gets a stable hashed hue.
 */
export function typeColors(type: string): { bg: string; fg: string; dot: string } {
  if (!type) {
    return { bg: "var(--muted-bg)", fg: "var(--text-muted)", dot: "var(--icon-faint)" };
  }
  const hue = FIXED_TYPE_HUES[type] ?? hashHue(type);
  return {
    bg: `hsl(${hue} 70% var(--chip-bg-l))`,
    fg: `hsl(${hue} 60% var(--chip-fg-l))`,
    dot: `hsl(${hue} 65% var(--chip-dot-l))`,
  };
}
