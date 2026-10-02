import { describe, expect, it, vi } from "vite-plus/test";
import { identityFor, pickShirt, shirtSlot, type ShirtChoice } from "./identity";
import { SHIRTS } from "./palette";

const paths = (n: number) => Array.from({ length: n }, (_, i) => `/Users/dev/code/project-${i}`);

// Assign in arrival order, the way the office does: each new project sees the
// shirts already held by the active ones.
function assignAll(projects: string[]): ShirtChoice[] {
  const held: ShirtChoice[] = [];
  for (const p of projects) held.push(pickShirt(p, held));
  return held;
}

describe("identityFor", () => {
  it("gives the same name and gender for the same session id", () => {
    expect(identityFor("session-a")).toEqual(identityFor("session-a"));
  });

  it("returns a non-empty name and a known gender", () => {
    for (let i = 0; i < 50; i++) {
      const id = identityFor(`s-${i}`);
      expect(id.name.length).toBeGreaterThan(0);
      expect(["female", "male"]).toContain(id.gender);
    }
  });

  it("spreads sessions over several names and both genders", () => {
    const ids = Array.from({ length: 100 }, (_, i) => identityFor(`s-${i}`));
    expect(new Set(ids.map((i) => i.name)).size).toBeGreaterThan(10);
    expect(new Set(ids.map((i) => i.gender)).size).toBe(2);
  });
});

describe("pickShirt", () => {
  it("is stable for the same path and the same held shirts", () => {
    expect(pickShirt("/a/b", [])).toEqual(pickShirt("/a/b", []));
  });

  it("stays inside the 8 palette colors", () => {
    for (const p of paths(30)) {
      const s = pickShirt(p, []);
      expect(s.index).toBeGreaterThanOrEqual(0);
      expect(s.index).toBeLessThan(SHIRTS.length);
    }
  });

  it("gives 16 projects 16 distinct (color, stripe) pairs", () => {
    const shirts = assignAll(paths(16));
    expect(new Set(shirts.map(shirtSlot)).size).toBe(16);
  });

  it("uses no stripe until the 9th project, then stripes", () => {
    const shirts = assignAll(paths(16));
    expect(shirts.slice(0, 8).every((s) => !s.stripe)).toBe(true);
    expect(new Set(shirts.slice(0, 8).map((s) => s.index)).size).toBe(8);
    expect(shirts.slice(8).every((s) => s.stripe)).toBe(true);
  });

  it("avoids a collision when the preferred color is taken", () => {
    const first = pickShirt("/a/b", []);
    const second = pickShirt("/a/b", [first]);
    expect(shirtSlot(second)).not.toBe(shirtSlot(first));
  });

  it("falls back to the preferred slot past 16 projects", () => {
    const shirts = assignAll(paths(16));
    expect(pickShirt("/another", shirts)).toEqual(pickShirt("/another", shirts));
  });
});

describe("determinism", () => {
  it("uses no clock and no randomness", () => {
    const random = vi.spyOn(Math, "random");
    const now = vi.spyOn(Date, "now");
    identityFor("s");
    pickShirt("/a/b", []);
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    random.mockRestore();
    now.mockRestore();
  });
});

describe("palette size", () => {
  it("has the 8 shirt colors the 16-pair comments and tests assume", () => {
    expect(SHIRTS.length).toBe(8);
  });
});
