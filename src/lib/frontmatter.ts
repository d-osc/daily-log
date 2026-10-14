import type { NoteMeta } from "../types";

function splitList(value: string): string[] {
  return value.split(",").map((s) => s.trim());
}

/**
 * Parse a raw .md file into frontmatter metadata + markdown body.
 * Frontmatter format (Status/Environment are comma-separated lists aligned
 * positionally with the Date list):
 * ---
 * Name: Example
 * Description: Example
 * Type:
 * Tag: test,job
 * Date: 2026-09-18,2026-09-21
 * Status: develop,support
 * Environment: develop,pvt
 * ---
 */
export function parseNote(raw: string): { meta: NoteMeta; content: string } {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  let name = "";
  let description = "";
  let type = "";
  let tags: string[] = [];
  let dateKeys: string[] = [];
  let statuses: string[] = [];
  let environments: string[] = [];

  if (text.startsWith("---")) {
    const lines = text.split("\n");
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        end = i;
        break;
      }
    }
    if (end !== -1) {
      for (let i = 1; i < end; i++) {
        const idx = lines[i].indexOf(":");
        if (idx === -1) continue;
        const key = lines[i].slice(0, idx).trim().toLowerCase();
        let value = lines[i].slice(idx + 1).trim();
        if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        switch (key) {
          case "name":
            name = value;
            break;
          case "description":
            description = value;
            break;
          case "type":
            type = value;
            break;
          case "tag":
            tags = value ? splitList(value).filter(Boolean) : [];
            break;
          case "date": {
            for (const part of splitList(value)) {
              const m = part.match(/^(\d{4}-\d{2}-\d{2})/);
              if (m && !dateKeys.includes(m[1])) dateKeys.push(m[1]);
            }
            break;
          }
          case "status":
            statuses = splitList(value);
            break;
          case "environment":
            environments = splitList(value);
            break;
        }
      }
      dateKeys.sort();
      const meta: NoteMeta = {
        name,
        description,
        type,
        tags,
        dates: dateKeys.map((date, i) => ({
          date,
          status: statuses[i] ?? "",
          environment: environments[i] ?? "",
        })),
      };
      const content = lines.slice(end + 1).join("\n").replace(/^\n+/, "");
      return { meta, content };
    }
  }
  return { meta: { name: "", description: "", type: "", tags: [], dates: [] }, content: text };
}

/** Serialize metadata + body back into the .md file format above. */
export function serializeNote(meta: NoteMeta, content: string): string {
  const frontmatter = [
    "---",
    `Name: ${meta.name}`,
    `Description: ${meta.description}`,
    `Type: ${meta.type}`,
    `Tag: ${meta.tags.join(",")}`,
    `Date: ${meta.dates.map((e) => e.date).join(",")}`,
    `Status: ${meta.dates.map((e) => e.status).join(",")}`,
    `Environment: ${meta.dates.map((e) => e.environment).join(",")}`,
    "---",
    "",
    "",
  ].join("\n");
  return frontmatter + content.replace(/\s+$/, "") + "\n";
}
