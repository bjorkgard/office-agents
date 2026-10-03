import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import mainSrc from "../main.tsx?raw";
import decorSrc from "./decor.ts?raw";
import {
  CLOCK_FACE,
  CLOCK_ROWS,
  CLOUD_PERIOD,
  CLOUD_TILE,
  HAND_WIDTH,
  RAIN_PERIOD,
  RAIN_TILE,
  SNOW_PERIOD,
  SNOW_TILE,
  WINDOW_SCENES,
  WINDOW_SCENE_IDS,
  activeSceneId,
  clockHandCells,
  clockHands,
  clockShear,
  localDateKey,
  sceneAt,
  sceneFor,
  setSceneOverride,
  windowArt,
  windowScene,
  windowShear,
  type ClockCell,
  type WindowSceneId,
} from "./decor";
import { CELLS } from "./pixel";
import { GLASS } from "./palette";
import { PROPS } from "./props";
import { WINDOW_COLS, WINDOW_FLAT_ROWS, WINDOW_ROWS } from "./room";

// @ts-expect-error node:fs has no types in the app project
const { readFileSync } = (await import("node:fs")) as {
  readFileSync: (url: URL, enc: string) => string;
};
const sceneCss = readFileSync(new URL("./scene.css", import.meta.url), "utf8");

const at = (y: number, mo: number, d: number, h: number, mi: number, s: number) =>
  new Date(y, mo, d, h, mi, s).getTime();

// The first day of 2026 that is not 24 h long in the process zone (a DST switch); undefined with no DST.
const switchDay = (() => {
  let day = new Date(2026, 0, 1);
  for (let i = 0; i < 366; i++) {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    if (next.getTime() - day.getTime() !== 24 * 3600 * 1000) return day;
    day = next;
  }
  return undefined;
})();

describe("clockHands", () => {
  it("reads 12:00:00 as all hands straight up", () => {
    expect(clockHands(at(2026, 5, 1, 12, 0, 0))).toEqual({ hour: 0, minute: 0, second: 0 });
  });

  it("reads 03:15:30 from local time", () => {
    const a = clockHands(at(2026, 5, 1, 3, 15, 30));
    expect(a.hour).toBeCloseTo(97.5);
    expect(a.minute).toBe(90);
    expect(a.second).toBe(180);
  });

  it("rolls 23:59:59 over to 00:00:00", () => {
    const before = clockHands(at(2026, 5, 1, 23, 59, 59));
    expect(before.minute).toBe(354);
    expect(before.second).toBe(354);
    expect(before.hour).toBeCloseTo(359.5);
    const after = clockHands(at(2026, 5, 2, 0, 0, 0));
    expect(after).toEqual({ hour: 0, minute: 0, second: 0 });
  });

  // A zone with no DST (e.g. UTC) shows this as skipped; the other tests cover plain local time.
  it.skipIf(!switchDay)("follows local wall time at a real DST switch", () => {
    // Walk the day in real hours: each instant must read its own local clock time.
    const start = switchDay!.getTime();
    for (let t = start; t < start + 26 * 3600 * 1000; t += 15 * 60000) {
      const local = new Date(t);
      const a = clockHands(t);
      const mins = local.getMinutes();
      expect(a.minute, `${local.toString()}`).toBe(mins * 6);
      expect(a.hour, `${local.toString()}`).toBeCloseTo(((local.getHours() % 12) * 60 + mins) / 2);
    }
  });

  it("falls back to 12:00:00 for invalid input", () => {
    const zero = { hour: 0, minute: 0, second: 0 };
    for (const bad of [NaN, Infinity, -Infinity, 1e20])
      expect(clockHands(bad), `${bad}`).toEqual(zero);
  });
});

