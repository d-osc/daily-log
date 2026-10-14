import { formatThaiDate } from "../lib/date";
import { t } from "../lib/i18n";
import { typeColors } from "../lib/notes";
import type { Note } from "../types";
import MarkdownPreview from "./MarkdownPreview";

interface NoteViewProps {
  note: Note;
  onBack(): void;
  onEdit(): void;
  onDelete(): void;
  onDownload(): void;
  /** Detach into an always-on-top floating window (desktop only). */
  onDetach?(): void;
  /** Task-list checkboxes in the preview toggle the note content. */
  onContentChange?(content: string): void;
}

export default function NoteView({ note, onBack, onEdit, onDelete, onDownload, onDetach, onContentChange }: NoteViewProps) {
  const c = typeColors(note.meta.type);
  return (
    <div className="note-view">
      <header className="view-header">
        <button className="btn ghost" onClick={onBack}>
          <i className="fa-solid fa-arrow-left" aria-hidden="true" /> {t("back")}
        </button>
        <div className="view-actions">
          <button className="btn" onClick={onDownload}>
            <i className="fa-solid fa-download" aria-hidden="true" /> {t("download")}
          </button>
          <button className="btn" onClick={onEdit}>
            <i className="fa-solid fa-pen" aria-hidden="true" /> {t("edit")}
          </button>
          <button className="btn danger" onClick={onDelete}>
            <i className="fa-solid fa-trash-can" aria-hidden="true" /> {t("delete")}
          </button>
        </div>
      </header>

      <div className="note-sheet">
        {onDetach && (
          <button
            className="btn icon sheet-detach"
            onClick={onDetach}
            title={t("detachWindow")}
            aria-label={t("detachWindow")}
          >
            <i className="fa-solid fa-up-right-from-square" aria-hidden="true" />
          </button>
        )}
        <div className="note-meta">
          <h2 className="note-title">{note.meta.name}</h2>
          <div className="meta-row">
            {note.meta.type ? (
              <span className="badge" style={{ background: c.bg, color: c.fg }}>
                {note.meta.type}
              </span>
            ) : (
              <span className="badge muted">{t("noType")}</span>
            )}
            <div className="note-dates">
              {note.meta.dates.map((entry) => (
                <span key={entry.date} className="date-chip">
                  <i className="fa-solid fa-calendar-day" aria-hidden="true" /> {formatThaiDate(entry.date)}
                  {entry.status && <span className="chip-sub">{entry.status}</span>}
                  {entry.environment && <span className="chip-sub">{entry.environment}</span>}
                </span>
              ))}
            </div>
          </div>
          {note.meta.description && <p className="note-desc">{note.meta.description}</p>}
          {note.meta.tags.length > 0 && (
            <div className="tags">
              {note.meta.tags.map((t) => (
                <span key={t} className="tag">
                  #{t}
                </span>
              ))}
            </div>
          )}
          <div className="meta-file">{t("fileLabel", { name: note.fileName })}</div>
        </div>

        <hr className="divider" />

        {note.content.trim() ? (
          <MarkdownPreview source={note.content} onSourceChange={onContentChange} />
        ) : (
          <p className="note-desc">{t("noContent")}</p>
        )}
      </div>
    </div>
  );
}
