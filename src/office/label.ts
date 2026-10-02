import { identityFor, type Identity } from "./identity";
import { agentKey } from "./machine";

const MAX_LABEL = 24;

// C0/C1 controls, Arabic letter mark, line and paragraph separators, zero-width and bidi embedding,
// override and isolate characters.
// oxlint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/gu;

// Display label for a project path: last path segment, unsafe characters stripped,
// cut to 24 code points plus an ellipsis. The result is only ever rendered as text.
export function projectLabel(path: string): string {
  const segments = path.replace(UNSAFE, "").split(/[\\/]+/);
  let base = "";
  for (let i = segments.length - 1; i >= 0 && base === ""; i--) base = segments[i].trim();
  const points = Array.from(base);
  return points.length > MAX_LABEL ? `${points.slice(0, MAX_LABEL).join("")}\u2026` : base;
}

// Seeded from the agent key so a subagent is a different person from its parent.
// A seed that lands on the same name as the parent is re-seeded until it differs.
export function agentIdentity(sessionId: string, agentId: string | null): Identity {
  if (agentId === null) return identityFor(sessionId);
  const parent = identityFor(sessionId).name;
  const seed = agentKey(sessionId, agentId);
  let id = identityFor(seed);
  for (let i = 1; id.name === parent && i < 64; i++) id = identityFor(`${seed}\u0000${i}`);
  return id;
}
