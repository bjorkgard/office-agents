// Devices: <DeskLayer/> a subagent at a work desk shows its own laptop or tablet, parents keep the monitor.
// The grids are props (props.ts); this picks one per agent and places it inside deviceSlot.
import { hash } from "./appearance";
import type { DeskKind, Rect } from "./desk-kinds";
import { PROPS, type PropName } from "./props";

export const DEVICES = ["laptop", "tablet"] as const;
export type Device = (typeof DEVICES)[number];
export type DeviceLook = "lit" | "half" | "dark";

/** Which device an agent works on: a stable, namespaced hash, so it never tracks the agent's looks. */
export const deviceFor = (agentKey: string): Device =>
  DEVICES[hash(`device:${agentKey}`) % DEVICES.length];

// Top-left of each device inside deviceSlot, in cells.
const AT: Record<Device, { x: number; y: number }> = {
  laptop: { x: 0, y: 0 },
  tablet: { x: 2, y: 1 },
};

export const deviceProp = (device: Device, look: DeviceLook): PropName =>
  `${device.toUpperCase()}_${look.toUpperCase()}` as PropName;

/** The device's box in desk cells. */
export function deviceRect(kind: DeskKind, device: Device): Rect {
  const grid = PROPS[deviceProp(device, "lit")];
  return {
    x: kind.deviceSlot.x + AT[device].x,
    y: kind.deviceSlot.y + AT[device].y,
    w: grid[0].length,
    h: grid.length,
  };
}
