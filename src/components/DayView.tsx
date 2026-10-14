import { formatThaiDate } from "../lib/date";
import { t } from "../lib/i18n";
import type { Note } from "../types";
import NoteCard from "./NoteCard";

interface DayViewProps {
  dateKey: string;
  notes: Note[];
  onBack(): void;
  onAdd(): void;
  onOpen(fileName: string): void;
  onEdit(fileName: string): void;
  onDelete(note: Note): void;
  onDownload(note: Note): void;
  onImport(): void;
}

export default function DayView({ dateKey, notes, onBack, onAdd, onOpen, onEdit, onDelete, onDownload, onImport }: DayViewProps) {
  return (
    <div className="day-view">
      <header className="view-header">
        <button className="btn ghost" onClick={onBack}>
          <i className="fa-solid fa-arrow-left" aria-hidden="true" /> {t("backCalendar")}
        </button>
        <div className="view-actions">
          <button className="btn" onClick={onImport} title={t("importMdTitle")}>
            <i className="fa-solid fa-file-import" aria-hidden="true" /> {t("importMd")}
          </button>
          <button className="btn primary" onClick={onAdd}>
            <i className="fa-solid fa-plus" aria-hidden="true" /> {t("addNote")}
          </button>
        </div>
      </header>

      <h2 className="day-title">{formatThaiDate(dateKey)}</h2>

      {notes.length === 0 ? (
        <div className="empty-state">
          <i className="fa-solid fa-inbox empty-icon" aria-hidden="true" />
          <p>{t("noNotesToday")}</p>
          <button className="btn primary" onClick={onAdd}>
            <i className="fa-solid fa-plus" aria-hidden="true" /> {t("createFirst")}
          </button>
        </div>
      ) : (
        <div className="card-grid">
          {notes.map((note) => (
            <NoteCard
              key={note.fileName}
              note={note}
              forDate={dateKey}
              onOpen={onOpen}
              onEdit={onEdit}
              onDelete={onDelete}
              onDownload={onDownload}
            />
          ))}
        </div>
      )}
    </div>
  );
}
