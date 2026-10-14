import { useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

const COPY_ICON = '<i class="fa-solid fa-copy" aria-hidden="true"></i>';
const CHECK_ICON = '<i class="fa-solid fa-check" aria-hidden="true"></i>';

/** Wrap each <pre> in a ChatGPT-style block: header bar (language + copy button). */
function decorateCodeBlocks(root: HTMLElement) {
  // task-list items: drop the list bullet (class-based — :has() is not reliable in the WebView)
  root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box) => {
    box.closest("li")?.classList.add("md-task-item");
  });

  root.querySelectorAll("pre").forEach((pre) => {
    if (pre.parentElement?.classList.contains("md-code-block")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "md-code-block";
    pre.replaceWith(wrapper);

    const header = document.createElement("div");
    header.className = "md-code-header";
    const lang =
      pre.querySelector("code")?.className.match(/language-([\w-]+)/)?.[1] ?? "";
    const label = document.createElement("span");
    label.textContent = lang || "text";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "md-copy-btn";
    button.title = "Copy code";
    button.innerHTML = COPY_ICON;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent ?? "");
        button.innerHTML = CHECK_ICON;
        setTimeout(() => {
          button.innerHTML = COPY_ICON;
        }, 1500);
      } catch {
        /* clipboard unavailable */
      }
    });
    header.appendChild(label);
    header.appendChild(button);

    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  });
}

/** Toggle the nth `- [ ]` / `- [x]` task marker in the markdown source. */
function toggleTaskInSource(source: string, index: number): string | null {
  const re = /^(\s*[-*]\s+\[)([ xX])(\].*)$/gm;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (i === index) {
      const mark = m[2] === " " ? "x" : " ";
      const at = m.index + m[1].length;
      return source.slice(0, at) + mark + source.slice(at + 1);
    }
    i++;
  }
  return null;
}

/**
 * Select one radio item: source syntax `- ( ) item` / `- (x) item`.
 * A group is a run of consecutive radio lines; selecting marks the clicked
 * item (x) and clears its group-mates.
 */
function toggleRadioInSource(source: string, groupIndex: number, itemIndex: number): string | null {
  const lines = source.split("\n");
  const radioRe = /^(\s*[-*]\s+\()([ xX])(\).*)$/;
  const groups: number[][] = [];
  let current: number[] | null = null;
  for (let ln = 0; ln < lines.length; ln++) {
    if (radioRe.test(lines[ln])) {
      if (!current) {
        current = [];
        groups.push(current);
      }
      current.push(ln);
    } else {
      current = null;
    }
  }
  const group = groups[groupIndex];
  if (!group || itemIndex >= group.length) return null;
  const out = [...lines];
  group.forEach((lineNum, idx) => {
    const m = radioRe.exec(out[lineNum]);
    if (!m) return;
    out[lineNum] = m[1] + (idx === itemIndex ? "x" : " ") + m[3];
  });
  return out.join("\n");
}

const RADIO_TEXT_RE = /^\(( |x|X)\)\s+/;

/** Turn `- ( ) item` list items into real radio inputs (ChatGPT-tasklist style). */
function decorateRadioItems(root: HTMLElement, source: string, onSourceChange?: (next: string) => void) {
  const items = [...root.querySelectorAll("li")].filter((li) =>
    RADIO_TEXT_RE.test(li.textContent ?? "")
  );
  let groupIndex = -1;
  let itemIndex = 0;
  let prevLi: Element | null = null;
  items.forEach((li) => {
    // new group: different list, non-adjacent sibling, or loose (p-wrapped) item
    const loose = li.firstElementChild?.tagName === "P";
    const consecutive = prevLi !== null && li.previousElementSibling === prevLi && prevLi.parentElement === li.parentElement;
    if (!consecutive || loose) {
      groupIndex++;
      itemIndex = 0;
    }
    const thisGroup = groupIndex;
    const thisItem = itemIndex++;

    const container = li.firstElementChild?.tagName === "P" ? li.firstElementChild : li;
    const firstNode = container.childNodes[0];
    let checked = false;
    if (firstNode && firstNode.nodeType === Node.TEXT_NODE) {
      const text = firstNode.textContent ?? "";
      const m = text.match(RADIO_TEXT_RE);
      if (m) {
        checked = m[1] !== " ";
        firstNode.textContent = text.slice(m[0].length);
      }
    }
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.className = "md-radio";
    radio.name = `md-radio-${thisGroup}`;
    radio.checked = checked;
    if (onSourceChange) {
      radio.addEventListener("change", () => {
        const next = toggleRadioInSource(source, thisGroup, thisItem);
        if (next !== null) onSourceChange(next);
      });
    }
    container.insertBefore(radio, container.firstChild);
    li.classList.add("md-task-item");
    prevLi = li;
  });
}

