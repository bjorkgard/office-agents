import { describe, expect, it } from "vite-plus/test";
import { DESKS_PER_ROW } from "../../shared/tuning";
import {
  HIT_MIN,
  MIN_HEIGHT,
  MIN_SCALE,
  MIN_WIDTH,
  deskCell,
  layoutOffice,
  placeBubbles,
  project,
  type BubbleBox,
  type PlacedBubble,
} from "./iso";

describe("project", () => {
  it("maps grid x,y to the screen diamond and depth to x+y", () => {
    expect(project(0, 0)).toEqual({ x: 0, y: 0, depth: 0 });
    const a = project(1, 0);
    const b = project(0, 1);
    expect(a.x).toBe(-b.x);
    expect(a.y).toBe(b.y);
    expect(project(2, 3).depth).toBe(5);
  });
});

describe("deskCell", () => {
  it("puts 4 desks in a row and starts the next row when full", () => {
    expect(DESKS_PER_ROW).toBe(4);
    expect(deskCell(0)).toEqual({ col: 0, row: 0 });
    expect(deskCell(3)).toEqual({ col: 3, row: 0 });
    expect(deskCell(4)).toEqual({ col: 0, row: 1 });
    expect(deskCell(9)).toEqual({ col: 1, row: 2 });
  });
});

describe("layoutOffice", () => {
  it("grows rows toward the viewer (larger screen y)", () => {
    const l = layoutOffice(9, { width: 1600, height: 1000 });
    expect(l.rows).toBe(3);
    expect(l.desks[4].y).toBeGreaterThan(l.desks[0].y);
    expect(l.desks[8].y).toBeGreaterThan(l.desks[4].y);
  });

  it("draws every desk of every row, seated or not", () => {
    const v = { width: 1600, height: 1000 };
    expect(layoutOffice(0, v).desks).toHaveLength(DESKS_PER_ROW);
    expect(layoutOffice(1, v).desks).toHaveLength(DESKS_PER_ROW);
    expect(layoutOffice(5, v).desks).toHaveLength(2 * DESKS_PER_ROW);
    expect(layoutOffice(12, v).desks).toHaveLength(12);
  });

  it("uses one row for 0 and 4 desks, two for 5", () => {
    const v = { width: 1600, height: 1000 };
    expect(layoutOffice(0, v).rows).toBe(1);
    expect(layoutOffice(4, v).rows).toBe(1);
    expect(layoutOffice(5, v).rows).toBe(2);
  });

  it("stays at scale 1 when the room fits", () => {
    const l = layoutOffice(4, { width: 4000, height: 3000 });
    expect(l.scale).toBe(1);
    expect(l.scrolls).toBe(false);
  });

  it("scales down to fit, never below the 50% floor", () => {
    const fit = layoutOffice(24, { width: 800, height: 500 });
    expect(fit.scale).toBeLessThan(1);
    expect(fit.scale).toBeGreaterThanOrEqual(MIN_SCALE);
    const many = layoutOffice(80, { width: 900, height: 560 });
    expect(many.scale).toBe(MIN_SCALE);
  });

  it("scrolls vertically once rows exceed what fits at the floor", () => {
    const l = layoutOffice(80, { width: 1000, height: 600 });
    expect(l.scale).toBe(MIN_SCALE);
    expect(l.scrolls).toBe(true);
    expect(l.scrollHeight).toBeGreaterThan(600);
    const few = layoutOffice(4, { width: 1000, height: 600 });
    expect(few.scrolls).toBe(false);
    expect(few.scrollHeight).toBeLessThanOrEqual(600);
  });

  it("reports needsWider below 800x500 and lays out at the minimum", () => {
    expect(layoutOffice(4, { width: 799, height: 600 }).needsWider).toBe(true);
    expect(layoutOffice(4, { width: 900, height: 499 }).needsWider).toBe(true);
    expect(layoutOffice(4, { width: MIN_WIDTH, height: MIN_HEIGHT }).needsWider).toBe(false);
    const small = layoutOffice(8, { width: 300, height: 200 });
    const min = layoutOffice(8, { width: MIN_WIDTH, height: MIN_HEIGHT });
    expect(small.scale).toBe(min.scale);
  });

  it("keeps desk centers clear of the room edge and scales 24 agents into the 50% band", () => {
    const l = layoutOffice(12, { width: 1024, height: 768 });
    expect(l.desks[0].x).toBe(l.origin.x);
    expect(l.desks[0].y).toBe(l.origin.y);
    expect(l.scale).toBeGreaterThanOrEqual(MIN_SCALE);
    expect(l.scale).toBeLessThanOrEqual(1);
    for (const d of l.desks) {
      expect(d.x).toBeGreaterThan(0);
      expect(d.x).toBeLessThan(l.width);
      expect(d.y).toBeGreaterThan(0);
      expect(d.y).toBeLessThan(l.height);
    }
    const big = layoutOffice(24, { width: MIN_WIDTH, height: MIN_HEIGHT });
    expect(big.scale).toBe(MIN_SCALE);
  });

  it("keeps hit-area centers at least 24px apart at scale 0.5 with 12 agents", () => {
    const l = layoutOffice(12, { width: MIN_WIDTH, height: MIN_HEIGHT });
    const pts = l.desks.map((d) => ({ x: d.x * MIN_SCALE, y: d.y * MIN_SCALE }));
    expect(pts).toHaveLength(12);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThanOrEqual(
          HIT_MIN,
        );
  });
});

