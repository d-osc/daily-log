import { formatThaiDate } from "../lib/date";
import { t } from "../lib/i18n";
import { typeColors } from "../lib/notes";
import type { Note } from "../types";

interface TrashViewProps {
  notes: Note[];
  onBack(): void;
  onRestore(fileName: string): void;
  onDeleteForever(note: Note): void;
  onEmptyTrash(): void;
}

export default function TrashView({ notes, onBack, onRestore, onDeleteForever, onEmptyTrash }: TrashViewProps) {
  return (
    <div className="trash-view">
      <header className="view-header">
        <button className="btn ghost" onClick={onBack}>
          <i className="fa-solid fa-arrow-left" aria-hidden="true" /> {t("back")}
        </button>
        <div className="view-actions">
          <button className="btn danger" onClick={onEmptyTrash} disabled={notes.length === 0}>
            <i className="fa-solid fa-fire" aria-hidden="true" /> {t("emptyTrashBtn")}
          </button>
        </div>
      </header>

      <h2 className="day-title">
        {t("trashHeading")} <span className="trash-count">({t("trashCount", { n: notes.length })})</span>
      </h2>

      {notes.length === 0 ? (
        <div className="empty-state">
          <i className="fa-solid fa-trash-can empty-icon" aria-hidden="true" />
          <p>{t("trashEmpty")}</p>
        </div>
      ) : (
        <div className="trash-list">
          {notes.map((note) => {
            const c = typeColors(note.meta.type);
            return (
              <div key={note.fileName} className="trash-row">
                {note.meta.type ? (
                  <span className="badge" style={{ background: c.bg, color: c.fg }}>
                    {note.meta.type}
                  </span>
                ) : (
                  <span className="badge muted">{t("noType")}</span>
                )}
                <div className="trash-info">
                  <span className="trash-title">{note.meta.name}</span>
                  <span className="trash-meta">
                    {formatThaiDate(note.meta.dates[0]?.date ?? "")}
                    {note.meta.dates.length > 1 ? " " + t("moreDays", { n: note.meta.dates.length - 1 }) : ""} · {note.fileName}
                  </span>
                </div>
                <div className="grow" />
                <button className="btn" onClick={() => onRestore(note.fileName)} title={t("restoreTitle")}>
                  <i className="fa-solid fa-rotate-left" aria-hidden="true" /> {t("restore")}
                </button>
                <button
                  className="btn icon danger"
                  title={t("delForeverTitle")}
                  onClick={() => onDeleteForever(note)}
                >
                  <i className="fa-solid fa-fire" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
