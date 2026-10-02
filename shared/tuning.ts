/**
 * Limits shared by server/ and src/office/ (eng decision E4): one definition so the
 * server's tracked-file window and the machine's expiry cannot drift. No imports.
 */

/** Silent arriving, working and waiting-on-subagents agents leave after this long (30 min). */
export const STALE_MS = 30 * 60 * 1000;

/** Silent agents waiting on a question leave after this long (4 h). */
export const ATTENTION_STALE_MS = 4 * 60 * 60 * 1000;

/** Desks per row: the server's seat rule and the client's layout must agree (eng decision D14). */
export const DESKS_PER_ROW = 4;
