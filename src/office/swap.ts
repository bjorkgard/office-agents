import { nextDisplayed, poseForState, type AgentState } from "./poses";

/**
 * Pose swap controller (D10): pure, the clock is passed in. `target` is the latest state
 * from the machine; `displayed` is what is drawn. A looping pose (walk stride, typing tap)
 * finishes its iteration before the swap, `nextDisplayed` decides when. Only the latest
 * target is ever shown, so a burst of changes or a background tab lands on the current state.
 */
export type SwapState = { displayed: AgentState; target: AgentState; since: number };
export type SwapInput = { loopRunning: boolean; reducedMotion: boolean; now: number };

export const createSwap = (state: AgentState, now: number): SwapState => ({
  displayed: state,
  target: state,
  since: now,
});

/** Records a new machine state; the swap clock starts at the first state that differs. */
export function retarget(s: SwapState, state: AgentState, now: number): SwapState {
  if (state === s.target) return s;
  return { displayed: s.displayed, target: state, since: now };
}

/** Swaps when `nextDisplayed` allows it, otherwise returns `s` unchanged. */
export function resolveSwap(s: SwapState, input: SwapInput): SwapState {
  if (s.displayed === s.target) return s;
  const next = nextDisplayed(s.target, input.loopRunning, input.reducedMotion, input.now - s.since);
  return next === null ? s : { ...s, displayed: next };
}

/** States whose pose has a CSS loop: the walk stride and the typing tap. */
export function isLooping(state: AgentState): boolean {
  const pose = poseForState(state);
  return pose === "walking" || pose === "seated-typing";
}
