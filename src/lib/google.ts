import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { serializeNote } from "./frontmatter";
import { t } from "./i18n";
import { getNoteStore } from "./notes";
import {
  clearGoogleTokens,
  loadGoogleConfig,
  loadGoogleTokens,
  saveGoogleTokens,
  type GoogleConfig,
} from "./settings";
import type { Note } from "../types";

const OAUTH_PORT = 8399;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}`;
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "openid email https://www.googleapis.com/auth/drive.file";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_FOLDER_NAME = "Daily Log";

/**
 * OAuth client credentials baked into the app build, so end users never have
 * to enter anything (Google requires *someone* to own an OAuth client; for
 * desktop apps the secret is not treated as confidential). Fill these once
 * and every install gets zero-config Google login.
 */
export const BUILT_IN_GOOGLE = {
  clientId: "598581704121-ei5ckqe7bu5lmgab64h22o3c6obighm9.apps.googleusercontent.com",
  clientSecret: "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",
};

function requireConfig(): GoogleConfig {
  const saved = loadGoogleConfig();
  const effective =
    saved.clientId.trim() && saved.clientSecret.trim()
      ? saved
      : BUILT_IN_GOOGLE.clientId && BUILT_IN_GOOGLE.clientSecret
        ? BUILT_IN_GOOGLE
        : saved;
  if (!effective.clientId.trim() || !effective.clientSecret.trim()) {
    throw new Error(t("needCreds"));
  }
  return effective;
}

export function isConnected(): boolean {
  return !!loadGoogleTokens()?.refreshToken;
}

function decodeIdTokenEmail(idToken: string): string | undefined {
  try {
    const payload = idToken.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(json) as { email?: string }).email;
  } catch {
    return undefined;
  }
}

/** Open the system browser for Google sign-in and wait for the loopback code. */
export async function connectGoogle(): Promise<string | undefined> {
  const config = requireConfig();
  const authUrl =
    `${AUTH_URL}?client_id=${encodeURIComponent(config.clientId.trim())}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code&scope=${encodeURIComponent(SCOPE)}` +
    `&access_type=offline&prompt=consent`;
  const codePromise = invoke<string>("oauth_wait_for_code", { port: OAUTH_PORT });
  await openUrl(authUrl);
  const code = await codePromise;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId.trim(),
      client_secret: config.clientSecret.trim(),
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(t("tokenExchangeFailed", { status: res.status, detail: (await res.text()).slice(0, 200) }));
  }
  const tokens = (await res.json()) as {
    refresh_token?: string;
    access_token: string;
    expires_in: number;
    id_token?: string;
  };
  if (!tokens.refresh_token) {
    throw new Error(t("noRefreshToken"));
  }
  saveGoogleTokens({
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  });
  return tokens.id_token ? decodeIdTokenEmail(tokens.id_token) : undefined;
}

export function disconnectGoogle() {
  clearGoogleTokens();
}

async function getAccessToken(): Promise<string> {
  const tokens = loadGoogleTokens();
  const config = requireConfig();
  if (!tokens?.refreshToken) throw new Error(t("notConnected"));
  if (tokens.accessToken && tokens.expiresAt && tokens.expiresAt > Date.now() + 60_000) {
    return tokens.accessToken;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: tokens.refreshToken,
      client_id: config.clientId.trim(),
      client_secret: config.clientSecret.trim(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(t("refreshFailed", { status: res.status }));
  }
  const tok = (await res.json()) as { access_token: string; expires_in: number };
  saveGoogleTokens({
    refreshToken: tokens.refreshToken,
    accessToken: tok.access_token,
    expiresAt: Date.now() + tok.expires_in * 1000,
  });
  return tok.access_token;
}

async function driveFetch(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && !retried) {
    // token expired between calls — force a refresh and retry once
    const tokens = loadGoogleTokens();
    if (tokens) saveGoogleTokens({ refreshToken: tokens.refreshToken });
    return driveFetch(url, init, true);
  }
  if (!res.ok) {
    throw new Error(t("driveError", { status: res.status, detail: (await res.text()).slice(0, 200) }));
  }
  return res;
}

async function getOrCreateFolderId(): Promise<string> {
  const query = encodeURIComponent(
    `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`
  );
  const res = await driveFetch(`${DRIVE_FILES}?q=${query}&fields=files(id)&pageSize=1`);
  const found = (await res.json()) as { files?: { id: string }[] };
  if (found.files && found.files.length > 0) return found.files[0].id;
  const created = await driveFetch(DRIVE_FILES, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  const folder = (await created.json()) as { id: string };
  return folder.id;
}

async function listDriveNotes(): Promise<{ id: string; name: string }[]> {
  const folderId = await getOrCreateFolderId();
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await driveFetch(`${DRIVE_FILES}?q=${query}&fields=files(id,name)&pageSize=500`);
  const data = (await res.json()) as { files?: { id: string; name: string }[] };
  return (data.files ?? []).filter((f) => f.name.toLowerCase().endsWith(".md"));
}

/** Upload every local note to the Drive folder (create or update by name). */
export async function backupToDrive(notes: Note[]): Promise<number> {
  const folderId = await getOrCreateFolderId();
  const existing = new Map((await listDriveNotes()).map((f) => [f.name, f.id]));
  for (const note of notes) {
    const raw = serializeNote(note.meta, note.content);
    const boundary = `mdnote${Date.now()}${Math.random().toString(36).slice(2)}`;
    const metadata = existing.has(note.fileName)
      ? {}
      : { name: note.fileName, parents: [folderId] };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: text/markdown\r\n\r\n` +
      `${raw}\r\n--${boundary}--`;
    const fileId = existing.get(note.fileName);
    const url = fileId
      ? `${DRIVE_UPLOAD}/${fileId}?uploadType=multipart`
      : `${DRIVE_UPLOAD}?uploadType=multipart`;
    await driveFetch(url, {
      method: fileId ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
  }
  return notes.length;
}

/** Download all notes from the Drive folder and write them locally. */
export async function restoreFromDrive(): Promise<number> {
  const driveNotes = await listDriveNotes();
  const store = getNoteStore();
  let count = 0;
  for (const file of driveNotes) {
    const dl = await driveFetch(`${DRIVE_FILES}/${file.id}?alt=media`);
    const raw = await dl.text();
    let target = file.name;
    const base = file.name.replace(/\.md$/i, "");
    let i = 2;
    while (await store.exists(target)) target = `${base}-${i++}.md`;
    await store.write(target, raw);
    count++;
  }
  return count;
}