const box = (id: string, x: number, y: number, waitingMs: number): BubbleBox => ({
  id,
  x,
  y,
  width: 80,
  height: 24,
  waitingMs,
});

const expectNoVisibleOverlap = (out: PlacedBubble[]) => {
  const vis = out.filter((p) => !p.hidden);
  for (let i = 0; i < vis.length; i++)
    for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i];
      const b = vis[j];
      const hit = a.x < b.x + 80 && b.x < a.x + 80 && a.y < b.y + 24 && b.y < a.y + 24;
      expect(hit).toBe(false);
    }
};

describe("placeBubbles", () => {
  it("returns nothing for 0 bubbles", () => {
    expect(placeBubbles([])).toEqual([]);
  });

  it("leaves a lone bubble where it is", () => {
    expect(placeBubbles([box("a", 10, 10, 5)])).toEqual([
      { id: "a", x: 10, y: 10, shift: 0, hidden: false },
    ]);
  });

  it("keeps the longer-waiting of 2 overlapping bubbles and moves the other off it", () => {
    const out = placeBubbles([box("short", 10, 10, 1), box("long", 20, 12, 9)]);
    const long = out.find((b) => b.id === "long")!;
    const short = out.find((b) => b.id === "short")!;
    expect(long).toMatchObject({ y: 12, shift: 0, hidden: false });
    // 8px and 16px shifts still overlap a 24px-tall bubble 2px away, so it hides.
    expect(short.hidden).toBe(true);
  });

  it("shifts only until clear: 1 step when 8px is enough, 2 when 16px is", () => {
    const one = placeBubbles([box("a", 10, 10, 2), box("b", 10, -6, 1)]);
    expect(one.find((p) => p.id === "b")).toMatchObject({ shift: 1, y: -14, hidden: false });
    const two = placeBubbles([box("a", 10, 10, 2), box("b", 10, 2, 1)]);
    expect(two.find((p) => p.id === "b")).toMatchObject({ shift: 2, y: -14, hidden: false });
    expectNoVisibleOverlap(one);
    expectNoVisibleOverlap(two);
  });

  it("hides every fully stacked bubble after the first behind its chip", () => {
    const out = placeBubbles([
      box("a", 10, 10, 4),
      box("b", 10, 10, 3),
      box("c", 10, 10, 2),
      box("d", 10, 10, 1),
    ]);
    expect(out.filter((b) => b.hidden).map((b) => b.id)).toEqual(["b", "c", "d"]);
  });

  it("two 80x24 bubbles at the same anchor: second is shifted then hidden, never overlapping", () => {
    const out = placeBubbles([box("a", 10, 10, 2), box("b", 10, 10, 1)]);
    const b = out.find((p) => p.id === "b")!;
    // 8px and 16px shifts of a 24px-tall bubble still overlap, so it hides.
    expect(b.hidden).toBe(true);
    expectNoVisibleOverlap(out);
  });

  it("never returns visibly overlapping bubbles or centers under 24px apart", () => {
    const boxes = Array.from({ length: 6 }, (_, i) => box(`n${i}`, 10 + i * 6, 10, i));
    const out = placeBubbles(boxes);
    expectNoVisibleOverlap(out);
  });

  it("keeps bubble hit-area centers at least 24px apart at scale 0.5 with 12 agents", () => {
    const l = layoutOffice(12, { width: MIN_WIDTH, height: MIN_HEIGHT });
    const boxes = l.desks.map((d, i) => box(`d${i}`, d.x - 40, d.y - 120, i));
    const out = placeBubbles(boxes).filter((p) => !p.hidden);
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const dx = (out[i].x - out[j].x) * MIN_SCALE;
        const dy = (out[i].y - out[j].y) * MIN_SCALE;
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(HIT_MIN);
      }
  });

  it("does not move bubbles that do not overlap", () => {
    const out = placeBubbles([box("a", 0, 0, 1), box("b", 200, 0, 2)]);
    expect(out.every((b) => b.shift === 0 && !b.hidden)).toBe(true);
  });

  it("keeps the input order in the output", () => {
    const out = placeBubbles([box("x", 0, 0, 1), box("y", 0, 0, 2)]);
    expect(out.map((b) => b.id)).toEqual(["x", "y"]);
  });

  // The longest-waiting bubble of all never yields to an obstacle; the others do.
  const lead = box("lead", 900, 900, 99);

  it("shifts a bubble off another agent's tag, and ignores its own", () => {
    const obstacle = { owner: "other", x: 0, y: 20, width: 80, height: 20 };
    const own = { owner: "a", x: 0, y: 20, width: 80, height: 20 };
    const a = placeBubbles([lead, box("a", 0, 10, 1)], [obstacle])[1];
    expect(a).toMatchObject({ shift: 2, y: -6, hidden: false });
    expect(placeBubbles([lead, box("a", 0, 10, 1)], [own])[1]).toMatchObject({
      shift: 0,
      hidden: false,
    });
  });

  it("hides a bubble that three shifts of 8px cannot lift off another agent's head", () => {
    const head = { owner: "other", x: 0, y: 0, width: 80, height: 60 };
    const a = placeBubbles([lead, box("a", 0, 10, 1)], [head])[1];
    expect(a.hidden).toBe(true);
  });

  it("keeps a bubble's own shift when it is clear of every obstacle", () => {
    const far = { owner: "other", x: 500, y: 500, width: 80, height: 20 };
    expect(placeBubbles([lead, box("a", 0, 10, 1)], [far])[1]).toMatchObject({ shift: 0, y: 10 });
  });

  it("never shifts or hides the longest-waiting bubble for an obstacle", () => {
    const head = { owner: "other", x: 0, y: 0, width: 80, height: 60 };
    expect(placeBubbles([box("a", 0, 10, 5)], [head])[0]).toMatchObject({
      x: 0,
      y: 10,
      shift: 0,
      hidden: false,
    });
    const out = placeBubbles([box("short", 0, 10, 1), box("long", 0, 10, 9)], [head]);
    expect(out.find((b) => b.id === "long")).toMatchObject({ y: 10, shift: 0, hidden: false });
    expect(out.find((b) => b.id === "short")!.hidden).toBe(true);
  });
});
