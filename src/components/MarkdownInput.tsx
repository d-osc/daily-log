import { useRef, useState } from "react";
import { t } from "../lib/i18n";
import MarkdownPreview from "./MarkdownPreview";

interface MarkdownInputProps {
  value: string;
  onChange(value: string): void;
}

interface LineAction {
  match: RegExp;
  strip(line: string): string;
  build(line: string, index: number): string;
}

export default function MarkdownInput({ value, onChange }: MarkdownInputProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  /**
   * Replace the whole value, preferring the native editing command so the
   * browser undo stack (Ctrl+Z) keeps working; falls back to onChange.
   */
  const apply = (next: string, selStart: number, selEnd: number) => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    let native = false;
    try {
      ta.setSelectionRange(0, ta.value.length);
      native = document.execCommand("insertText", false, next);
    } catch {
      native = false;
    }
    if (!native) {
      onChange(next);
    }
    requestAnimationFrame(() => ta.setSelectionRange(selStart, selEnd));
  };

  const wrapInline = (marker: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const selected = value.slice(s, e);
    const wrappedBefore = value.slice(Math.max(0, s - marker.length), s) === marker;
    const wrappedAfter = value.slice(e, e + marker.length) === marker;
    if (wrappedBefore && wrappedAfter) {
      // toggle off
      const next = value.slice(0, s - marker.length) + selected + value.slice(e + marker.length);
      apply(next, s - marker.length, e - marker.length);
      return;
    }
    const next = value.slice(0, s) + marker + selected + marker + value.slice(e);
    apply(next, s + marker.length, e + marker.length);
  };

  const lineAction = (opts: LineAction) => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    let lineEnd = value.indexOf("\n", e);
    if (lineEnd === -1) lineEnd = value.length;
    const lines = value.slice(lineStart, lineEnd).split("\n");
    const allHave = lines.length > 0 && lines.every((l) => opts.match.test(l));
    const block = lines.map((l, i) => (allHave ? opts.strip(l) : opts.build(l, i))).join("\n");
    apply(value.slice(0, lineStart) + block + value.slice(lineEnd), lineStart, lineStart + block.length);
  };

  /** Surround the selection with strings, using a placeholder when nothing is selected. */
  const insertAround = (before: string, after: string, placeholder: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const selected = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + selected + after + value.slice(e);
    const innerStart = s + before.length;
    apply(next, innerStart, innerStart + selected.length);
  };

  const insertBlockText = (text: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const nl = s > 0 && value[s - 1] !== "\n" ? "\n" : "";
    const block = nl + text;
    const next = value.slice(0, s) + block + value.slice(s);
    apply(next, s + block.length, s + block.length);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const ta = taRef.current;
      if (!ta) return;
      const s = ta.selectionStart;
      const end = ta.selectionEnd;
      apply(value.slice(0, s) + "  " + value.slice(end), s + 2, s + 2);
    }
  };

  const tool = (title: string, icon: string, action: () => void) => (
    <button
      key={title}
      type="button"
      className="btn icon"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={action}
    >
      <i className={`fa-solid ${icon}`} aria-hidden="true" />
    </button>
  );

  return (
    <div className="md-editor">
      <div className="md-toolbar" role="toolbar" aria-label={t("toolbarAria")}>
        {tool(t("tlHeading"), "fa-heading", () =>
          lineAction({
            match: /^#\s/,
            strip: (l) => l.replace(/^#\s/, ""),
            build: (l) => `# ${l}`,
          })
        )}
        {tool(t("tlBold"), "fa-bold", () => wrapInline("**"))}
        {tool(t("tlItalic"), "fa-italic", () => wrapInline("*"))}
        {tool(t("tlStrike"), "fa-strikethrough", () => wrapInline("~~"))}
        <span className="divider-v" />
        {tool(t("tlUl"), "fa-list-ul", () =>
          lineAction({
            match: /^[-*]\s/,
            strip: (l) => l.replace(/^[-*]\s/, ""),
            build: (l) => `- ${l}`,
          })
        )}
        {tool(t("tlOl"), "fa-list-ol", () =>
          lineAction({
            match: /^\d+\.\s/,
            strip: (l) => l.replace(/^\d+\.\s/, ""),
            build: (l, i) => `${i + 1}. ${l}`,
          })
        )}
        {tool(t("tlTask"), "fa-square-check", () =>
          lineAction({
            match: /^- \[[ x]\]\s/,
            strip: (l) => l.replace(/^- \[[ x]\]\s/, ""),
            build: (l) => `- [ ] ${l}`,
          })
        )}
        {tool(t("tlRadio"), "fa-circle-dot", () =>
          lineAction({
            match: /^[-*]\s+\(( |x|X)\)\s/,
            strip: (l) => l.replace(/^[-*]\s+\(( |x|X)\)\s/, ""),
            build: (l) => `- ( ) ${l}`,
          })
        )}
        {tool(t("tlSelect"), "fa-square-caret-down", () =>
          lineAction({
            match: /^[-*]\s+\([^)]*\|[^)]*\)\s/,
            strip: (l) => l.replace(/^[-*]\s+\([^)]*\)\s?/, ""),
            build: (l) => `- (option A|option B|option C) ${l}`,
          })
        )}
        {tool(t("tlQuote"), "fa-quote-left", () =>
          lineAction({
            match: /^>\s/,
            strip: (l) => l.replace(/^>\s/, ""),
            build: (l) => `> ${l}`,
          })
        )}
        <span className="divider-v" />
        {tool(t("tlCode"), "fa-code", () => wrapInline("`"))}
        {tool(t("tlCodeBlock"), "fa-file-code", () => insertAround("```\n", "\n```", t("phCode")))}
        {tool(t("tlLink"), "fa-link", () => insertAround("[", "](url)", t("phText")))}
        {tool(t("tlTable"), "fa-table", () =>
          insertBlockText(`| ${t("tableColA")} | ${t("tableColB")} |` + "\n" + "| --- | --- |" + "\n" + `| ${t("tableData")} | ${t("tableData")} |`)
        )}
        {tool(t("tlHr"), "fa-minus", () => insertBlockText("---\n"))}
        <span className="grow" />
        <button
          type="button"
          className={`btn icon ${showPreview ? "active" : ""}`}
          title={showPreview ? t("hidePreview") : t("showPreview")}
          aria-label={t("previewToggle")}
          aria-pressed={showPreview}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowPreview((v) => !v)}
        >
          <i className={`fa-solid ${showPreview ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
        </button>
      </div>
      <div className={`md-editor-body${showPreview ? " with-preview" : ""}`}>
        <textarea
          ref={taRef}
          className="mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("contentPlaceholder")}
          spellCheck={false}
        />
        {showPreview && (
          <div className="md-preview">
            <MarkdownPreview source={value} onSourceChange={onChange} />
          </div>
        )}
      </div>
    </div>
  );
}
