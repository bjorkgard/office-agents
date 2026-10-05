import { describe, expect, it } from "vite-plus/test";
import { DESKS_PER_ROW } from "../../shared/tuning";
import {
  HIT_MIN,
  MIN_HEIGHT,
  MIN_SCALE,
  MIN_WIDTH,
  WALL_HEIGHT,
  deskCell,
  fitFor,
  floorCorners,
  layoutOffice,
  placeBubbles,
  project,
  ringStroke,
  type BubbleBox,
  type PlacedBubble,
} from "./iso";
import { roomShell } from "./room";

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
    // Room px are anchored, so "inside the room" is inside the padded bounds, not 0..width.
    const pad = (l.width - (l.bounds.maxX - l.bounds.minX)) / 2;
    for (const d of l.desks) {
      expect(d.x).toBeGreaterThan(l.bounds.minX - pad);
      expect(d.x).toBeLessThan(l.bounds.minX - pad + l.width);
      expect(d.y).toBeGreaterThan(l.bounds.minY - pad);
      expect(d.y).toBeLessThan(l.bounds.minY - pad + l.height);
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

describe("anchored origin (eng D2)", () => {
  const view = { width: 1600, height: 1000 };
  const rowsRange = [1, 2, 3, 4, 5, 6];
  const at = (rows: number) => layoutOffice(rows * DESKS_PER_ROW, view);

  it("never moves a desk in room px when a row is added, and desks[0] is the origin", () => {
    const base = at(1);
    for (const rows of rowsRange) {
      const l = at(rows);
      expect(l.rows).toBe(rows);
      expect(l.origin).toEqual(base.origin);
      expect(l.desks[0]).toMatchObject(l.origin);
      for (let i = 0; i < base.desks.length; i++)
        expect([l.desks[i].x, l.desks[i].y]).toEqual([base.desks[i].x, base.desks[i].y]);
    }
  });

  it("keeps the room shell's back wall, door, coffee station and dispenser put", () => {
    const base = roomShell(at(1));
    for (const rows of rowsRange) {
      const s = roomShell(at(rows));
      expect(s.floor[0]).toEqual(base.floor[0]);
      expect(s.floor[1]).toEqual(base.floor[1]);
      expect(s.door).toEqual(base.door);
      expect(s.coffee).toEqual(base.coffee);
      expect(s.dispenser).toEqual(base.dispenser);
      expect(s.plantBush).toEqual(base.plantBush);
      expect(s.rightWall).toEqual(base.rightWall);
    }
  });

  it("grows the bounds only outward: left and down", () => {
    let prev = at(1).bounds;
    for (const rows of rowsRange.slice(1)) {
      const b = at(rows).bounds;
      expect(b.minX).toBeLessThan(prev.minX);
      expect(b.maxY).toBeGreaterThan(prev.maxY);
      expect(b.maxX).toBe(prev.maxX);
      expect(b.minY).toBe(prev.minY);
      prev = b;
    }
  });

  // The pre-anchor layout: origin from the left floor corner, the room box centered by CSS.
  const SLACK = 16;
  const old = (rows: number, v: { width: number; height: number }) => {
    const c = floorCorners(rows);
    const origin = { x: SLACK - c.left.x, y: SLACK - (c.top.y - WALL_HEIGHT) };
    const width = c.right.x - c.left.x + SLACK * 2;
    const height = c.bottom.y - (c.top.y - WALL_HEIGHT) + SLACK * 2;
    const scale = Math.max(MIN_SCALE, Math.min(1, v.width / width, v.height / height));
    return { origin, width, scale, margin: Math.max(0, (v.width - width * scale) / 2) };
  };

  it("lands every desk where the old layout did, on screen, for rows 1-4 and several viewports", () => {
    const views = [
      { width: 1600, height: 1000 },
      { width: 1200, height: 800 },
      { width: 900, height: 560 },
      { width: 800, height: 500 },
      { width: 4000, height: 3000 },
    ];
    for (const v of views)
      for (const rows of [1, 2, 3, 4]) {
        const l = layoutOffice(rows * DESKS_PER_ROW, v);
        const o = old(rows, v);
        expect(l.scale).toBe(o.scale);
        expect(l.fit.scale).toBe(o.scale);
        for (const d of l.desks) {
          const p = project(d.col, d.row);
          const oldX = (p.x + o.origin.x) * o.scale + o.margin;
          const oldY = (p.y + o.origin.y) * o.scale;
          expect(d.x * l.fit.scale + l.fit.x).toBeCloseTo(oldX, 6);
          expect(d.y * l.fit.scale + l.fit.y).toBeCloseTo(oldY, 6);
        }
      }
  });

  it("fitFor centers the padded bounds and keeps the top slack", () => {
    const b = { minX: 16, maxX: 1016, minY: 16, maxY: 516 };
    const f = fitFor(b, 0.5, { width: 1400, height: 900 });
    expect(f).toEqual({ scale: 0.5, x: (1400 - 1032 * 0.5) / 2, y: 0 });
    expect(fitFor(b, 1, { width: 500, height: 900 }).x).toBe(0);
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

describe("layer box extent (V9b)", () => {
  const views = [
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 800, height: 500 },
  ];
  it("keeps every layer box inside the room's own screen extent and the viewport", () => {
    for (const view of views)
      for (let rows = 1; rows <= 6; rows++) {
        const l = layoutOffice(rows * DESKS_PER_ROW, view);
        const margin = Math.max(0, (view.width - l.width * l.scale) / 2);
        const roomRight = margin + l.width * l.scale;
        // The layer and the room-shell svg share this box (both at room x 0, y 0); the
        // overlay container is the full-width scene box, so it never leaves the viewport.
        const box = l.box;
        const left = l.fit.x;
        const right = l.fit.x + box.width * l.scale;
        const bottom = l.fit.y + box.height * l.scale;
        const where = `${view.width}x${view.height} rows ${rows}`;
        expect(right, where).toBeLessThanOrEqual(roomRight + 0.01);
        expect(bottom, where).toBeLessThanOrEqual(l.scrollHeight + 0.01);
        expect(left, where).toBeGreaterThanOrEqual(margin - 0.01);
        if (l.scale > MIN_SCALE) expect(right, where).toBeLessThanOrEqual(view.width + 0.01);
      }
  });
});

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

describe("ringStroke", () => {
  it("keeps the ring 2 screen px wide at every scale", () => {
    expect(ringStroke(1)).toBe(2);
    expect(ringStroke(0.5)).toBe(4);
    expect(ringStroke(2)).toBe(1);
  });

  it("floors the scale at MIN_SCALE for zero and NaN", () => {
    expect(ringStroke(0)).toBe(2 / MIN_SCALE);
    expect(ringStroke(Number.NaN)).toBe(2 / MIN_SCALE);
  });
});
