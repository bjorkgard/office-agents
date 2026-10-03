import { ART, SHIRTS } from "./palette";

export type AgentState =
  | "arriving"
  | "working"
  | "waiting-on-subagents"
  | "idle"
  | "attention"
  | "leaving";

export type Pose =
  | "walking"
  | "seated-typing"
  | "standing-mug"
  | "standing-cup"
  | "seated-idle"
  | "seated-raised-hand";

// Mirrors the "State to look" matrix in DESIGN.md.
export const POSES: Record<AgentState, Pose> = {
  arriving: "walking",
  working: "seated-typing",
  "waiting-on-subagents": "standing-mug",
  idle: "seated-idle",
  attention: "seated-raised-hand",
  leaving: "walking",
};

export function poseForState(state: AgentState): Pose {
  return POSES[state];
}

export const SWAP_TIMEOUT_MS = 900;

export type Shirt = (typeof SHIRTS)[number];

// The palette entry for a shirt index, or undefined for nil, non-integer or out of range.
export function shirtFor(index: number | null | undefined): Shirt | undefined {
  return index == null || !Number.isInteger(index) ? undefined : SHIRTS[index];
}

export function shirtVars(
  index: number | null | undefined,
  stripe: boolean,
): Record<"--shirt" | "--shirt-stripe", string> {
  const shirt = shirtFor(index);
  if (!shirt) {
    if (import.meta.env.DEV && index != null)
      console.warn(`shirtVars: invalid shirt index ${index}`);
    return { "--shirt": ART["--shirt-unknown"], "--shirt-stripe": ART["--shirt-unknown"] };
  }
  return { "--shirt": shirt.value, "--shirt-stripe": stripe ? shirt.stripe : shirt.value };
}

// Returns the state to display now, or null to keep the current one.
// A running loop finishes its stride: `loopRunning` turns false when the
// animationiteration event fires, which lets the swap happen. Reduced motion
// or no loop swaps at once; otherwise SWAP_TIMEOUT_MS forces the swap.
export function nextDisplayed(
  state: AgentState,
  loopRunning: boolean,
  reducedMotion: boolean,
  elapsed: number,
): AgentState | null {
  if (reducedMotion || !loopRunning || elapsed >= SWAP_TIMEOUT_MS) return state;
  return null;
}
