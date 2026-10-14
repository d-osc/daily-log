const THEME_KEY = "daily-log:theme";
const CUSTOM_TYPES_KEY = "daily-log:custom-types";
const CUSTOM_STATUSES_KEY = "daily-log:custom-statuses";
const CUSTOM_ENVIRONMENTS_KEY = "daily-log:custom-environments";

// One-time migration from the pre-rename "markdown-note:*" storage keys.
const MIGRATABLE_KEYS = [
  "theme",
  "custom-types",
  "custom-statuses",
  "custom-environments",
  "notes-folder",
  "google-config",
  "google-tokens",
  "files",
  "trash",
];

export function migrateLocalStorage(): void {
  try {
    for (const key of MIGRATABLE_KEYS) {
      const oldKey = `markdown-note:${key}`;
      const newKey = `daily-log:${key}`;
      const old = localStorage.getItem(oldKey);
      if (localStorage.getItem(newKey) === null && old !== null) {
        localStorage.setItem(newKey, old);
      }
    }
  } catch {
    /* storage unavailable */
  }
}

export type Theme = "light" | "dark";

export function getTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable */
  }
}

function loadList(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function saveList(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

export const loadCustomTypes = () => loadList(CUSTOM_TYPES_KEY);
export const saveCustomTypes = (list: string[]) => saveList(CUSTOM_TYPES_KEY, list);
export const loadCustomStatuses = () => loadList(CUSTOM_STATUSES_KEY);
export const saveCustomStatuses = (list: string[]) => saveList(CUSTOM_STATUSES_KEY, list);
export const loadCustomEnvironments = () => loadList(CUSTOM_ENVIRONMENTS_KEY);
export const saveCustomEnvironments = (list: string[]) => saveList(CUSTOM_ENVIRONMENTS_KEY, list);

// ---- Notes folder (custom storage location, e.g. a Drive/Dropbox sync folder) ----

const NOTES_FOLDER_KEY = "daily-log:notes-folder";

export function loadNotesFolder(): string | null {
  try {
    const v = localStorage.getItem(NOTES_FOLDER_KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function saveNotesFolder(path: string | null): void {
  try {
    if (path) localStorage.setItem(NOTES_FOLDER_KEY, path);
    else localStorage.removeItem(NOTES_FOLDER_KEY);
  } catch {
    /* storage unavailable */
  }
}

// ---- Google Drive sync ----

const GOOGLE_CONFIG_KEY = "daily-log:google-config";
const GOOGLE_TOKENS_KEY = "daily-log:google-tokens";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export interface GoogleTokens {
  refreshToken: string;
  accessToken?: string;
  /** epoch ms when the access token expires */
  expiresAt?: number;
}

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export const loadGoogleConfig = (): GoogleConfig =>
  loadJson<GoogleConfig>(GOOGLE_CONFIG_KEY) ?? { clientId: "", clientSecret: "" };

export const saveGoogleConfig = (config: GoogleConfig) => saveJson(GOOGLE_CONFIG_KEY, config);

export const loadGoogleTokens = (): GoogleTokens | null => loadJson<GoogleTokens>(GOOGLE_TOKENS_KEY);

export const saveGoogleTokens = (tokens: GoogleTokens) => saveJson(GOOGLE_TOKENS_KEY, tokens);

export const clearGoogleTokens = () => {
  try {
    localStorage.removeItem(GOOGLE_TOKENS_KEY);
  } catch {
    /* storage unavailable */
  }
};
