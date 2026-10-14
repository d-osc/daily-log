import { useCallback, useEffect, useMemo, useState } from "react";
import { appDataDir } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import Calendar from "./components/Calendar";
import ConfirmDialog from "./components/ConfirmDialog";
import DayView from "./components/DayView";
import NoteEditor from "./components/NoteEditor";
import NoteView from "./components/NoteView";
import MarkdownPreview from "./components/MarkdownPreview";
import SettingsView from "./components/SettingsView";
import TrashView from "./components/TrashView";
import { toKey } from "./lib/date";
import { serializeNote } from "./lib/frontmatter";
import { t, useLang } from "./lib/i18n";
import { getNoteStore, resetNoteStore, uniqueFileName, fileNameFor, isTauri, NOTE_TYPES } from "./lib/notes";
import {
  getTheme,
  setTheme,
  loadCustomTypes,
  saveCustomTypes,
  loadCustomStatuses,
  saveCustomStatuses,
  loadCustomEnvironments,
  saveCustomEnvironments,
  loadNotesFolder,
  saveNotesFolder,
} from "./lib/settings";
import type { Theme } from "./lib/settings";
import { downloadNote, importNotes, importPicked } from "./lib/transfer";
import { openNoteWindow } from "./lib/floating";
import type { Note, NoteMeta } from "./types";

type View =
  | { page: "calendar" }
  | { page: "day"; dateKey: string }
  | { page: "note"; fileName: string }
  | { page: "edit"; dateKey: string; fileName: string | null }
  | { page: "settings"; back: View }
  | { page: "trash"; back: View };

type PendingDelete =
  | { kind: "trash"; note: Note }
  | { kind: "forever"; note: Note }
  | { kind: "empty" };

const NO_TYPE_FILTER = "__none__";

/** Set when this window was opened as a floating note card (?floating=note&file=...). */
const FLOATING_FILE = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("floating") === "note" ? params.get("file") ?? "" : null;
  } catch {
    return null;
  }
})();

