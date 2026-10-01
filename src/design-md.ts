const HEX = /`(#[0-9a-f]{6})`/g;

export function hexes(row: string): string[] {
  return [...row.matchAll(HEX)].map((m) => m[1]);
}

export function tokenRows(source: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of source.split("\n").filter((line) => line.startsWith("|"))) {
    const token = /^\|\s*`(--[a-z0-9-]+)`\s*\|/.exec(row);
    const [value] = hexes(row);
    if (token && value) map.set(token[1], value);
  }
  return map;
}

export function cells(row: string): string[] {
  return row
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

// Table rows between two headings; a renamed heading fails with its name, not an empty table.
export function sectionRows(source: string, from: string, to: string): string[] {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`DESIGN.md heading not found: "${from}"`);
  const end = source.indexOf(to, start);
  if (end < 0) throw new Error(`DESIGN.md heading not found after "${from}": "${to}"`);
  return source
    .slice(start, end)
    .split("\n")
    .filter((line) => line.startsWith("|"));
}