describe("clockHandCells", () => {
  const face = new Set<string>();
  PROPS.CLOCK.forEach((row, y) =>
    row.split("").forEach((c, x) => {
      if (c !== ".") face.add(`${x},${y}`);
    }),
  );
  const times = [
    at(2026, 5, 1, 12, 0, 0),
    at(2026, 5, 1, 3, 15, 0),
    at(2026, 5, 1, 6, 30, 0),
    at(2026, 5, 1, 9, 45, 0),
    at(2026, 5, 1, 1, 7, 0),
    at(2026, 5, 1, 10, 52, 0),
  ];

  it("keeps the face grid at the sheared box size", () => {
    expect(PROPS.CLOCK).toHaveLength(CLOCK_ROWS);
    for (const row of PROPS.CLOCK) expect(row).toHaveLength(CLOCK_FACE);
  });

  it("keeps both hands inside the clock face box and on the face", () => {
    for (const t of times)
      for (const c of clockHandCells(t)) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThan(CLOCK_FACE);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThan(CLOCK_ROWS);
        expect(face.has(`${c.x},${c.y}`), `${c.x},${c.y}`).toBe(true);
      }
  });

  it("draws every hand at least 2 cells wide", () => {
    for (const t of times) {
      const cells = clockHandCells(t);
      const has = (c: ClockCell) => cells.some((o) => o.x === c.x && o.y === c.y);
      // Each cell sits in a run of at least HAND_WIDTH cells along a row, or along a column
      // once the shear is undone (a sheared 2x2 block keeps a 2-wide row run).
      for (const c of cells) {
        const flatY = c.y - clockShear(c.x);
        const inRow = [c.x - 1, c.x].some((x0) =>
          Array.from({ length: HAND_WIDTH }, (_, i) => x0 + i).every((x) =>
            has({ x, y: flatY + clockShear(x) }),
          ),
        );
        expect(inRow, `${c.x},${c.y}`).toBe(true);
      }
    }
  });

  it("shears the hands down to the right at the wall slope", () => {
    expect(clockShear(CLOCK_FACE - 1)).toBeGreaterThan(clockShear(0));
  });

  it("moves with the time", () => {
    const key = (t: number) =>
      clockHandCells(t)
        .map((c) => `${c.x},${c.y}`)
        .sort()
        .join(";");
    expect(key(times[0])).not.toBe(key(times[1]));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  setSceneOverride(null);
});

describe("sceneFor", () => {
  const dates = [
    "2026-01-05",
    "2026-02-14",
    "2026-03-30",
    "2026-05-01",
    "2026-06-21",
    "2026-08-09",
    "2026-10-03",
    "2026-12-24",
  ];
  const hours = Array.from({ length: 24 }, (_, h) => h);

  it("is always one of the six scenes, for every hour of every date", () => {
    for (const d of dates)
      for (const h of hours) expect(WINDOW_SCENE_IDS, `${d} ${h}`).toContain(sceneFor(d, h));
    expect([...WINDOW_SCENE_IDS].sort()).toEqual(
      ["afternoon", "dusk", "night", "overcast", "rain", "snow"].sort(),
    );
  });

  it("is stable for the same date and hour, and pure (no clock, no randomness)", () => {
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Date.now");
    });
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random");
    });
    for (const d of dates)
      for (const h of hours) expect(sceneFor(d, h), `${d} ${h}`).toBe(sceneFor(d, h));
    expect(now).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
    expect(decorSrc).not.toMatch(/Math\.random|Date\.now/);
  });

  it("keeps the dim set to night late and early, dusk in the evening, weather by day", () => {
    for (const d of dates) {
      for (const h of [21, 22, 23, 0, 1, 2, 3, 4, 5])
        expect(sceneFor(d, h), `${d} ${h}`).toBe("night");
      for (const h of [17, 18, 19, 20]) expect(sceneFor(d, h), `${d} ${h}`).toBe("dusk");
      for (const h of [6, 9, 12, 16])
        expect(["afternoon", "overcast", "rain", "snow"], `${d} ${h}`).toContain(sceneFor(d, h));
    }
  });

  it("varies by day and reaches every scene", () => {
    const days = Array.from(
      { length: 60 },
      (_, i) => `2026-${i < 30 ? "01" : "07"}-${String((i % 30) + 1).padStart(2, "0")}`,
    );
    const seen = new Set<WindowSceneId>();
    for (const d of days) for (const h of hours) seen.add(sceneFor(d, h));
    expect([...seen].sort()).toEqual([...WINDOW_SCENE_IDS].sort());
    const noon = new Set(days.map((d) => sceneFor(d, 12)));
    expect(noon.size).toBeGreaterThan(1);
  });

  it("is namespaced: not the bare hash of the date and hour", async () => {
    const { hash } = await import("./appearance");
    const bare = (d: string, h: number) => hash(`${d}:${h}`) % 5;
    let differs = 0;
    for (let i = 1; i <= 28; i++) {
      const d = `2026-04-${String(i).padStart(2, "0")}`;
      if (
        ["afternoon", "afternoon", "overcast", "overcast", "rain"][bare(d, 11)] !== sceneFor(d, 11)
      )
        differs++;
    }
    expect(differs).toBeGreaterThan(0);
  });

  it("snows only in winter months", () => {
    for (let m = 4; m <= 10; m++)
      for (let d = 1; d <= 28; d++)
        for (const h of [8, 11, 14])
          expect(
            sceneFor(`2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, h),
          ).not.toBe("snow");
    const winter = [];
    for (let d = 1; d <= 28; d++)
      winter.push(sceneFor(`2026-01-${String(d).padStart(2, "0")}`, 11));
    expect(winter).toContain("snow");
  });

  it("falls back to dusk for an hour that is not 0 to 23", () => {
    for (const bad of [NaN, -1, 24, 1.5, Infinity, undefined as unknown as number])
      expect(sceneFor("2026-05-01", bad), `${bad}`).toBe("dusk");
  });
});

describe("window scene lookup", () => {
  it("returns dusk for an unknown, empty or non-string id", () => {
    for (const bad of [
      "bogus",
      "",
      "DUSK",
      "__proto__",
      "toString",
      undefined as unknown as string,
    ])
      expect(windowScene(bad).id, String(bad)).toBe("dusk");
    for (const id of WINDOW_SCENE_IDS) expect(windowScene(id).id).toBe(id);
  });

  it("has a scene for each id, with glass tokens that exist in GLASS", () => {
    expect(Object.keys(WINDOW_SCENES).sort()).toEqual([...WINDOW_SCENE_IDS].sort());
    for (const sc of Object.values(WINDOW_SCENES)) {
      for (const [ch, token] of Object.entries(sc.legend)) {
        expect(ch, sc.id).toHaveLength(1);
        expect(ch in CELLS, `${sc.id} ${ch} shadows a legend cell`).toBe(false);
        expect(GLASS, `${sc.id} ${token}`).toHaveProperty([token]);
      }
      expect(GLASS, `${sc.id} light`).toHaveProperty([sc.light]);
    }
  });
});

describe("local time wrappers", () => {
  const local = (y: number, mo: number, d: number, h: number, mi = 0, s = 0) =>
    new Date(y, mo, d, h, mi, s).getTime();

  it("reads the local date and hour of an explicit local Date", () => {
    expect(localDateKey(local(2026, 0, 5, 23, 59, 59))).toBe("2026-01-05");
    expect(localDateKey(local(2026, 0, 6, 0, 0, 0))).toBe("2026-01-06");
    expect(localDateKey(local(2026, 11, 31, 12))).toBe("2026-12-31");
    expect(sceneAt(local(2026, 0, 5, 23, 59, 59))).toBe(sceneFor("2026-01-05", 23));
    expect(sceneAt(local(2026, 0, 6, 0, 0, 0))).toBe(sceneFor("2026-01-06", 0));
  });

  it("changes only at the hour boundary, to the scene of the new hour", () => {
    for (let h = 0; h < 24; h++) {
      const first = sceneAt(local(2026, 2, 9, h, 0, 0));
      expect(sceneAt(local(2026, 2, 9, h, 30, 12)), `${h}:30`).toBe(first);
      expect(sceneAt(local(2026, 2, 9, h, 59, 59)), `${h}:59`).toBe(first);
      expect(first).toBe(sceneFor("2026-03-09", h));
    }
  });

  it("reads an unusable instant as dusk", () => {
    for (const bad of [NaN, Infinity, 1e20]) expect(sceneAt(bad), `${bad}`).toBe("dusk");
  });

  it.skipIf(!switchDay)("gives every instant of a real DST switch day its own local hour", () => {
    const start = switchDay!.getTime();
    for (let t = start; t < start + 26 * 3600 * 1000; t += 15 * 60000) {
      const d = new Date(t);
      expect(sceneAt(t), d.toString()).toBe(sceneFor(localDateKey(t), d.getHours()));
    }
  });

  it("lets a dev override win, and an unknown override read as dusk", () => {
    const now = local(2026, 0, 5, 12);
    expect(activeSceneId(now)).toBe(sceneAt(now));
    setSceneOverride("night");
    expect(activeSceneId(now)).toBe("night");
    setSceneOverride("bogus");
    expect(windowScene(activeSceneId(now)).id).toBe("dusk");
    setSceneOverride(null);
    expect(activeSceneId(now)).toBe(sceneAt(now));
  });

  // Value: a production build must not read the address bar for a scene.
  it("reads ?scene only inside import.meta.env.DEV in main.tsx", () => {
    expect(mainSrc.match(/get\("scene"\)/g)).toHaveLength(1);
    expect(mainSrc).toMatch(
      /if \(import\.meta\.env\.DEV\) \{[^}]*get\("scene"\)[^}]*setSceneOverride/,
    );
    expect(mainSrc.indexOf('get("scene")')).toBeGreaterThan(mainSrc.indexOf("import.meta.env.DEV"));
  });
});

// The flat drawing under the shear, with no stair-step exception: a sheared one-tall line has a
// stair-step neighbour in every column, so only the flat grid can tell a thick line from a thin one.
const unshear = (grid: readonly string[], wall: "left" | "right") => {
  const flat = Array.from({ length: WINDOW_FLAT_ROWS }, () => Array<string>(WINDOW_COLS).fill("."));
  grid.forEach((row, y) =>
    row.split("").forEach((c, x) => {
      if (c !== ".") flat[y - windowShear(wall, x)][x] = c;
    }),
  );
  return flat.map((r) => r.join(""));
};
const strictThin = (grid: readonly string[]) => {
  const bad: string[] = [];
  const at = (x: number, y: number) => grid[y]?.[x];
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[y].length; x++) {
      const c = grid[y][x];
      if (c === ".") continue;
      if (at(x, y - 1) !== c && at(x, y + 1) !== c) bad.push(`${x},${y} column`);
      if (at(x - 1, y) !== c && at(x + 1, y) !== c) bad.push(`${x},${y} row`);
    }
  return bad;
};

describe("window grids", () => {
  const walls = ["left", "right"] as const;
  const each = (f: (id: WindowSceneId, wall: "left" | "right") => void) => {
    for (const id of WINDOW_SCENE_IDS) for (const wall of walls) f(id, wall);
  };

  it("has the same size for every scene and wall, the sheared box size", () => {
    expect(WINDOW_ROWS).toBe(WINDOW_FLAT_ROWS + WINDOW_COLS / 2 - 1);
    each((id, wall) => {
      const { grid, cols, rows } = windowArt(windowScene(id), wall);
      expect([cols, rows], `${id} ${wall}`).toEqual([WINDOW_COLS, WINDOW_ROWS]);
      expect(grid).toHaveLength(WINDOW_ROWS);
      for (const row of grid) expect(row).toHaveLength(WINDOW_COLS);
    });
  });

  it("uses only legend cells, frame cells in --wood or --metal, and the scene's glass vars", () => {
    each((id, wall) => {
      const sc = windowScene(id);
      const used = new Set(windowArt(sc, wall).grid.join("").replaceAll(".", ""));
      for (const c of used) {
        if (c in sc.legend) {
          expect(GLASS, `${id} ${c}`).toHaveProperty([sc.legend[c]]);
        } else {
          expect(c in CELLS, `${id} ${wall} '${c}'`).toBe(true);
          expect(["var(--wood)", "var(--metal)"], `${id} '${c}'`).toContain(CELLS[c].fill);
        }
      }
    });
  });

  it("draws every line at least 2 cells thick in the flat drawing, no exceptions", () => {
    each((id, wall) => {
      const flat = unshear(windowArt(windowScene(id), wall).grid, wall);
      expect(flat.join("").replaceAll(".", "").length, `${id} ${wall} drawn`).toBeGreaterThan(500);
      expect(strictThin(flat), `${id} ${wall}`).toEqual([]);
    });
    expect(strictThin(["aab", "aab"]).length).toBeGreaterThan(0);
    expect(strictThin(["aa", "aa"])).toEqual([]);
    expect(strictThin(["aa", "bb", "aa"]).length).toBeGreaterThan(0);
  });

  // The window as drawn, one frame per animation step: sheared sky, then the clouds shifted by the
  // CSS step and clipped to the open panes, the skyline, the weather shifted and clipped the same
  // way, then blinds, mullion and frame. Steps and shifts are read from scene.css itself.
  const loop = (cls: string) => {
    const anim = new RegExp(
      `\\.${cls}\\s*\\{[^}]*animation:\\s*(\\S+)\\s+([\\d.]+)s\\s+steps\\((\\d+)\\)`,
    ).exec(sceneCss)!;
    const frames = new RegExp(
      `@keyframes ${anim[1]}\\s*\\{\\s*to\\s*\\{\\s*transform:\\s*([^;]+);`,
    ).exec(sceneCss)!;
    const [, a, b] = /translate(?:Y)?\(\s*(-?[\d.]+)px(?:\s*,\s*(-?[\d.]+)px)?\s*\)/.exec(
      frames[1],
    )!;
    const [dx, dy] = b === undefined ? [0, Number(a)] : [Number(a), Number(b)];
    return { steps: Number(anim[3]), ms: (Number(anim[2]) * 1000) / Number(anim[3]), dx, dy };
  };
  const paint = (
    canvas: string[][],
    runs: { x: number; y: number; w: number; c: string }[],
    dx: number,
    dy: number,
    clip?: Set<string>,
  ) => {
    for (const r of runs)
      for (let x = r.x; x < r.x + r.w; x++) {
        const px = x + dx;
        const py = r.y + dy;
        if (clip && !clip.has(`${px},${py}`)) continue;
        if (canvas[py]?.[px] !== undefined) canvas[py][px] = r.c;
      }
  };
  const frames = (id: WindowSceneId, wall: "left" | "right") => {
    const sc = windowScene(id);
    const art = windowArt(sc, wall);
    const clip = new Set(
      art.glass.flatMap((r) => Array.from({ length: r.w }, (_, i) => `${r.x + i},${r.y}`)),
    );
    const cloud = loop(`win-cloud-${wall}`);
    const rain = loop("win-rain");
    const snow = loop("win-snow");
    const moving = sc.weather === "rain" ? rain : snow;
    const count = Math.max(sc.cloud ? cloud.steps : 1, sc.weather ? moving.steps : 1);
    const out: { name: string; grid: string[] }[] = [];
    // Clouds and weather loop on their own clocks: every pair of steps is a frame to check.
    for (let i = 0; i < (sc.cloud ? cloud.steps : 1); i++)
      for (
        let j = 0;
        j < (sc.weather ? moving.steps : 1);
        j += Math.max(1, Math.floor(count / 8))
      ) {
        const canvas = Array.from({ length: art.rows }, () => Array<string>(art.cols).fill("."));
        paint(canvas, art.sky, 0, 0);
        if (sc.cloud)
          paint(
            canvas,
            art.cloud,
            (cloud.dx * i) / cloud.steps,
            (cloud.dy * i) / cloud.steps,
            clip,
          );
        paint(canvas, art.skyline, 0, 0);
        if (sc.weather)
          paint(
            canvas,
            art.weather,
            (moving.dx * j) / moving.steps,
            (moving.dy * j) / moving.steps,
            clip,
          );
        paint(canvas, art.over, 0, 0);
        out.push({
          name: `${id} ${wall} cloud step ${i} weather step ${j}`,
          grid: canvas.map((r) => r.join("")),
        });
      }
    return out;
  };

  it("moves clouds, rain and snow in whole cells, on the wall lattice, no faster than a step per 450 ms", () => {
    for (const wall of walls) {
      const c = loop(`win-cloud-${wall}`);
      expect(Math.abs(c.dx / c.steps), wall).toBe(2);
      expect(c.dy / c.steps, wall).toBe(wall === "right" ? 1 : -1);
      expect(c.dx % WINDOW_COLS).toBe(0);
      expect(c.ms).toBeGreaterThanOrEqual(450);
    }
    for (const [cls, period] of [
      ["win-rain", RAIN_PERIOD],
      ["win-snow", SNOW_PERIOD],
    ] as const) {
      const m = loop(cls);
      expect(m.dx, cls).toBe(0);
      expect(m.dy / m.steps, cls).toBe(2);
      expect(m.dy, cls).toBe(period);
      expect(m.ms, cls).toBeGreaterThanOrEqual(450);
    }
  });

  it("draws every line at least 2 cells thick in every composited frame, no exceptions", () => {
    let checked = 0;
    each((id, wall) => {
      for (const { name, grid } of frames(id, wall)) {
        checked++;
        expect(strictThin(grid), name).toEqual([]);
      }
    });
    // Every scene, both walls, at least the cloud steps of the cloudy ones.
    expect(checked).toBeGreaterThan(WINDOW_SCENE_IDS.length * 2);
  });

  it("covers the frozen reduced-motion frame (step 0) of every scene and wall", () => {
    each((id, wall) => expect(frames(id, wall)[0].name).toContain("cloud step 0 weather step 0"));
  });

  it("flags a one-cell line on a slope and a one-column cloud split, passes thick stair steps", () => {
    expect(strictThin(["aa....", "..aa..", "....aa"]).length).toBeGreaterThan(0);
    expect(strictThin([".ar", "arb", "rb."]).length).toBeGreaterThan(0);
    expect(strictThin(["aa....", "aaaa..", "..aaaa", "....aa"])).toEqual([]);
  });

  it("shears the right wall down to the right and the left wall up, a column pair per row", () => {
    expect(windowShear("right", WINDOW_COLS - 1) - windowShear("right", 0)).toBe(
      WINDOW_COLS / 2 - 1,
    );
    expect(windowShear("left", 0) - windowShear("left", WINDOW_COLS - 1)).toBe(WINDOW_COLS / 2 - 1);
    for (const wall of walls) {
      expect(windowShear(wall, 0)).toBe(windowShear(wall, 1));
      expect(Math.abs(windowShear(wall, 3) - windowShear(wall, 1))).toBe(1);
      // A move of 2 columns is 1 row along the wall: the cloud step is a lattice step.
      for (const x of [-30, -2, 0, 14, 28])
        expect(windowShear(wall, x + 2) - windowShear(wall, x)).toBe(wall === "right" ? 1 : -1);
    }
    expect(windowArt(windowScene("dusk"), "left").grid.join()).not.toBe(
      windowArt(windowScene("dusk"), "right").grid.join(),
    );
  });

  it("shows blind slats (two or three, 2 cells tall) in every scene", () => {
    each((id, wall) => {
      const slats = windowArt(windowScene(id), wall).grid.join("").match(/7/g) ?? [];
      expect(slats.length, `${id} ${wall}`).toBeGreaterThan(0);
    });
  });

  it("draws the weather and the clouds as moving layers, not in the static grid", () => {
    for (const id of WINDOW_SCENE_IDS) {
      const sc = windowScene(id);
      const art = windowArt(sc, "right");
      expect(art.weather.length > 0, `${id} weather`).toBe(sc.weather !== null);
      expect(art.cloud.length > 0, `${id} cloud`).toBe(sc.cloud !== null);
    }
    expect(WINDOW_SCENES.rain.weather).toBe("rain");
    expect(WINDOW_SCENES.snow.weather).toBe("snow");
  });

  it("keeps each moving tile's lines at least 2 cells, with whole-cell periods", () => {
    for (const [name, tile] of [
      ["cloud", CLOUD_TILE],
      ["rain", RAIN_TILE],
      ["snow", SNOW_TILE],
    ] as const) {
      expect(strictThin(tile), name).toEqual([]);
    }
    for (const p of [CLOUD_PERIOD, RAIN_PERIOD, SNOW_PERIOD]) expect(p % 2).toBe(0);
    for (const row of CLOUD_TILE) expect(row).toHaveLength(CLOUD_PERIOD);
    expect(RAIN_TILE).toHaveLength(RAIN_PERIOD);
    expect(SNOW_TILE).toHaveLength(SNOW_PERIOD);
  });

  it("draws the clip to the open panes only: glass cells, not frame or mullion", () => {
    each((id, wall) => {
      const art = windowArt(windowScene(id), wall);
      expect(art.glass.length).toBeGreaterThan(0);
      for (const r of art.glass)
        for (let x = r.x; x < r.x + r.w; x++) {
          const c = art.grid[r.y][x];
          expect(c in windowScene(id).legend || c === "7", `${id} ${wall} ${x},${r.y} '${c}'`).toBe(
            true,
          );
        }
    });
  });
});
