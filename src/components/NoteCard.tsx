import { typeColors } from "../lib/notes";
import { t } from "../lib/i18n";
import type { Note } from "../types";

interface NoteCardProps {
  note: Note;
  /** When given, status/environment badges show that date's entry. */
  forDate?: string;
  onOpen(fileName: string): void;
  onEdit(fileName: string): void;
  onDelete(note: Note): void;
  onDownload(note: Note): void;
  /** When provided, tags are rendered as clickable filter buttons. */
  onTagClick?(tag: string): void;
}

export default function NoteCard({ note, forDate, onOpen, onEdit, onDelete, onDownload, onTagClick }: NoteCardProps) {
  const c = typeColors(note.meta.type);
  const entry = forDate ? note.meta.dates.find((e) => e.date === forDate) : note.meta.dates[0];
  return (
    <article className="note-card" onClick={() => onOpen(note.fileName)}>
      <div className="note-card-top">
        {note.meta.type ? (
          <span className="badge" style={{ background: c.bg, color: c.fg }}>
            {note.meta.type}
          </span>
        ) : (
          <span className="badge muted">{t("noType")}</span>
        )}
        <div className="note-card-actions">
          <button
            className="btn icon"
            title={t("downloadMd")}
            onClick={(e) => {
              e.stopPropagation();
              onDownload(note);
            }}
          >
            <i className="fa-solid fa-download" aria-hidden="true" />
          </button>
          <button
            className="btn icon"
            title={t("editMd")}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(note.fileName);
            }}
          >
            <i className="fa-solid fa-pen" aria-hidden="true" />
          </button>
          <button
            className="btn icon danger"
            title={t("toTrash")}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(note);
            }}
          >
            <i className="fa-solid fa-trash-can" aria-hidden="true" />
          </button>
        </div>
      </div>
      <h3 className="note-card-title">{note.meta.name}</h3>
      {entry && (entry.status || entry.environment) && (
        <div className="entry-badges">
          {entry.status && <span className="sub-badge">{entry.status}</span>}
          {entry.environment && <span className="sub-badge env">{entry.environment}</span>}
        </div>
      )}
      {note.meta.description && <p className="note-card-desc">{note.meta.description}</p>}
      <div className="note-card-bottom">
        <div className="tags">
          {note.meta.tags.map((tag) =>
            onTagClick ? (
              <button
                key={tag}
                className="tag tag-btn"
                title={t("filterTag", { tag })}
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick(tag);
                }}
              >
                #{tag}
              </button>
            ) : (
              <span key={tag} className="tag">
                #{tag}
              </span>
            )
          )}
        </div>
        <span className="note-file" title={note.fileName}>
          {note.fileName}
        </span>
      </div>
    </article>
  );
}
