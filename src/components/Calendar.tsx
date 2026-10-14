import { useMemo } from "react";
import type { CSSProperties } from "react";
import { formatMonth, monthGrid, toKey, weekdays } from "../lib/date";
import { t } from "../lib/i18n";
import { typeColors } from "../lib/notes";
import type { Note } from "../types";
import NoteCard from "./NoteCard";

interface CalendarProps {
  month: Date;
  /** All notes grouped by date — used for the month type stats. */
  notesByDate: Map<string, Note[]>;
  /** Filtered notes grouped by date — used for day chips and the count. */
  filteredByDate: Map<string, Note[]>;
  typeOptions: string[];
  query: string;
  onQueryChange(query: string): void;
  typeFilter: string;
  onTypeFilterChange(type: string): void;
  tagFilter: string | null;
  onTagFilterChange(tag: string | null): void;
  searchResults: Note[];
  trashCount: number;
  onPrev(): void;
  onNext(): void;
  onToday(): void;
  onSelectDay(dateKey: string): void;
  onImport(): void;
  onOpenTrash(): void;
  onOpenNote(fileName: string): void;
  onEditNote(fileName: string): void;
  onDeleteNote(note: Note): void;
  onDownloadNote(note: Note): void;
}

export default function Calendar({
  month,
  notesByDate,
  filteredByDate,
  typeOptions,
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  tagFilter,
  onTagFilterChange,
  searchResults,
  trashCount,
  onPrev,
  onNext,
  onToday,
  onSelectDay,
  onImport,
  onOpenTrash,
  onOpenNote,
  onEditNote,
  onDeleteNote,
  onDownloadNote,
}: CalendarProps) {
  const cells = useMemo(() => monthGrid(month), [month]);
  const todayKey = toKey(new Date());
  const monthLabel = formatMonth(month);
  const searching = query.trim().length > 0;

  // Month type composition (unfiltered — it summarizes the whole month)
  const monthStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of cells) {
      if (d.getMonth() !== month.getMonth()) continue;
      for (const note of notesByDate.get(toKey(d)) ?? []) {
        counts.set(note.meta.type, (counts.get(note.meta.type) ?? 0) + 1);
      }
    }
    return counts;
  }, [cells, month, notesByDate]);

  const filteredTotal = useMemo(
    () =>
      cells
        .filter((d) => d.getMonth() === month.getMonth())
        .reduce((sum, d) => sum + (filteredByDate.get(toKey(d))?.length ?? 0), 0),
    [cells, month, filteredByDate]
  );

  return (
    <div className="calendar">
      <div className="calendar-toolbar">
        <div className="toolbar-group">
          <button className="btn icon" onClick={onPrev} aria-label={t("prevMonth")}>
            <i className="fa-solid fa-chevron-left" aria-hidden="true" />
          </button>
          <button className="btn icon" onClick={onNext} aria-label={t("nextMonth")}>
            <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          </button>
          <button className="btn ghost" onClick={onToday}>
            <i className="fa-solid fa-calendar-day" aria-hidden="true" /> {t("today")}
          </button>
          <button className="btn ghost" onClick={onImport} title={t("importMdTitle")}>
            <i className="fa-solid fa-file-import" aria-hidden="true" /> {t("importMd")}
          </button>
          <button className="btn ghost" onClick={onOpenTrash} title={t("trashTitle")}>
            <i className="fa-solid fa-trash-can" aria-hidden="true" /> {t("trash")}
            {trashCount > 0 && <span className="count-badge">{trashCount}</span>}
          </button>
        </div>
        <h2 className="month-label">{monthLabel}</h2>
      </div>

      <div className="calendar-filters">
        <div className="search-box">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
          />
          {query && (
            <button className="btn icon clear-btn" onClick={() => onQueryChange("")} aria-label={t("clearSearch")}>
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          )}
        </div>
        <select
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value)}
          aria-label={t("filterByType")}
          title={t("filterByType")}
        >
          <option value="">{t("allTypes")}</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value="__none__">{t("noType")}</option>
        </select>
        {tagFilter && (
          <button className="filter-tag" onClick={() => onTagFilterChange(null)} title={t("clearTagFilter")}>
            #{tagFilter} <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        )}
      </div>

      {searching ? (
        <div className="search-results">
          <div className="results-header">{t("searchResults", { n: searchResults.length })}</div>
          {searchResults.length === 0 ? (
            <div className="empty-state">
              <i className="fa-solid fa-magnifying-glass empty-icon" aria-hidden="true" />
              <p>{t("noResults")}</p>
            </div>
          ) : (
            <div className="card-grid">
              {searchResults.map((note) => (
                <NoteCard
                  key={note.fileName}
                  note={note}
                  onOpen={onOpenNote}
                  onEdit={onEditNote}
                  onDelete={onDeleteNote}
                  onDownload={onDownloadNote}
                  onTagClick={onTagFilterChange}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="month-stats">
            <span className="calendar-count">{t("monthCount", { n: filteredTotal })}</span>
            {[...monthStats.entries()].map(([type, count]) => {
              const c = typeColors(type);
              return (
                <span
                  key={type || "__none__"}
                  className="stat-chip"
                  style={{ background: c.bg, color: c.fg } as CSSProperties}
                >
                  {type || t("noType")} {count}
                </span>
              );
            })}
          </div>

          <div className="calendar-grid weekday-row">
            {weekdays().map((w) => (
              <div key={w} className="weekday">
                {w}
              </div>
            ))}
          </div>

          <div className="calendar-grid">
            {cells.map((d) => {
              const key = toKey(d);
              const items = filteredByDate.get(key) ?? [];
              const otherMonth = d.getMonth() !== month.getMonth();
              const cls = [
                "day-cell",
                otherMonth ? "other-month" : "",
                key === todayKey ? "today" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button key={key} className={cls} onClick={() => onSelectDay(key)}>
                  <span className="day-number">{d.getDate()}</span>
                  <span className="day-items">
                    {items.slice(0, 3).map((note) => {
                      const c = typeColors(note.meta.type);
                      return (
                        <span
                          key={note.fileName}
                          className="task-chip"
                          style={{ background: c.bg, color: c.fg, borderLeftColor: c.dot } as CSSProperties}
                        >
                          {note.meta.name}
                        </span>
                      );
                    })}
                    {items.length > 3 && <span className="task-chip more">{t("moreChip", { n: items.length - 3 })}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