export default function App() {
  useLang(); // re-render on language change
  const [notes, setNotes] = useState<Note[]>([]);
  const [trash, setTrash] = useState<Note[]>([]);
  const [view, setView] = useState<View>(() =>
    FLOATING_FILE ? { page: "note", fileName: FLOATING_FILE } : { page: "calendar" }
  );
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageLabel, setStorageLabel] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const [customTypes, setCustomTypes] = useState<string[]>(() => loadCustomTypes());
  const [customStatuses, setCustomStatuses] = useState<string[]>(() => loadCustomStatuses());
  const [customEnvironments, setCustomEnvironments] = useState<string[]>(() => loadCustomEnvironments());
  const [notesFolder, setNotesFolder] = useState<string | null>(() => loadNotesFolder());
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [noteList, trashList] = await Promise.all([getNoteStore().list(), getNoteStore().listTrash()]);
      setNotes(noteList);
      setTrash(trashList);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (isTauri) {
      appDataDir()
        .then((dir) => setStorageLabel(notesFolder ?? `${t("storagePrefix")}${dir}\\notes`))
        .catch(() => setStorageLabel(notesFolder ?? ""))
    } else {
      setStorageLabel(t("browserMode"));
    }
  }, [notesFolder]);

  const myLabel = isTauri ? getCurrentWindow().label : "main";
  const notifyOtherWindows = useCallback(() => {
    if (!isTauri) return;
    void emit("daily-log:notes-changed", myLabel);
  }, [myLabel]);

  // keep multiple windows (main + floating note card) in sync
  useEffect(() => {
    if (!isTauri) return;
    const unlisten = listen<string>("daily-log:notes-changed", (event) => {
      if (event.payload !== myLabel) void refresh();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [refresh, myLabel]);

  // floating window: close itself when its note is gone (deleted/trashed elsewhere)
  const closeFloatingWindow = useCallback(() => {
    if (isTauri) void getCurrentWindow().close();
    else window.close(); // browser popup fallback (works for JS-opened windows)
  }, []);

  useEffect(() => {
    if (FLOATING_FILE !== null && !loading && !error) {
      const stillThere = notes.some((n) => n.fileName === FLOATING_FILE);
      if (!stillThere) closeFloatingWindow();
    }
  }, [notes, loading, error, closeFloatingWindow]);

  const changeNotesFolder = (folder: string | null) => {
    saveNotesFolder(folder);
    resetNoteStore();
    setNotesFolder(folder);
    void refresh();
  };

  const notesByDate = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const note of notes) {
      for (const entry of note.meta.dates) {
        const list = map.get(entry.date);
        if (list) list.push(note);
        else map.set(entry.date, [note]);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.meta.name.localeCompare(b.meta.name, "th"));
    }
    return map;
  }, [notes]);

  const noteByFile = useMemo(() => new Map(notes.map((n) => [n.fileName, n])), [notes]);

  const filterMatch = useCallback(
    (note: Note) => {
      if (typeFilter === NO_TYPE_FILTER) {
        if (note.meta.type) return false;
      } else if (typeFilter && note.meta.type !== typeFilter) {
        return false;
      }
      if (tagFilter && !note.meta.tags.includes(tagFilter)) return false;
      const q = query.trim().toLowerCase();
      if (q) {
        const haystack =
          `${note.meta.name}\n${note.meta.description}\n${note.meta.tags.join(" ")}\n${note.content}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    },
    [query, typeFilter, tagFilter]
  );

  const filteredByDate = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const note of notes) {
      if (!filterMatch(note)) continue;
      for (const entry of note.meta.dates) {
        const list = map.get(entry.date);
        if (list) list.push(note);
        else map.set(entry.date, [note]);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.meta.name.localeCompare(b.meta.name, "th"));
    }
    return map;
  }, [notes, filterMatch]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return notes
      .filter(filterMatch)
      .sort(
        (a, b) =>
          (b.meta.dates[0]?.date ?? "").localeCompare(a.meta.dates[0]?.date ?? "") ||
          a.meta.name.localeCompare(b.meta.name, "th")
      );
  }, [notes, filterMatch, query]);

  const activeNote = view.page === "note" ? noteByFile.get(view.fileName) : undefined;
  const editingNote =
    view.page === "edit" && view.fileName ? noteByFile.get(view.fileName) : undefined;

  /** Write (create or update) a note file. Returns the final file name, or null on error. */
  const saveNote = useCallback(
    async (existingFile: string | null, meta: NoteMeta, content: string): Promise<string | null> => {
      try {
        const raw = serializeNote(meta, content);
        let fileName: string;
        if (existingFile) {
          fileName = existingFile;
          const desired = fileNameFor(meta);
          if (desired !== existingFile) {
            const target = await uniqueFileName(meta, existingFile);
            if (target !== existingFile) {
              await getNoteStore().rename(existingFile, target);
              fileName = target;
            }
          }
        } else {
          fileName = await uniqueFileName(meta);
        }
        await getNoteStore().write(fileName, raw);
        await refresh();
        notifyOtherWindows();
        return fileName;
      } catch (e) {
        setError(String(e));
        return null;
      }
    },
    [refresh]
  );

  const handleTrash = (note: Note) => setPendingDelete({ kind: "trash", note });

  const confirmDelete = async () => {
    const pending = pendingDelete;
    setPendingDelete(null);
    if (!pending) return;
    try {
      if (pending.kind === "trash") {
        const note = pending.note;
        await getNoteStore().trash(note.fileName);
        await refresh();
        notifyOtherWindows();
        setView((v) => {
          if ((v.page === "note" || v.page === "edit") && v.fileName === note.fileName) {
            const firstDate = note.meta.dates[0]?.date ?? "";
            return firstDate && note.meta.dates.length === 1
              ? { page: "day", dateKey: firstDate }
              : { page: "calendar" };
          }
          return v;
        });
      } else if (pending.kind === "forever") {
        await getNoteStore().deleteForever(pending.note.fileName);
        await refresh();
        notifyOtherWindows();
      } else {
        await getNoteStore().emptyTrash();
        await refresh();
        notifyOtherWindows();
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const restoreNote = async (fileName: string) => {
    try {
      const restored = await getNoteStore().restore(fileName);
      await refresh();
      notifyOtherWindows();
      setView({ page: "note", fileName: restored });
    } catch (e) {
      setError(String(e));
    }
  };

  const changeNoteContent = useCallback(
    async (note: Note, content: string) => {
      try {
        await getNoteStore().write(note.fileName, serializeNote(note.meta, content));
        await refresh();
        notifyOtherWindows();
      } catch (e) {
        setError(String(e));
      }
    },
    [refresh, notifyOtherWindows]
  );

  const handleDownload = async (note: Note) => {
    try {
      await downloadNote(note);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleImport = async (defaultDate: string) => {
    try {
      const saved = await importNotes(defaultDate);
      if (saved.length > 0) {
        await refresh();
        notifyOtherWindows();
        if (saved.length === 1) setView({ page: "note", fileName: saved[0] });
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  const addCustomType = (type: string) => {
    if (customTypes.includes(type) || (NOTE_TYPES as readonly string[]).includes(type)) return;
    const next = [...customTypes, type];
    saveCustomTypes(next);
    setCustomTypes(next);
  };

  const removeCustomType = (type: string) => {
    const next = customTypes.filter((t) => t !== type);
    saveCustomTypes(next);
    setCustomTypes(next);
  };

  const addCustomStatus = (status: string) => {
    if (customStatuses.includes(status)) return;
    const next = [...customStatuses, status];
    saveCustomStatuses(next);
    setCustomStatuses(next);
  };

  const removeCustomStatus = (status: string) => {
    const next = customStatuses.filter((s) => s !== status);
    saveCustomStatuses(next);
    setCustomStatuses(next);
  };

  const addCustomEnvironment = (environment: string) => {
    if (customEnvironments.includes(environment)) return;
    const next = [...customEnvironments, environment];
    saveCustomEnvironments(next);
    setCustomEnvironments(next);
  };

  const removeCustomEnvironment = (environment: string) => {
    const next = customEnvironments.filter((e) => e !== environment);
    saveCustomEnvironments(next);
    setCustomEnvironments(next);
  };

  const shiftMonth = (delta: number) => {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  // Calendar keyboard shortcuts: ←/→ change month, t = today (ignored while typing)
  useEffect(() => {
    if (view.page !== "calendar") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) {
        return;
      }
      if (e.key === "ArrowLeft") {
        setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
      } else if (e.key === "ArrowRight") {
        setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
      } else if (e.key === "t" || e.key === "T") {
        const now = new Date();
        setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.page]);

  // Drag & drop .md import
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragOver(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragOver(false);
    };
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => /\.(md|markdown|txt)$/i.test(f.name));
      if (files.length === 0) return;
      try {
        const picked = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
        const defaultDate = view.page === "day" ? view.dateKey : toKey(new Date());
        const saved = await importPicked(picked, defaultDate);
        if (saved.length > 0) {
          await refresh();
          notifyOtherWindows();
          if (saved.length === 1) setView({ page: "note", fileName: saved[0] });
        }
      } catch (err) {
        setError(String(err));
      }
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [view, refresh]);

  const dialogText =
    pendingDelete?.kind === "trash"
      ? {
          title: t("moveToTrashTitle"),
          message: t("moveToTrashMsg", { name: pendingDelete.note.fileName }),
          confirmLabel: t("moveToTrashBtn"),
        }
      : pendingDelete?.kind === "forever"
        ? {
            title: t("deleteForeverTitle"),
            message: t("deleteForeverMsg", { name: pendingDelete.note.fileName }),
            confirmLabel: t("deleteForeverBtn"),
          }
        : pendingDelete
          ? {
              title: t("emptyTrashTitle"),
              message: t("emptyTrashMsg", { n: trash.length }),
              confirmLabel: t("emptyTrashBtn"),
            }
          : null;

  const isFloating = FLOATING_FILE !== null;

  return (
    <div className="app">
      {!isFloating && (
      <nav className="activity-bar">
        <button
          className="app-brand"
          onClick={() => setView({ page: "calendar" })}
          title={t("backToCalendar")}
          aria-label={t("appName")}
        >
          <span className="app-logo">
            <i className="fa-solid fa-calendar-days" aria-hidden="true" />
          </span>
        </button>
        <div className="grow" />
        <button
          className="btn icon"
          onClick={toggleTheme}
          title={theme === "dark" ? t("toggleLight") : t("toggleDark")}
          aria-label={theme === "dark" ? t("toggleLight") : t("toggleDark")}
        >
          <i className={theme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon"} aria-hidden="true" />
        </button>
        <button
          className="btn icon"
          onClick={() => setView({ page: "settings", back: view })}
          title={t("settings")}
          aria-label={t("settings")}
        >
          <i className="fa-solid fa-gear" aria-hidden="true" />
        </button>
      </nav>

      )}
      <div className="app-body">
        <main className={isFloating ? "app-main floating-main" : "app-main"}>
        {error && (
          <div className="alert-error">
            <span>{error}</span>
            <button className="btn ghost" onClick={() => setError(null)}>
              {t("close")}
            </button>
          </div>
        )}

        {loading && view.page === "calendar" && notes.length === 0 && (
          <div className="loading">{t("loading")}</div>
        )}

        {view.page === "calendar" && (
          <Calendar
            month={month}
            notesByDate={notesByDate}
            filteredByDate={filteredByDate}
            typeOptions={[...NOTE_TYPES, ...customTypes]}
            query={query}
            onQueryChange={setQuery}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
            searchResults={searchResults}
            trashCount={trash.length}
            onPrev={() => shiftMonth(-1)}
            onNext={() => shiftMonth(1)}
            onToday={() => {
              const now = new Date();
              setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
            onSelectDay={(dateKey) => setView({ page: "day", dateKey })}
            onImport={() => handleImport(toKey(new Date()))}
            onOpenTrash={() => setView({ page: "trash", back: view })}
            onOpenNote={(fileName) => setView({ page: "note", fileName })}
            onEditNote={(fileName) => {
              const note = noteByFile.get(fileName);
              setView({ page: "edit", dateKey: note?.meta.dates[0]?.date || toKey(new Date()), fileName });
            }}
            onDeleteNote={handleTrash}
            onDownloadNote={handleDownload}
          />
        )}

        {view.page === "day" && (
          <DayView
            dateKey={view.dateKey}
            notes={filteredByDate.get(view.dateKey) ?? []}
            onBack={() => setView({ page: "calendar" })}
            onAdd={() => setView({ page: "edit", dateKey: view.dateKey, fileName: null })}
            onOpen={(fileName) => setView({ page: "note", fileName })}
            onEdit={(fileName) => setView({ page: "edit", dateKey: view.dateKey, fileName })}
            onDelete={handleTrash}
            onDownload={handleDownload}
            onImport={() => handleImport(view.dateKey)}
          />
        )}

        {isFloating
          ? activeNote && (
              <div className="floating-note">
                <button
                  className="btn icon floating-close"
                  onClick={closeFloatingWindow}
                  title={t("closeWindow")}
                  aria-label={t("closeWindow")}
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
                {activeNote.content.trim() ? (
                  <MarkdownPreview
                    source={activeNote.content}
                    onSourceChange={(content) => void changeNoteContent(activeNote, content)}
                  />
                ) : (
                  <p className="note-desc">{t("noContent")}</p>
                )}
              </div>
            )
          : view.page === "note" && activeNote && (
              <NoteView
                note={activeNote}
                onBack={() =>
                  activeNote.meta.dates.length === 1
                    ? setView({ page: "day", dateKey: activeNote.meta.dates[0].date })
                    : setView({ page: "calendar" })
                }
                onEdit={() =>
                  setView({
                    page: "edit",
                    dateKey: activeNote.meta.dates[0]?.date || toKey(new Date()),
                    fileName: activeNote.fileName,
                  })
                }
                onDelete={() => handleTrash(activeNote)}
                onDownload={() => handleDownload(activeNote)}
                onDetach={() => {
                  openNoteWindow(activeNote.fileName, activeNote.meta.name).catch((e) =>
                    setError(`openNoteWindow: ${String(e)}`)
                  );
                }}
                onContentChange={(content) => void changeNoteContent(activeNote, content)}
              />
            )}

        {view.page === "edit" && (
            <NoteEditor
            key={view.fileName ?? "new"}
            note={editingNote}
            defaultDate={view.dateKey}
            customTypes={customTypes}
            customStatuses={customStatuses}
            customEnvironments={customEnvironments}
            onSave={async (existingFile, meta, content) => {
              const saved = await saveNote(existingFile, meta, content);
              if (saved) {
                setError(null);
                setView({ page: "note", fileName: saved });
              }
              return saved;
            }}
            onCancel={() => {
              if (view.fileName) setView({ page: "note", fileName: view.fileName });
              else setView({ page: "day", dateKey: view.dateKey });
            }}
          />
        )}

        {view.page === "settings" && (
          <SettingsView
            customTypes={customTypes}
            onAddType={addCustomType}
            onRemoveType={removeCustomType}
            customStatuses={customStatuses}
            onAddStatus={addCustomStatus}
            onRemoveStatus={removeCustomStatus}
            customEnvironments={customEnvironments}
            onAddEnvironment={addCustomEnvironment}
            onRemoveEnvironment={removeCustomEnvironment}
            notesFolder={notesFolder}
            onChangeNotesFolder={changeNotesFolder}
            onAfterRestore={refresh}
            onBack={() => setView(view.back)}
          />
        )}

        {view.page === "trash" && (
          <TrashView
            notes={trash}
            onBack={() => setView(view.back)}
            onRestore={restoreNote}
            onDeleteForever={(note) => setPendingDelete({ kind: "forever", note })}
            onEmptyTrash={() => setPendingDelete({ kind: "empty" })}
          />
        )}
        </main>

        {!isFloating && (
        <footer className="status-bar">
          <i className="fa-solid fa-folder-open" aria-hidden="true" />
          {storageLabel && (
            <span className="storage-label" title={storageLabel}>
              {storageLabel}
            </span>
          )}
        </footer>
        )}

      </div>

      {dialogText && (
        <ConfirmDialog
          title={dialogText.title}
          message={dialogText.message}
          confirmLabel={dialogText.confirmLabel}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {dragOver && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-box">
            <i className="fa-solid fa-file-import" aria-hidden="true" />
            {t("dropToImport")}
          </div>
        </div>
      )}
    </div>
  );
}
