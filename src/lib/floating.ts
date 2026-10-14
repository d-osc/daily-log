import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauri } from "./notes";

export const NOTE_WINDOW_LABEL = "notecard";

/**
 * Open (or re-target) the floating always-on-top window showing one note.
 * Desktop uses a native Tauri window; in the browser it falls back to a small
 * popup window showing the same content-only view.
 */
export async function openNoteWindow(fileName: string, title: string): Promise<void> {
  if (!isTauri) {
    window.open(
      `?floating=note&file=${encodeURIComponent(fileName)}`,
      "_blank",
      "popup,width=600,height=680"
    );
    return;
  }
  const existing = await WebviewWindow.getByLabel(NOTE_WINDOW_LABEL);
  if (existing) {
    await existing.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  new WebviewWindow(NOTE_WINDOW_LABEL, {
    title,
    url: `index.html?floating=note&file=${encodeURIComponent(fileName)}`,
    width: 600,
    height: 680,
    minWidth: 400,
    minHeight: 320,
    resizable: true,
    alwaysOnTop: true,
    center: true,
  });
}
