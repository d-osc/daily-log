import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { formatThaiDate, toKey } from "../lib/date";
import { t } from "../lib/i18n";
import { NOTE_TYPES, NOTE_STATUSES, NOTE_ENVIRONMENTS } from "../lib/notes";
import type { DateEntry, Note, NoteMeta } from "../types";
import MarkdownInput from "./MarkdownInput";

interface NoteEditorProps {
  note?: Note;
  defaultDate: string;
  customTypes: string[];
  customStatuses: string[];
  customEnvironments: string[];
  onSave(existingFile: string | null, meta: NoteMeta, content: string): Promise<string | null>;
  onCancel(): void;
}

export default function NoteEditor({
  note,
  defaultDate,
  customTypes,
  customStatuses,
  customEnvironments,
  onSave,
  onCancel,
}: NoteEditorProps) {
  const [name, setName] = useState(note?.meta.name ?? "");
  const [description, setDescription] = useState(note?.meta.description ?? "");
  const [type, setType] = useState(note?.meta.type ?? "");
  const [tags, setTags] = useState((note?.meta.tags ?? []).join(", "));
  const [dates, setDates] = useState<DateEntry[]>(() => {
    if (note?.meta.dates.length) return [...note.meta.dates];
    return [{ date: defaultDate || toKey(new Date()), status: "", environment: "" }];
  });
  const [draftDate, setDraftDate] = useState("");
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [content, setContent] = useState(note?.content ?? "");
  const [saving, setSaving] = useState(false);

  const typeOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const t of [...NOTE_TYPES, ...customTypes]) {
      if (!seen.has(t)) {
        seen.add(t);
        list.push(t);
      }
    }
    return list;
  }, [customTypes]);

  const statusOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const s of [...NOTE_STATUSES, ...customStatuses]) {
      if (!seen.has(s)) {
        seen.add(s);
        list.push(s);
      }
    }
    return list;
  }, [customStatuses]);

  const envOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const e of [...NOTE_ENVIRONMENTS, ...customEnvironments]) {
      if (!seen.has(e)) {
        seen.add(e);
        list.push(e);
      }
    }
    return list;
  }, [customEnvironments]);

  const addDate = () => {
    if (!draftDate) {
      // no date picked yet — open the calendar picker instead of doing nothing
      (dateInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null)?.showPicker?.();
      dateInputRef.current?.focus();
      return;
    }
    if (dates.some((e) => e.date === draftDate)) return;
    setDates((prev) => [...prev, { date: draftDate, status: "", environment: "" }].sort((a, b) => a.date.localeCompare(b.date)));
  };

  const updateEntry = (index: number, patch: Partial<DateEntry>) => {
    setDates((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const doSave = async () => {
    if (!name.trim() || dates.length === 0 || saving) return;
    setSaving(true);
    const meta: NoteMeta = {
      name: name.trim(),
      description: description.trim(),
      type: type.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      dates,
    };
    await onSave(note?.fileName ?? null, meta, content);
    setSaving(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void doSave();
  };

  return (
    <form
      className="editor"
      onSubmit={submit}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          void doSave();
        }
      }}
    >
      <header className="view-header">
        <button type="button" className="btn ghost" onClick={onCancel}>
          <i className="fa-solid fa-arrow-left" aria-hidden="true" /> {t("cancel")}
        </button>
        <div className="view-actions">
          <span className="editor-file">{note ? note.fileName : t("newFile")}</span>
          <button type="submit" className="btn primary" disabled={!name.trim() || dates.length === 0 || saving}>
            {saving ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> {t("saving")}
              </>
            ) : (
              <>
                <i className="fa-solid fa-floppy-disk" aria-hidden="true" /> {t("save")}
              </>
            )}
          </button>
        </div>
      </header>

      <div className="editor-grid">
        <label className="field">
          <span>
            {t("fieldName")}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            required
            autoFocus
          />
        </label>

        <label className="field">
          <span>{t("fieldType")}</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t("noTypeOption")}</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            {/* keep values from imported/legacy notes selectable */}
            {type && !typeOptions.includes(type) && <option value={type}>{type}</option>}
          </select>
        </label>

        <label className="field">
          <span>
            {t("fieldTag")}
          </span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("tagPlaceholder")} />
        </label>

        <label className="field field-full">
          <span>
            {t("fieldDate")}{" "}
            <em className="hint">{t("dateHint")}</em>
          </span>
          <div className="date-add-row">
            <input
              ref={dateInputRef}
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              aria-label={t("pickDate")}
            />
            <button
              type="button"
              className="btn"
              onClick={addDate}
              disabled={!!draftDate && dates.some((e) => e.date === draftDate)}
            >
              <i className="fa-solid fa-plus" aria-hidden="true" /> {t("addDate")}
            </button>
          </div>
          <div className="date-rows">
            {dates.map((entry, index) => (
              <div key={entry.date} className="date-entry-row">
                <span className="date-entry-label">
                  <i className="fa-solid fa-calendar-day" aria-hidden="true" /> {formatThaiDate(entry.date)}
                </span>
                <select
                  value={entry.status}
                  onChange={(e) => updateEntry(index, { status: e.target.value })}
                  aria-label={t("statusOf", { date: entry.date })}
                  title="Status"
                >
                  <option value="">— Status —</option>
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  {entry.status && !statusOptions.includes(entry.status) && (
                    <option value={entry.status}>{entry.status}</option>
                  )}
                </select>
                <select
                  value={entry.environment}
                  onChange={(e) => updateEntry(index, { environment: e.target.value })}
                  aria-label={t("envOf", { date: entry.date })}
                  title="Environment"
                >
                  <option value="">— Environment —</option>
                  {envOptions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                  {entry.environment && !envOptions.includes(entry.environment) && (
                    <option value={entry.environment}>{entry.environment}</option>
                  )}
                </select>
                <button
                  type="button"
                  className="btn icon danger"
                  onClick={() => setDates((prev) => prev.filter((_, i) => i !== index))}
                  aria-label={t("removeDate")}
                  title={t("removeDate")}
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          {dates.length === 0 && <span className="field-error">{t("needDate")}</span>}
        </label>

        <label className="field field-full">
          <span>{t("fieldDesc")}</span>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descPlaceholder")}
          />
        </label>

        <div className="field field-full">
          <span>{t("fieldContent")}</span>
          <MarkdownInput value={content} onChange={setContent} />
        </div>
      </div>
    </form>
  );
}