// ---- Dropdown selects ----

const SELECT_TEXT_RE = /^\(([^)]*\|[^)]*)\)\s+/;

/** Move the `*` selection marker to optionIndex on the nth select line. */
function setSelectInSource(source: string, selectIndex: number, optionIndex: number): string | null {
  const lines = source.split("\n");
  const re = /^(\s*[-*]\s+\()([^)]*)(\).*)$/;
  let i = 0;
  for (let ln = 0; ln < lines.length; ln++) {
    const m = re.exec(lines[ln]);
    if (!m || !m[2].includes("|")) continue;
    if (i === selectIndex) {
      const options = m[2].split("|").map((o) => o.trim().replace(/^\*/, ""));
      const rebuilt = options
        .map((o, k) => (k === optionIndex ? `*${o}` : o))
        .join("|");
      lines[ln] = m[1] + rebuilt + m[3];
      return lines.join("\n");
    }
    i++;
  }
  return null;
}

/** Turn `- (a|b|*c) label` list items into real dropdown selects. */
function decorateSelectItems(root: HTMLElement, source: string, onSourceChange?: (next: string) => void) {
  const items = [...root.querySelectorAll("li")].filter((li) =>
    SELECT_TEXT_RE.test(li.textContent ?? "")
  );
  let index = 0;
  items.forEach((li) => {
    const thisIndex = index++;
    const container = li.firstElementChild?.tagName === "P" ? li.firstElementChild : li;
    const firstNode = container.childNodes[0];
    if (!firstNode || firstNode.nodeType !== Node.TEXT_NODE) return;
    const m = (firstNode.textContent ?? "").match(SELECT_TEXT_RE);
    if (!m) return;
    const rawOptions = m[1].split("|").map((o) => o.trim());
    let selected = rawOptions.findIndex((o) => o.startsWith("*"));
    if (selected === -1) selected = 0;
    firstNode.textContent = (firstNode.textContent ?? "").slice(m[0].length);

    const select = document.createElement("select");
    select.className = "md-select";
    rawOptions.forEach((raw, k) => {
      const option = document.createElement("option");
      option.value = String(k);
      option.textContent = raw.replace(/^\*/, "");
      option.selected = k === selected;
      select.appendChild(option);
    });
    if (onSourceChange) {
      select.addEventListener("change", () => {
        const next = setSelectInSource(source, thisIndex, Number(select.value));
        if (next !== null) onSourceChange(next);
      });
    }
    container.insertBefore(select, container.firstChild);
    li.classList.add("md-task-item");
  });
}

// ---- Editable tables ----

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]*-[\s:|-]*$/.test(line);
}

interface TableBlock {
  headerLine: number;
  dataLines: number[];
  columnCount: number;
}

/** Markdown table blocks in source order (header line + separator + pipe lines). */
function parseTableBlocks(source: string): TableBlock[] {
  const lines = source.split("\n");
  const blocks: TableBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\s*\|/.test(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headerLine = i;
      const columnCount = splitRowCells(lines[i]).length;
      i += 2;
      const dataLines: number[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        dataLines.push(i);
        i++;
      }
      blocks.push({ headerLine, dataLines, columnCount });
    } else {
      i++;
    }
  }
  return blocks;
}

function splitRowCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function buildRowLine(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

/** Rewrite one cell's raw markdown text on its source line. */
function setTableCell(source: string, lineNum: number, col: number, text: string): string | null {
  const lines = source.split("\n");
  const cells = splitRowCells(lines[lineNum]);
  if (col >= cells.length) return null;
  cells[col] = text;
  lines[lineNum] = buildRowLine(cells);
  return lines.join("\n");
}

function startCellEditing(
  cell: HTMLTableCellElement,
  lineNum: number,
  col: number,
  source: string,
  onSourceChange: (next: string) => void
) {
  if (cell.querySelector(".md-cell-edit")) return;
  const raw = splitRowCells(source.split("\n")[lineNum] ?? "")[col] ?? "";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "md-cell-edit";
  input.value = raw;
  cell.classList.add("md-cell-editing");
  cell.appendChild(input);
  input.focus();
  input.select();
  const finish = (commit: boolean) => {
    input.remove();
    cell.classList.remove("md-cell-editing");
    if (commit) {
      const next = setTableCell(source, lineNum, col, input.value.trim());
      if (next !== null) onSourceChange(next);
    }
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
}

function decorateTables(root: HTMLElement, source: string, onSourceChange?: (next: string) => void) {
  const blocks = parseTableBlocks(source);
  const tables = [...root.querySelectorAll("table")];
  tables.forEach((table, tableIndex) => {
    const block = blocks[tableIndex];
    if (!block) return;
    table.classList.add("md-table");
    if (!onSourceChange) return;

    const editCell = (cell: HTMLTableCellElement, lineNum: number) =>
      startCellEditing(cell, lineNum, cell.cellIndex, source, onSourceChange);

    table.querySelectorAll<HTMLTableRowElement>("tr").forEach((tr, rowIndex) => {
      const lineNum = rowIndex === 0 ? block.headerLine : block.dataLines[rowIndex - 1];
      if (lineNum === undefined) return;
      tr.querySelectorAll<HTMLTableCellElement>("th, td").forEach((cell) => {
        cell.addEventListener("click", () => editCell(cell, lineNum));
      });
    });

    // add-row button under the table
    const addRow = document.createElement("button");
    addRow.type = "button";
    addRow.className = "md-add-row";
    addRow.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i>';
    addRow.addEventListener("click", () => {
      const insertAt = (block.dataLines[block.dataLines.length - 1] ?? block.headerLine + 1) + 1;
      const lines = source.split("\n");
      lines.splice(insertAt, 0, buildRowLine(new Array(block.columnCount).fill("")));
      onSourceChange(lines.join("\n"));
    });
    const spacer = document.createElement("div");
    spacer.className = "md-table-actions";
    spacer.appendChild(addRow);
    table.insertAdjacentElement("afterend", spacer);
  });
}

interface MarkdownPreviewProps {
  source: string;
  /** When provided, task-list checkboxes become clickable and toggle the source. */
  onSourceChange?(nextSource: string): void;
}

export default function MarkdownPreview({ source, onSourceChange }: MarkdownPreviewProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(source, { async: false }) as string),
    [source]
  );

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    decorateCodeBlocks(root);
    decorateRadioItems(root, source, onSourceChange);
    decorateSelectItems(root, source, onSourceChange);
    decorateTables(root, source, onSourceChange);

    if (onSourceChange) {
      let index = 0;
      root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box) => {
        const taskIndex = index++;
        box.disabled = false;
        box.classList.add("md-task");
        box.addEventListener("click", () => {
          const next = toggleTaskInSource(source, taskIndex);
          if (next !== null) onSourceChange(next);
        });
      });
    }
  }, [html, source, onSourceChange]);

  return <div ref={ref} className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
