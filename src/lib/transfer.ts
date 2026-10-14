import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { Note, NoteMeta } from "../types";
import { toKey } from "./date";
import { parseNote, serializeNote } from "./frontmatter";
import { isTauri, getNoteStore } from "./notes";
import { t } from "./i18n";

/** Export a note as a .md file. Returns false when the user cancels. */
export async function downloadNote(note: Note): Promise<boolean> {
  const raw = serializeNote(note.meta, note.content);
  if (isTauri) {
    const path = await save({
      defaultPath: note.fileName,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!path) return false;
    await invoke("export_markdown", { path, contents: raw });
    return true;
  }
  // Browser fallback: blob download via a temporary anchor
  const blob = new Blob([raw], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = note.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

interface PickedFile {
  name: string;
  text: string;
}

/**
 * Let the user pick .md files. A plain <input type="file"> is used on purpose:
 * it works in the Tauri WebView (native picker) and in regular browsers.
 */
function pickFiles(): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,text/markdown";
    input.multiple = true;
    let settled = false;
    const done = (files: PickedFile[]) => {
      if (!settled) {
        settled = true;
        resolve(files);
      }
    };
    input.addEventListener("change", () => {
      const list = Array.from(input.files ?? []);
      void Promise.all(list.map(async (f) => ({ name: f.name, text: await f.text() }))).then(done);
    });
    input.addEventListener("cancel", () => done([]));
    input.click();
  });
}

async function uniqueImportName(fileName: string): Promise<string> {
  const base = fileName.replace(/\.md$/i, "");
  let candidate = fileName;
  let i = 2;
  while (await getNoteStore().exists(candidate)) {
    candidate = `${base}-${i++}.md`;
  }
  return candidate;
}

/**
 * Turn already-read .md files into notes. Missing Name/Date fields are filled in
 * so every imported note shows up on the calendar. Shared by the file-picker
 * import and drag & drop. Returns the saved file names.
 */
export async function importPicked(picked: PickedFile[], defaultDate: string): Promise<string[]> {
  const saved: string[] = [];
  for (const file of picked) {
    const fileName = file.name.replace(/\.(markdown|txt)$/i, ".md");
    if (!fileName.toLowerCase().endsWith(".md")) continue;
    const { meta, content } = parseNote(file.text);
    const stem = fileName.replace(/\.md$/i, "");
    const nameFromStem = stem.replace(/^\d{4}-\d{2}-\d{2}-/, "");
    const filled: NoteMeta = {
      name: meta.name || nameFromStem || t("importedNote"),
      description: meta.description,
      type: meta.type,
      tags: meta.tags,
      dates:
        meta.dates.length > 0
          ? meta.dates
          : [{ date: defaultDate || toKey(new Date()), status: "", environment: "" }],
    };
    const target = await uniqueImportName(fileName);
    await getNoteStore().write(target, serializeNote(filled, content));
    saved.push(target);
  }
  return saved;
}

/** Let the user pick .md files and import them (see importPicked). */
export async function importNotes(defaultDate: string): Promise<string[]> {
  return importPicked(await pickFiles(), defaultDate);
}
