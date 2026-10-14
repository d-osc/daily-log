export interface DateEntry {
  /** "YYYY-MM-DD" */
  date: string;
  status: string;
  environment: string;
}

export interface NoteMeta {
  name: string;
  description: string;
  type: string;
  tags: string[];
  /** Each entry puts the note on that date, with optional per-date status/environment */
  dates: DateEntry[];
}

export interface Note {
  /** File name including the .md extension, e.g. "2026-09-18-example.md" */
  fileName: string;
  meta: NoteMeta;
  /** Markdown body without the frontmatter block */
  content: string;
}
