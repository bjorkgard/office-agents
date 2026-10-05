import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { layoutOffice } from "./iso";
import { agentKey, TUNING, type Agent, type OfficeState } from "./machine";
import { Scene } from "./Scene";
import { pulser } from "./app-logic";
import { roomShell, wallPropRect } from "./room";
import { DESK_CAP } from "../../shared/tuning";
import { DeskLayer, SCREEN_BAND_CELLS } from "./DeskLayer";
import { geometryFor } from "./scene-model";
import { DESK_KINDS } from "./desk-kinds";
import { CELL } from "./pixel";
import { propSize } from "./props";
import { deviceFor } from "./devices";
import { QUEUE_VISIBLE, TAG_H, tagWidth } from "./scene-model";
import {
  CLOUD_PERIOD,
  RAIN_PERIOD,
  SNOW_PERIOD,
  WINDOW_SCENE_IDS,
  sceneFor,
  setSceneOverride,
  windowScene,
} from "./decor";
import { ART, GLASS } from "./palette";
import { DOOR_TUNING } from "./paper";
import { decorVariantFor } from "./decor";
import sceneSrc from "./Scene.tsx?raw";

// Vitest blanks css imports (even ?raw) and the app tsconfig has no node types, so read the file
// through the runtime's own fs.
// @ts-expect-error node:fs has no types in the app project
const { readFileSync } = (await import("node:fs")) as {
  readFileSync: (url: URL, enc: string) => string;
};
const css = readFileSync(new URL("./scene.css", import.meta.url), "utf8");

function agent(sessionId: string, agentId: string | null, over: Partial<Agent> = {}): Agent {
  return {
    key: agentKey(sessionId, agentId),
    sessionId,
    agentId,
    projectId: "p",
    parentAgentId: null,
    state: "working",
    phase: "working",
    arrivedAt: 0,
    lastEventAt: 0,
    idleSince: null,
    leftAt: null,
    openTools: {},
    unresolved: {},
    waitingOn: [],
    attention: null,
    episode: null,
    ...over,
  };
}

const waving = (id: string, since: number, trigger: "tool" | "question" = "question") =>
  agent(id, null, {
    state: "attention",
    attention: { trigger },
    episode: { id: `${id}#1`, waitingSince: since, exitedAt: null },
  });

function render(
  agents: Agent[],
  seats: Record<string, number>,
  failure: Error | null = null,
  viewport = { width: 1200, height: 800 },
  clock?: () => number,
  now = 10 * 60_000,
) {
  const office: OfficeState = {
    agents: Object.fromEntries(agents.map((a) => [a.key, a])),
    episodeSeq: 0,
    returned: {},
  };
  return renderToStaticMarkup(
    <Scene
      office={office}
      seats={seats}
      projects={{ p: "/work/atlas" }}
      viewport={viewport}
      now={now}
      failure={failure}
      clock={clock}
    />,
  );
}

describe("Scene", () => {
  it("renders a leaving agent that still holds a seat, including the highest desk", () => {
    expect(() => render([agent("s1", null, { state: "leaving" })], { s1: 0 })).not.toThrow();
    const html = render([agent("s1", null), agent("s2", null, { state: "leaving" })], {
      s1: 0,
      s2: 1,
    });
    expect(html).toContain('data-desk="1"');
  });

  it("an attention agent always has the raised hand, the floor ring and the bubble", () => {
    const html = render([waving("s1", 0)], { s1: 0 });
    expect(html).toContain('data-state="attention"');
    expect(html).toContain('data-pose="seated-raised-hand"');
    expect(html).toContain("data-ring=");
    expect(html).toContain("data-bubble=");
    expect(html).toContain("Asking you");
    expect(html).toContain("10m");
  });

  it("a stuck tool wave says Stuck? and no other state draws a ring or bubble", () => {
    expect(render([waving("s1", 0, "tool")], { s1: 0 })).toContain("Stuck?");
    const html = render([agent("s1", null)], { s1: 0 });
    expect(html).not.toContain("data-ring=");
    expect(html).not.toContain("data-bubble=");
  });

  it("exposes data-state and data-shirt on the character", () => {
    const html = render([agent("s1", null)], { s1: 0 });
    expect(html).toMatch(/data-state="working"[^>]*data-shirt="[a-z ]+"/);
  });

  it("draws the desk drawing once and a <use> per desk (R5)", () => {
    const html = render([agent("s1", null), agent("s2", null)], { s1: 0, s2: 1 });
    expect(html.match(/data-part="desk-defs"/g)).toHaveLength(1);
    // Every row draws all four desks, seated or not.
    expect(html.match(/<use /g)).toHaveLength(4);
    expect(html.match(/data-desk=/g)).toHaveLength(4);
    // Two kinds, each lit and dim: four symbols; each desk uses its kind's by index.
    expect(html.match(/<g id="desk-/g)).toHaveLength(4);
    const uses = [...html.matchAll(/href="#desk-(tidy|cluttered)-(?:lit|dim)"/g)].map((m) => m[1]);
    expect(uses).toEqual(["tidy", "cluttered", "tidy", "cluttered"]);
  });

  it("names each hit area with first name, project and state, waiting agents first", () => {
    const html = render([agent("s1", null), waving("s2", 0)], { s1: 0, s2: 1 });
    const labels = [...html.matchAll(/class="hit" aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toMatch(/, atlas, waiting for you$/);
    expect(labels[1]).toMatch(/, atlas, working$/);
  });

  it("shows +N on the parent's tag for subagents queued past its two slots", () => {
    // Rows grow for subagents up to DESK_CAP: 20 desks are free, so 23 subagents leave 3 over.
    const kids = Array.from({ length: 23 }, (_, i) => agent("s1", `k${i}`, { arrivedAt: i }));
    const others = ["s2", "s3", "s4"].map((id) => agent(id, null));
    const html = render([agent("s1", null), ...others, ...kids], { s1: 0, s2: 1, s3: 2, s4: 3 });
    expect(html).toContain("+1");
  });

  it("seats every subagent when a departed session still holds a seat (rows grow past it)", () => {
    // Seats {A: 0, B: 1}, B has left: A and 3 subagents need desks 0, 2, 3, 4 -> two rows.
    const kids = [0, 1, 2].map((i) => agent("A", `k${i}`, { arrivedAt: i }));
    const html = render(
      [agent("A", null), ...kids],
      { A: 0, B: 1 },
      null,
      undefined,
      () => 120_000,
    );
    // Someone sits at four desks: the parent and the three subagents all glow, the subagents with devices.
    expect(html.match(/data-screen="live"/g)).toHaveLength(4);
    expect(html.match(/data-device=/g)).toHaveLength(3);
    expect(html.match(/data-desk=/g)).toHaveLength(8);
  });

  it("throws a machine failure so the ErrorBoundary can catch it", () => {
    expect(() => render([], {}, new Error("boom"))).toThrow("boom");
  });
});

describe("Scene choreography", () => {
  // Desk 1 is empty: the subagent of s1 works there.
  const cast = [agent("s1", null), agent("s2", null), agent("s1", "k", { arrivedAt: 1000 })];
  const seats = { s1: 0, s2: 2 };
  const hitLeft = (html: string) =>
    [...html.matchAll(/class="hit"[^>]*style="left:([^;"]+)/g)].map((m) => m[1]);

  it("walks a fresh subagent from the door instead of standing it at a slot", () => {
    const html = render(cast, seats, null, undefined, () => 1100);
    const kid = /<div class="agent"[^>]*data-pose="([^"]+)"[^>]*data-path/.exec(html);
    expect(kid?.[1]).toBe("walking");
  });

  it("seats the subagent at the empty desk once its path is over, and lights it", () => {
    const html = render(cast, seats, null, undefined, () => 1000 + 120_000);
    expect(html).toMatch(/data-pose="seated-typing"[^>]*data-path/);
    expect(html.match(/data-path/g)).toHaveLength(1);
    expect(html.match(/class="hit"/g)).toHaveLength(3);
  });

  it("moves the subagent's hit area as it walks", () => {
    const early = hitLeft(render(cast, seats, null, undefined, () => 1100));
    const late = hitLeft(render(cast, seats, null, undefined, () => 1000 + 120_000));
    expect(early).toHaveLength(3);
    expect(early).not.toEqual(late);
  });

  it("an idle agent sits at first and walks to the coffee station later", () => {
    const idle = agent("s1", null, { state: "idle", phase: "idle", idleSince: 5000 });
    const sit = render([idle], { s1: 0 }, null, undefined, () => 5500);
    expect(sit).toContain('data-pose="seated-idle"');
    const walk = render([idle], { s1: 0 }, null, undefined, () => 5000 + 3000);
    expect(walk).toMatch(/data-pose="walking"[^>]*data-path/);
  });
});

describe("Scene ambient life", () => {
  it("places the clock, steam and swaying plants without touching agent state", () => {
    const empty = render([], {});
    for (const name of ["CLOCK", "STEAM", "PLANT_TALL", "PLANT_BUSH", "DISPENSER", "GURGLE"])
      expect(empty).toContain(`data-prop="${name}"`);
    expect(empty).toContain("gurgle");
    expect(empty).toContain("clock-hand");
    expect(empty).toContain("sway");
    const html = render([agent("s1", null)], { s1: 0 });
    expect(html).toMatch(/data-state="working"/);
  });
});

const px = (style: string, prop: string) =>
  Number(new RegExp(`(?:^|;)${prop}:(-?[\\d.]+)px`).exec(style)![1]);
/** The style attribute of the div that wraps a prop's svg. */
const wrapperStyle = (html: string, prop: string) =>
  new RegExp(`<div[^>]*style="([^"]*)"[^>]*><svg[^>]*data-prop="${prop}"`).exec(html)![1];

describe("Scene wall clock", () => {
  const delay = (html: string) =>
    /class="clock-hand" style="animation-delay:([^"]*)"/.exec(html)![1];
  const at = (second: number) => new Date(2026, 5, 1, 12, 0, second).getTime();

  it("starts the second hand at the injected clock's second, not Date.now", () => {
    expect(delay(render([], {}, null, undefined, () => at(30)))).toBe("-30s");
    expect(delay(render([], {}, null, undefined, () => at(6)))).toBe("-6s");
    expect(delay(render([], {}, null, undefined, () => at(0)))).toBe("0s");
  });
});

describe("Scene bush plant", () => {
  it("stands at the shell's bush spot, clear of the dispenser and coffee spots", () => {
    const shell = roomShell(layoutOffice(1, { width: 1200, height: 800 }));
    const style = wrapperStyle(render([agent("s1", null)], { s1: 0 }), "PLANT_BUSH");
    const { width, height } = propSize("PLANT_BUSH");
    expect(px(style, "left")).toBeCloseTo(shell.plantBush.x - width / 2);
    expect(px(style, "top")).toBeCloseTo(shell.plantBush.y - height);
    expect(shell.plantBush.x).toBeLessThan(shell.coffee.x);
  });
});

describe("Scene wall props", () => {
  const html = render([agent("s1", null)], { s1: 0 });
  const shell = roomShell(layoutOffice(1, { width: 1200, height: 800 }));

  it("draws the door and coffee station without skew, the clock hands skewed onto the wall", () => {
    for (const name of ["DOOR", "COFFEE_STATION", "DISPENSER", "CLOCK"])
      expect(wrapperStyle(html, name)).not.toMatch(/skew|transform/);
    const hands = /<svg[^>]*viewBox="0 0 12 18"[^>]*>(.*?)<\/svg>/.exec(html)![1];
    expect(hands).toMatch(/<rect[^>]*fill="var\(--outline\)"/);
  });

  it("puts the door, coffee station and dispenser where their base meets the wall", () => {
    for (const [name, at] of [
      ["DOOR", shell.door],
      ["COFFEE_STATION", shell.coffee],
      ["DISPENSER", shell.dispenser],
    ] as const) {
      const r = wallPropRect(name, at);
      const style = wrapperStyle(html, name);
      expect(px(style, "left")).toBeCloseTo(r.left);
      expect(px(style, "top")).toBeCloseTo(r.top);
    }
  });
});

describe("Scene seated layering", () => {
  const z = (html: string) =>
    Number(/class="agent"[^>]*style="[^"]*z-index:(-?\d+)/.exec(html)![1]);
  const deskZ = (html: string) =>
    Number(/data-desk="0" style="[^"]*z-index:(-?\d+)/.exec(html)![1]);

  it("keeps the character body under the desk, except a raised arm", () => {
    const working = render([agent("s1", null)], { s1: 0 });
    expect(z(working)).toBe(deskZ(working) - 1);
    const waves = render([waving("s1", 0)], { s1: 0 });
    expect(z(waves)).toBe(deskZ(waves) + 1);
  });
});

describe("Scene waving crowd", () => {
  const view = { width: 1200, height: 800 };
  const crowd = Array.from({ length: 24 }, (_, i) => waving(`s${i}`, i * 1000));
  const seats = Object.fromEntries(crowd.map((a, i) => [a.sessionId, i]));
  const html = render(crowd, seats, null, view);
  const fit = layoutOffice(24, view).fit;
  // Bubbles are plain screen px at the final fit; tags are calc() in the fit vars, evaluated here.
  const num = (s: string, p: string) => {
    const calc = new RegExp(
      `(?:^|;)${p}:calc\\(var\\(--fit-s\\) \\* (-?[\\d.e-]+)px \\+ var\\(--fit-([xy])\\)(?: \\+ (-?[\\d.e-]+)px)?\\)`,
    ).exec(s);
    if (!calc) return Number(new RegExp(`(?:^|;)${p}:(-?[\\d.]+)px`).exec(s)![1]);
    return fit.scale * Number(calc[1]) + fit[calc[2] as "x" | "y"] + Number(calc[3] ?? 0);
  };
  const bubbles = [...html.matchAll(/data-bubble="([^"]+)"([^>]*)style="([^"]*)"/g)].map((m) => ({
    id: m[1].slice(0, -1),
    hidden: m[2].includes("data-hidden"),
    x: num(m[3], "left"),
    y: num(m[3], "top"),
  }));
  // Each agent's tag: centered on `left`, `TAG_H` tall.
  const tags = [
    ...html.matchAll(/class="tag"[^>]*style="([^"]*)"[^>]*><b>([^<]*)<\/b> <span>([^<]*)<\/span>/g),
  ].map((m, i) => ({
    id: `s${i}`,
    x: num(m[1], "left") - tagWidth(m[2], m[3], 0) / 2,
    y: num(m[1], "top"),
    width: tagWidth(m[2], m[3], 0),
  }));

  it("never lets a shown bubble cover another agent's tag, except the longest wait's", () => {
    expect(bubbles).toHaveLength(24);
    expect(tags).toHaveLength(24);
    // s0 has waited longest (since 0): it is always shown and may sit over a neighbour's tag.
    for (const b of bubbles.filter((b) => !b.hidden && b.id !== "s0"))
      for (const t of tags.filter((t) => t.id !== b.id))
        expect(b.x < t.x + t.width && t.x < b.x + 112 && b.y < t.y + TAG_H && t.y < b.y + 32).toBe(
          false,
        );
  });

  it("places every bubble with calc() in the fit vars, so it eases with its agent", () => {
    const styles = [...html.matchAll(/data-bubble="[^"]+"[^>]*style="([^"]*)"/g)].map((m) => m[1]);
    expect(styles).toHaveLength(24);
    for (const st of styles) {
      expect(st).toMatch(/(?:^|;)left:calc\(var\(--fit-s\) \* -?[\d.e-]+px \+ var\(--fit-x\)/);
      expect(st).toMatch(/(?:^|;)top:calc\(var\(--fit-s\) \* -?[\d.e-]+px \+ var\(--fit-y\)/);
    }
  });

  it("hides some bubbles rather than stack them on neighbours", () => {
    expect(bubbles.filter((b) => b.hidden).length).toBeGreaterThan(0);
    expect(bubbles.filter((b) => !b.hidden).length).toBeGreaterThan(0);
  });
});

describe("Scene longest-waiting bubble", () => {
  const view = { width: 1200, height: 800 };
  const shown = (html: string, id: string) => {
    const m = new RegExp(`data-bubble="${id}\\u0000"([^>]*)>`).exec(html);
    return m !== null && !m[1].includes("data-hidden");
  };
  const workers = (n: number) => Array.from({ length: n }, (_, i) => agent(`w${i}`, null));

  it("keeps a lone waiting agent's bubble at every seat among 24 workers", () => {
    for (let seat = 0; seat < 24; seat++) {
      const all = workers(24);
      all[seat] = waving(`w${seat}`, 0);
      const seats = Object.fromEntries(all.map((a, i) => [a.sessionId, i]));
      expect(shown(render(all, seats, null, view), `w${seat}`)).toBe(true);
    }
  });

  it("always shows the longer of two waiting agents' bubbles", () => {
    // Every third seat as the longer wait (8 x 3 = 24 renders, ~1.5 s): all 72 timed out under load.
    for (let a = 0; a < 24; a += 3)
      for (const b of [(a + 1) % 24, (a + 4) % 24, (a + 5) % 24]) {
        const all = workers(24);
        all[a] = waving(`w${a}`, 0);
        all[b] = waving(`w${b}`, 5000);
        const seats = Object.fromEntries(all.map((x, i) => [x.sessionId, i]));
        expect(shown(render(all, seats, null, view), `w${a}`)).toBe(true);
      }
  });
});

describe("Scene door queue overflow (DR1)", () => {
  const queued = (n: number) =>
    render(
      [
        agent("s1", null),
        ...Array.from({ length: n }, (_, i) => agent(`q${i}`, null, { arrivedAt: i })),
      ],
      { s1: 0 },
    );

  it("shows no marker while everyone queued has a character", () => {
    expect(queued(QUEUE_VISIBLE)).not.toContain("data-queue-more");
  });

  it("counts the rest in a non-interactive +N status after every agent button", () => {
    const html = queued(QUEUE_VISIBLE + 3);
    expect(html).not.toMatch(/<button[^>]*data-queue-more/);
    const marker =
      /<span[^>]*role="status"[^>]*data-queue-more[^>]*aria-label="([^"]+)"[^>]*>([^<]*)<\/span>/.exec(
        html,
      )!;
    expect(marker[1]).toBe("and 3 more waiting");
    expect(marker[2]).toBe("+3");
    expect(html.lastIndexOf("data-queue-more")).toBeGreaterThan(html.lastIndexOf('class="hit"'));
    // One hit per drawn agent, plus one per overflow agent parked at the +N spot (3 here).
    expect(html.match(/class="hit"/g)).toHaveLength(1 + QUEUE_VISIBLE + 3);
  });

  const hitOf = (html: string, key: string) =>
    new RegExp(`<div data-agent="${key}"><button[^>]*class="hit"[^>]*aria-label="([^"]+)"`).exec(
      html,
    );

  it("overflow waiting agent has a focusable hit button", () => {
    const html = queued(QUEUE_VISIBLE + 2);
    const last = hitOf(html, agentKey(`q${QUEUE_VISIBLE + 1}`, null))!;
    expect(last).not.toBeNull();
    expect(last[1]).toContain("in the queue by the door");
    expect(hitOf(html, agentKey(`q${QUEUE_VISIBLE}`, null))![1]).not.toBe(last[1]);
    expect(html).not.toMatch(/class="hit"[^>]*tabindex="-1"/);
  });

  it("chip click on an overflow agent moves focus and sets data-pulse", () => {
    const key = agentKey(`q${QUEUE_VISIBLE}`, null);
    expect(hitOf(queued(QUEUE_VISIBLE + 1), key)).not.toBeNull();
    const el = fakeHit();
    const p = pulser((k) => (k === key ? el : undefined), 1200, fakeTimers());
    p.pulse(key);
    expect(el.focused).toBe(true);
    expect(el.attrs.has("data-pulse")).toBe(true);
  });

  it("agent leaving the queue mid-pulse leaves no stale data-pulse", () => {
    const key = agentKey(`q${QUEUE_VISIBLE}`, null);
    const timers = fakeTimers();
    const old = fakeHit();
    const fresh = fakeHit();
    let current = old;
    const p = pulser((k) => (k === key ? current : undefined), 1200, timers);
    p.pulse(key);
    old.isConnected = false;
    current = fresh;
    expect(fresh.attrs.has("data-pulse")).toBe(false);
    timers.fire();
    expect(fresh.attrs.has("data-pulse")).toBe(false);
    p.pulse(key);
    expect(fresh.attrs.has("data-pulse")).toBe(true);
    p.pulse("gone");
    expect(fresh.attrs.has("data-pulse")).toBe(true);
  });
});

function fakeHit() {
  const attrs = new Set<string>();
  return {
    attrs,
    focused: false,
    isConnected: true,
    offsetWidth: 0,
    focus() {
      this.focused = true;
    },
    setAttribute: (n: string) => void attrs.add(n),
    removeAttribute: (n: string) => void attrs.delete(n),
  };
}

function fakeTimers() {
  let fn: (() => void) | null = null;
  return {
    set: (f: () => void) => {
      fn = f;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    clear: () => {
      fn = null;
    },
    fire: () => fn?.(),
  };
}

describe("Scene focus container", () => {
  it("is a programmatic focus target with a label", () => {
    const html = render([agent("s1", null)], { s1: 0 });
    expect(html).toMatch(/<div[^>]*data-testid="scene"[^>]*tabindex="-1"/);
    expect(html).toMatch(/<div[^>]*data-testid="scene"[^>]*aria-label="Office"/);
  });
});

describe("Scene screens", () => {
  const overlays = (html: string) => html.match(/data-screen-overlay/g) ?? [];
  const screens = (html: string) => [...html.matchAll(/data-desk="\d+"[^>]*data-screen="(\w+)"/g)];
  const waiting = (id: string) => agent(id, null, { state: "waiting-on-subagents" });

  it("draws one overlay per working or waiting desk, and none on an empty office", () => {
    expect(overlays(render([], {}))).toHaveLength(0);
    const html = render(
      [agent("s1", null), waiting("s2"), agent("s3", null, { state: "idle" }), waving("s4", 0)],
      { s1: 0, s2: 1, s3: 2, s4: 3 },
    );
    expect(overlays(html)).toHaveLength(2);
    expect(html.match(/class="screen-pattern"/g)).toHaveLength(2);
  });

  it("marks each desk with its screen state", () => {
    const html = render([agent("s1", null), waiting("s2"), agent("s3", null, { state: "idle" })], {
      s1: 0,
      s2: 1,
      s3: 2,
    });
    expect(screens(html).map((m) => m[1])).toEqual(["live", "still", "off", "off"]);
  });

  it("gives arriving, leaving, idle and attention desks no overlay", () => {
    for (const state of ["arriving", "leaving", "idle"] as const)
      expect(overlays(render([agent("s1", null, { state })], { s1: 0 })), state).toHaveLength(0);
    expect(overlays(render([waving("s1", 0)], { s1: 0 }))).toHaveLength(0);
  });

  it("animates only the live overlay", () => {
    const live = render([agent("s1", null)], { s1: 0 });
    const still = render([waiting("s1")], { s1: 0 });
    expect(live).toMatch(/class="screen-overlay screen-live"/);
    expect(still).toMatch(/class="screen-overlay"/);
    expect(still).not.toContain("screen-live");
  });

  it("binds the scroll animation to the live pattern only", () => {
    const rules = [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({
      selector: m[1].trim(),
      body: m[2],
    }));
    const animated = rules.filter(
      (r) => /animation[^;]*screen-scroll/.test(r.body) && !/animation:\s*none/.test(r.body),
    );
    expect(animated.length).toBeGreaterThan(0);
    for (const r of animated) expect(r.selector).toContain(".screen-live");
    for (const r of rules) {
      if (/\.screen-(pattern|still|overlay)\b/.test(r.selector) && /animation/.test(r.body)) {
        if (!/animation:\s*none/.test(r.body)) expect(r.selector).toContain(".screen-live");
      }
    }
  });

  it("makes the live overlay static under reduced motion", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/\.screen-live \.screen-pattern\s*{[^}]*animation:\s*none/);
  });

  it("draws lines at least two cells thick", () => {
    expect(SCREEN_BAND_CELLS).toBeGreaterThanOrEqual(2);
  });
});

describe("Scene door ajar", () => {
  const arriving = agent("s1", "a1", { state: "arriving", phase: "arriving", arrivedAt: 1000 });
  const doorAt = (ms: number) =>
    render([agent("s1", null), arriving], { s1: 0 }, null, undefined, () => ms).match(
      /data-door="(open|closed)"/,
    )?.[1];

  it("flips data-door as the subagent arrives, and draws the floor wedge only while open", () => {
    expect(doorAt(900)).toBe("closed");
    expect(doorAt(1010)).toBe("open");
    expect(doorAt(1000 + DOOR_TUNING.ARRIVE_OPEN_MS + 1)).toBe("closed");
    const open = render([agent("s1", null), arriving], { s1: 0 }, null, undefined, () => 1010);
    expect(open).toContain('data-part="door-light"');
    expect(open.match(/data-part="door-light"/g)).toHaveLength(2);
    expect(open).toContain('data-part="door-light" data-tone="near"');
    expect(open).toContain('data-part="door-light" data-tone="far"');
    expect(open).toContain('data-prop="DOOR_AJAR"');
    const shut = render([agent("s1", null), arriving], { s1: 0 }, null, undefined, () => 900);
    expect(shut).not.toContain('data-part="door-light"');
    expect(shut).not.toContain('data-prop="DOOR_AJAR"');
  });
});

describe("Scene door ajar for a leaver", () => {
  // Value: protects=a subagent walking out to the door opens it in the mounted scene and it shuts once removed; fails_when=the leaving window is dropped from the door or never ends; why_new=the arrival test above never renders a leaving subagent; seam=none
  it("opens at some point while a leaver walks out, and is closed once it is removed", () => {
    const leftAt = 5000;
    const leaver = agent("s1", "a1", {
      state: "leaving",
      phase: "leaving",
      arrivedAt: 1000,
      leftAt,
    });
    const doorAt = (ms: number) =>
      render([agent("s1", null), leaver], { s1: 0 }, null, undefined, () => ms).match(
        /data-door="(open|closed)"/,
      )?.[1];
    const seen = new Set<string | undefined>();
    // The open window is at least LEAD_MS + FADE_MS (1 s) wide, so a 500 ms step cannot step over it: 40 renders, not 400.
    for (let ms = leftAt; ms < leftAt + TUNING.subagentLeavingMs; ms += 500) seen.add(doorAt(ms));
    expect(seen.has("open")).toBe(true);
    expect(doorAt(leftAt + TUNING.subagentLeavingMs + 1)).toBe("closed");
    expect(doorAt(leftAt - 1)).toBe("closed");
  });
});

describe("Scene decor variant on a date change", () => {
  // Value: protects=the shelf and pictures recolor when the local date rolls over while the page stays mounted; fails_when=the variant is fixed at mount or ignores the now prop; why_new=decor.test covers decorVariantFor only, not the rendered Scene; seam=none
  it("renders a different decor area on a date with another variant, the same on the same date", () => {
    const day = (d: number, h = 12) => new Date(2026, 5, d, h, 0, 0).getTime();
    const dates = Array.from({ length: 30 }, (_, i) => i + 1);
    const a = dates[0];
    const b = dates.find(
      (d) =>
        decorVariantFor(`2026-06-${String(d).padStart(2, "0")}`) !==
        decorVariantFor(`2026-06-${String(a).padStart(2, "0")}`),
    );
    expect(b).toBeDefined();
    const rows = Array.from({ length: 12 }, (_, i) => agent(`s${i}`, null));
    const seats = Object.fromEntries(rows.map((_, i) => [`s${i}`, i]));
    const decor = (ms: number) =>
      (
        render(rows, seats, null, undefined, undefined, ms).match(
          /<svg data-prop="(?:BOOKSHELF|PICTURE_[AB])" data-decor-variant="\d"[^>]*>.*?<\/svg>/g,
        ) ?? []
      ).join("");
    expect(decor(day(a))).toContain("BOOKSHELF");
    expect(decor(day(a, 9))).toBe(decor(day(a, 18)));
    expect(decor(day(a))).not.toBe(decor(day(b as number)));
  });
});

describe("Scene timer folding", () => {
  // Value: one timer wakes for whichever of the paper and the door changes first; a door-only timer would leave it open.
  it("arms the single paper timer at the earlier of the paper's and the door's next change", () => {
    expect(sceneSrc).toMatch(
      /const nextWake = Math\.min\(nextPaper, door\.nextChange \?\? Infinity\)/,
    );
    expect(sceneSrc).toMatch(/armPaperTimer\(\s*nextWake,/);
    expect(sceneSrc).toMatch(/\[nextWake, clock, paperTick\]/);
    expect(sceneSrc.match(/armPaperTimer\(/g)).toHaveLength(1);
  });
});

describe("Scene paper on the desk", () => {
  const arriving = agent("s1", "a1", {
    state: "arriving",
    phase: "arriving",
    arrivedAt: 1000,
    parentAgentId: null,
  });
  const at = (ms: number) => () => ms;

  it("lies at the paper slot of the parent's desk, never on the monitor", () => {
    const html = render([agent("s1", null), arriving], { s1: 0 }, null, undefined, at(1010));
    const slot = DESK_KINDS[0].paperSlot;
    expect(html).toContain("data-paper");
    expect(html).toContain(`left:${slot.x * CELL}px;top:${slot.y * CELL}px`);
    expect(html).toContain('data-prop="PAPER_DESK"');
    expect(html).not.toContain("left:40px;top:28px");
    expect(html).not.toContain('data-prop="PAPER"');
  });

  it("is absent when no subagent hands over", () => {
    expect(render([agent("s1", null)], { s1: 0 }, null, undefined, at(1010))).not.toContain(
      "data-paper",
    );
  });

  it("renders plain, then data-fading, then nothing as the subagent takes the sheet", () => {
    const seen: string[] = [];
    for (let ms = 1000; ms <= 5000; ms += 50) {
      const html = render([agent("s1", null), arriving], { s1: 0 }, null, undefined, at(ms));
      const m = html.match(/<[^>]*data-paper[^>]*>/)?.[0];
      const kind = m === undefined ? "none" : m.includes("data-fading") ? "fading" : "plain";
      if (seen[seen.length - 1] !== kind) seen.push(kind);
    }
    expect(seen).toEqual(["plain", "fading", "none"]);
  });

  it("has a fade-in and, under reduced motion, a --dur-slow fade rule", () => {
    expect(css).toMatch(/\.paper-desk\s*{[^}]*animation:\s*fade-in var\(--dur-slow\)/);
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/\.paper-desk[^{]*{[^}]*animation-duration:\s*var\(--dur-slow\)/);
  });
});

describe("Scene rows on demand", () => {
  const settled = () => 10 * 60_000;
  const parents = (n: number) => Array.from({ length: n }, (_, i) => agent(`s${i}`, null));
  const seatsOf = (n: number) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`s${i}`, i]));
  const kids = (n: number, parent = "s0") =>
    Array.from({ length: n }, (_, i) =>
      agent(parent, `k${i}`, { arrivedAt: i + 1, parentAgentId: null }),
    );
  const deskCount = (html: string) => (html.match(/data-desk="/g) ?? []).length;
  const seated = (html: string) =>
    (html.match(/<div class="agent"[^>]*data-pose="seated[^"]*"/g) ?? []).length;

  it("draws 8 desks for 4 sessions and 3 subagents, and every subagent sits at a work desk", () => {
    const html = render([...parents(4), ...kids(3)], seatsOf(4), null, undefined, settled);
    expect(deskCount(html)).toBe(8);
    expect(seated(html)).toBe(7);
    expect(html).not.toContain("data-queue-more");
  });

  it("keeps today's four desks when the subagents still fit the free desks", () => {
    const html = render([...parents(2), ...kids(2)], seatsOf(2), null, undefined, settled);
    expect(deskCount(html)).toBe(4);
  });

  it("falls back to standing slots and the door queue beyond the cap", () => {
    const html = render([...parents(4), ...kids(30)], seatsOf(4), null, undefined, settled);
    expect(deskCount(html)).toBe(DESK_CAP);
    // 20 free desks seat 20 subagents; the other 10 stand or queue, so they are not seated.
    expect(seated(html)).toBe(4 + (DESK_CAP - 4));
    expect(html.match(/data-agent="/g)?.length).toBeGreaterThan(24);
  });

  it("draws no pop-in on the first render", () => {
    const html = render([...parents(4), ...kids(3)], seatsOf(4), null, undefined, settled);
    expect(html).not.toContain("desk-pop");
  });
});

describe("DeskLayer pop-in", () => {
  const layout = layoutOffice(8, { width: 1200, height: 800 });
  const html = (fresh: number[]) =>
    renderToStaticMarkup(
      <DeskLayer
        layout={layout}
        geo={geometryFor(layout)}
        occupant={new Map()}
        worker={new Map()}
        paper={new Map()}
        fresh={new Set(fresh)}
      />,
    );
  const popped = (h: string) =>
    [...h.matchAll(/<div[^>]*class="desk-pop"[^>]*data-desk="(\d+)"/g)].map((m) => Number(m[1]));

  it("marks only the new desks", () => {
    expect(popped(html([4, 5, 6, 7]))).toEqual([4, 5, 6, 7]);
    expect(popped(html([6]))).toEqual([6]);
  });
  it("marks none when nothing is new", () => {
    expect(html([])).not.toContain("desk-pop");
  });
});

describe("desk pop-in css", () => {
  // Whole rules and at-rule blocks, with each selector list compared as a set of whole selectors.
  const rulesIn = (text: string) =>
    [...text.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: m[1].split(",").map((x) => x.trim()),
      body: m[2],
    }));
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  const only = (list: { selectors: string[]; body: string }[], sel: string) =>
    list.filter((r) => r.selectors.length === 1 && r.selectors[0] === sel);

  it("fades and drops 8px over --dur-base with --ease, and never scales", () => {
    const rule = only(rulesIn(css.slice(0, css.indexOf("@media"))), ".desk-pop");
    expect(rule).toHaveLength(1);
    expect(rule[0].body).toMatch(/animation:\s*desk-pop var\(--dur-base\) var\(--ease\) both/);
    const frames = css.match(/@keyframes desk-pop\s*{([\s\S]*?\n})/)?.[1] ?? "";
    expect(frames).toMatch(/opacity:\s*0/);
    expect(frames).toMatch(/transform:\s*translateY\(-8px\)/);
    expect(frames).not.toMatch(/scale/);
  });
  it("is off under reduced motion", () => {
    const rule = only(rulesIn(reduced), ".desk-pop");
    expect(rule).toHaveLength(1);
    expect(rule[0].body).toMatch(/animation:\s*none/);
  });
});

describe("Scene fit (eng D2/E5, design D7)", () => {
  // Strict parse: comments stripped, brace-matched blocks, each selector list split whole.
  type Rule = { selectors: string[]; body: string; media: string | null };
  const parse = (text: string, media: string | null = null): Rule[] => {
    const out: Rule[] = [];
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      let depth = 1;
      let j = open + 1;
      while (depth > 0) depth += text[j++] === "{" ? 1 : text[j - 1] === "}" ? -1 : 0;
      const head = text.slice(i, open).trim();
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith("@media")) out.push(...parse(body, head));
      else out.push({ selectors: head.split(",").map((x) => x.trim()), body, media });
      i = j;
    }
    return out;
  };
  const rules = parse(css.replace(/\/\*[\s\S]*?\*\//g, ""));
  const find = (sel: string, media: string | null = null) =>
    rules.filter((r) => r.media === media && r.selectors.length === 1 && r.selectors[0] === sel);
  const REDUCED = "@media (prefers-reduced-motion: reduce)";

  it("eases the scaled layer by its own transform only, 240ms var(--dur-base) with var(--ease)", () => {
    const [r, ...rest] = find(".scene-scaled");
    expect(rest).toHaveLength(0);
    expect(r.body).toMatch(/transition:\s*transform var\(--dur-base\) var\(--ease\)\s*;/);
    // No custom property is animated on the layer that holds the room's ~28k elements.
    expect(r.body).not.toMatch(/transition:\s*--|,\s*--/);
    expect(r.body).not.toMatch(/\d+m?s/);
    for (const rule of rules.filter((x) => x.selectors.includes(".scene-scaled")))
      expect(rule.body).not.toMatch(/@property|--fit/);
  });

  it("eases the overlay's fit vars with the same duration and easing", () => {
    const [r, ...rest] = find(".scene-overlay");
    expect(rest).toHaveLength(0);
    for (const v of ["--fit-s", "--fit-x", "--fit-y"])
      expect(r.body).toMatch(new RegExp(`${v} var\\(--dur-base\\) var\\(--ease\\)`));
    expect(r.body).not.toMatch(/\d+m?s\b/);
  });

  it("registers the fit vars, inheriting, so only the overlay's few children restyle", () => {
    for (const [v, syntax, initial] of [
      ["--fit-s", '"<number>"', "1"],
      ["--fit-x", '"<length>"', "0px"],
      ["--fit-y", '"<length>"', "0px"],
    ]) {
      const hit = rules.filter(
        (r) => r.selectors.length === 1 && r.selectors[0] === `@property ${v}`,
      );
      expect(hit, v).toHaveLength(1);
      expect(hit[0].body).toMatch(new RegExp(`syntax:\\s*${syntax}\\s*;`));
      expect(hit[0].body).toMatch(/inherits:\s*true\s*;/);
      expect(hit[0].body).toMatch(new RegExp(`initial-value:\\s*${initial}\\s*;`));
    }
  });

  it("turns both transitions off under reduced motion", () => {
    const hit = rules.filter(
      (r) =>
        r.media === REDUCED &&
        r.selectors.includes(".scene-scaled") &&
        r.selectors.includes(".scene-overlay"),
    );
    expect(hit).toHaveLength(1);
    expect(hit[0].body).toMatch(/transition:\s*none\s*;/);
  });

  it("leaves .scene a stable full-width box (no centering margin)", () => {
    const [r] = find(".scene");
    expect(r.body).toMatch(/width:\s*100%/);
    expect(r.body).not.toMatch(/margin/);
  });

  const view = { width: 1200, height: 800 };
  const html = render([agent("s1", null), waving("s2", 0)], { s1: 0, s2: 1 }, null, view);
  const fit = layoutOffice(4, view).fit;

  it("sets the fit vars on the overlay container and the translate+scale transform on the layer", () => {
    expect(html).toContain(
      `class="scene-overlay" style="--fit-s:${fit.scale};--fit-x:${fit.x}px;--fit-y:${fit.y}px"`,
    );
    expect(html).toContain(`transform:translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`);
    // The scene box is only as tall as the room; its width and centering live in the fit.
    expect(/data-testid="scene"[^>]*style="([^"]*)"/.exec(html)![1]).toMatch(
      new RegExp(`^height:${layoutOffice(4, view).scrollHeight}px(;|$)`),
    );
  });

  it("declares the art tokens on the scene root, so the clock hands and screen stripes resolve", () => {
    const style = /data-testid="scene"[^>]*style="([^"]*)"/.exec(html)![1];
    for (const token of ["--screen", "--outline"])
      expect(style).toContain(`${token}:${ART[token as "--screen" | "--outline"]}`);
  });

  it("positions hits and tags with calc() in the fit vars, never bare px", () => {
    const style = (cls: string) =>
      [...html.matchAll(new RegExp(`class="${cls}"[^>]*style="([^"]*)"`, "g"))].map((m) => m[1]);
    for (const cls of ["hit", "tag"]) {
      const all = style(cls);
      expect(all).toHaveLength(2);
      for (const st of all) {
        expect(st).toMatch(/left:calc\(var\(--fit-s\) \* -?[\d.e-]+px \+ var\(--fit-x\)\)/);
        expect(st).toMatch(/top:calc\(var\(--fit-s\) \* -?[\d.e-]+px \+ var\(--fit-y\)/);
      }
    }
  });

  it("draws the ring at 2 screen px via a JS stroke width, with no inherited --scale", () => {
    // A viewport whose layout scale is strictly between 0.5 and 1, so a hard-coded 2 or `2 * scale` fails.
    const shrunk = { width: 900, height: 800 };
    const { scale } = layoutOffice(4, shrunk);
    expect(scale).toBeGreaterThan(0.5);
    expect(scale).toBeLessThan(1);
    const small = render([agent("s1", null), waving("s2", 0)], { s1: 0, s2: 1 }, null, shrunk);
    const ring = /data-ring="[^"]*"[\s\S]*?<ellipse[^>]*style="([^"]*)"/.exec(small)![1];
    expect(ring).toBe(`stroke-width:${2 / scale}`);
    const layer = /class="scene-scaled" style="([^"]*)"/.exec(html)![1];
    expect(layer).not.toContain("--scale");
    expect(html).not.toContain("var(--scale)");
  });

  it("starts with no fit transition state: the layer and overlay carry no transition inline", () => {
    expect(html).not.toMatch(/transition/);
  });
});

describe("Scene element budget (eng D14)", () => {
  const CEIL_12 = { svg: 45, elements: 20_900 };
  const CEIL_24 = { svg: 69, elements: 31_100 };
  // Measured with renderToStaticMarkup, working parents at desks 0..n-1 and no subagents:
  // 12 agents 43 svg / 19070 elements; 24 agents 67 svg / 28302 elements (the largest window scene of
  // the six; the scene is pinned with the dev override, so the numbers do not depend on the time zone).
  // The svg ceilings are measured + 2; the elements ceilings keep their earlier headroom. The svgs
  // added since 37 / 61 are the 2 contact shadows, the bookshelf, its shadow and the two pictures.
  const count = (html: string) => ({
    svg: (html.match(/<svg\b/g) ?? []).length,
    elements: (html.match(/<[a-zA-Z][^>]*>/g) ?? []).length,
  });
  afterEach(() => setSceneOverride(null));
  const room = (n: number, scene: string) => {
    setSceneOverride(scene);
    return count(
      render(
        Array.from({ length: n }, (_, i) => agent(`s${i}`, null)),
        Object.fromEntries(Array.from({ length: n }, (_, i) => [`s${i}`, i])),
        null,
        undefined,
        () => 10 * 60_000,
      ),
    );
  };
  const biggest = (n: number) => {
    const all = WINDOW_SCENE_IDS.map((id) => room(n, id));
    return {
      svg: Math.max(...all.map((c) => c.svg)),
      elements: Math.max(...all.map((c) => c.elements)),
    };
  };

  it("12 and 24 seated agents stay under their ceilings, in every window scene", () => {
    const a = biggest(12);
    const b = biggest(24);
    expect(a.svg).toBeLessThanOrEqual(CEIL_12.svg);
    expect(a.elements).toBeLessThanOrEqual(CEIL_12.elements);
    expect(b.svg).toBeLessThanOrEqual(CEIL_24.svg);
    expect(b.elements).toBeLessThanOrEqual(CEIL_24.elements);
  });

  it("1 parent and 23 subagents, all seated with devices, stay under their own ceiling", () => {
    // Measured: 84 svg, 28539 elements (largest scene; each device adds about 10 elements and 1 svg, so the svg
    // count passes CEIL_24's 65). Ceiling is +10 percent.
    const sizes = WINDOW_SCENE_IDS.map((id) => {
      setSceneOverride(id);
      const html = render(
        [
          agent("s0", null),
          ...Array.from({ length: 23 }, (_, i) => agent("s0", `k${i}`, { arrivedAt: i + 1 })),
        ],
        { s0: 0 },
        null,
        undefined,
        () => 10 * 60_000,
      );
      expect((html.match(/data-device=/g) ?? []).length).toBe(23);
      return count(html);
    });
    for (const c of sizes) {
      expect(c.svg).toBeLessThanOrEqual(90);
      expect(c.elements).toBeLessThanOrEqual(31_350);
    }
  });
});

describe("DeskLayer devices", () => {
  const layout = layoutOffice(8, { width: 1200, height: 800 });
  const html = (occupant: [number, Agent][], worker: [number, Agent][]) =>
    renderToStaticMarkup(
      <DeskLayer
        layout={layout}
        geo={geometryFor(layout)}
        occupant={new Map(occupant)}
        worker={new Map(worker)}
        paper={new Map()}
        fresh={new Set()}
      />,
    );
  const desk = (h: string, i: number) =>
    new RegExp(`<div[^>]*data-desk="${i}"[^>]*>.*?(?=<div[^>]*data-desk=|$)`, "s").exec(h)![0];
  const sub = (id: string, state: Agent["state"] = "working") =>
    agent("s1", id, { state, parentAgentId: null });

  it("gives a subagent at a work desk its device, a live monitor and the lit variant", () => {
    const a = sub("a1");
    const h = desk(html([], [[2, a]]), 2);
    const device = deviceFor(a.key);
    expect(h).toContain(`data-device="${device}"`);
    expect(h).toContain('data-screen="live"');
    expect(h).toContain("data-screen-overlay");
    expect(h).toContain(`data-prop="${device.toUpperCase()}_LIT"`);
  });

  it("makes a subagent's monitor follow its state like a parent's", () => {
    const waiting = desk(html([], [[2, sub("a1", "waiting-on-subagents")]]), 2);
    expect(waiting).toContain('data-screen="still"');
    expect(waiting).toContain("data-screen-overlay");
    const idle = desk(html([], [[2, sub("a1", "idle")]]), 2);
    expect(idle).toContain('data-screen="off"');
    expect(idle).not.toContain("data-screen-overlay");
  });

  it("follows the subagent's state: working lit, waiting half, other dark", () => {
    const variant = (state: Agent["state"]) => {
      const a = sub("a1", state);
      return desk(html([], [[0, a]]), 0)
        .match(/data-prop="(\w+)"/g)
        ?.pop();
    };
    const d = deviceFor(sub("a1").key).toUpperCase();
    expect(variant("working")).toBe(`data-prop="${d}_LIT"`);
    expect(variant("waiting-on-subagents")).toBe(`data-prop="${d}_HALF"`);
    expect(variant("idle")).toBe(`data-prop="${d}_DARK"`);
  });

  it("keeps parents on the monitor with no device, and empty desks bare", () => {
    const p = agent("s9", null);
    const h = html([[1, p]], []);
    expect(desk(h, 1)).toContain('data-screen="live"');
    expect(desk(h, 1)).toContain("data-screen-overlay");
    expect(h).not.toContain("data-device");
    expect(desk(h, 0)).toContain('data-screen="off"');
  });

  it("is stable across re-renders", () => {
    const a = sub("a1");
    expect(html([], [[3, a]])).toBe(html([], [[3, a]]));
  });
});

describe("Scene windows", () => {
  afterEach(() => setSceneOverride(null));
  const local = (h: number, mi = 0, s = 0) => new Date(2026, 2, 9, h, mi, s).getTime();
  const renderAt = (now: number, desks = 1) => {
    const agents = Array.from({ length: desks }, (_, i) => agent(`s${i}`, null));
    const office: OfficeState = {
      agents: Object.fromEntries(agents.map((a) => [a.key, a])),
      episodeSeq: 0,
      returned: {},
    };
    return renderToStaticMarkup(
      <Scene
        office={office}
        seats={Object.fromEntries(agents.map((a, i) => [a.sessionId, i]))}
        projects={{ p: "/work/atlas" }}
        viewport={{ width: 1200, height: 800 }}
        now={now}
        clock={() => 10 * 60_000}
      />,
    );
  };
  const scenes = (html: string, start = 'data-window="[^"]*"') =>
    [...html.matchAll(new RegExp(`<[a-z]+ [^>]*${start}[^>]*>`, "g"))].map(
      (m) => /data-window-scene="([^"]*)"/.exec(m[0])![1],
    );

  it("hangs one window at one row and two at two rows, one svg each", () => {
    expect(renderAt(local(12)).match(/<svg[^>]*data-window="/g)).toHaveLength(1);
    expect(renderAt(local(12), 5).match(/<svg[^>]*data-window="/g)).toHaveLength(2);
    expect(renderAt(local(12), 24).match(/<svg[^>]*data-window="/g)).toHaveLength(2);
  });

  it("exposes the hour's scene on every window and every floor light patch", () => {
    for (let h = 0; h < 24; h++) {
      const want = sceneFor("2026-03-09", h);
      const html = renderAt(local(h, 20), 5);
      expect(scenes(html), `h${h} windows`).toEqual([want, want]);
      expect(scenes(html, 'data-part="floor-light"'), `h${h} patches`).toEqual([want, want]);
    }
  });

  it("changes scene only at the hour boundary", () => {
    for (let h = 0; h < 24; h++) {
      const first = scenes(renderAt(local(h, 0, 0)));
      for (const [mi, s] of [
        [0, 1],
        [30, 0],
        [59, 59],
      ])
        expect(scenes(renderAt(local(h, mi, s))), `${h}:${mi}:${s}`).toEqual(first);
      expect(first).toEqual(Array(1).fill(sceneFor("2026-03-09", h)));
    }
  });

  it("follows a dev override, and an unknown override reads as dusk", () => {
    setSceneOverride("snow");
    expect(scenes(renderAt(local(12)))).toEqual(["snow"]);
    setSceneOverride("bogus");
    expect(scenes(renderAt(local(12)))).toEqual(["dusk"]);
  });

  it("sets the glass vars on the window element only, never on the room shell or a desk", () => {
    const html = renderAt(local(12), 5);
    const windows = [...html.matchAll(/<svg[^>]*data-window="[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(windows).toHaveLength(2);
    const sc = windowScene(sceneFor("2026-03-09", 12));
    for (const w of windows)
      for (const token of Object.values(sc.legend)) expect(w).toContain(`${token}:${GLASS[token]}`);
    const root = (part: string) => new RegExp(`<svg[^>]*${part}[^>]*>`).exec(html)![0];
    expect(root('data-part="room-shell"')).not.toContain("--glass");
    expect(root('data-prop="DOOR"')).not.toContain("--glass");
    expect(root('data-prop="CLOCK"')).not.toContain("--glass");
    // The only place --glass appears in the markup is the window roots and their fills.
    const outside = html.replace(/<svg[^>]*data-window="[^"]*"[^>]*>.*?<\/svg>/gs, "");
    expect(outside).not.toContain("--glass");
  });

  it("tints each floor patch with the scene's horizon glass, low opacity, above the floor tiles", () => {
    const html = renderAt(local(20), 5);
    const sc = windowScene(sceneFor("2026-03-09", 20));
    const patches = [...html.matchAll(/<g[^>]*data-part="floor-light"[^>]*>(.*?)<\/g>/gs)];
    expect(patches).toHaveLength(2);
    for (const [, inner] of patches) {
      expect(inner).toContain(`fill="${GLASS[sc.light]}"`);
      expect(inner).toMatch(/opacity="0\.\d+"/);
    }
    expect(html.indexOf('data-part="floor-light"')).toBeGreaterThan(
      html.indexOf('data-part="room-shell"'),
    );
    expect(html.indexOf('data-part="floor-light"')).toBeLessThan(html.indexOf("data-desk="));
  });

  it("draws weather and clouds only for scenes that have them, clipped to the open panes", () => {
    for (const id of WINDOW_SCENE_IDS) {
      setSceneOverride(id);
      const html = renderAt(local(12));
      const sc = windowScene(id);
      expect(/class="win-rain"/.test(html), `${id} rain`).toBe(sc.weather === "rain");
      expect(/class="win-snow"/.test(html), `${id} snow`).toBe(sc.weather === "snow");
      expect(/class="win-cloud-(left|right)"/.test(html), `${id} cloud`).toBe(sc.cloud !== null);
      if (sc.weather || sc.cloud) expect(html).toContain("clip-path=");
    }
  });
});

describe("window css", () => {
  type Rule = { selectors: string[]; body: string; media: string | null };
  const parse = (text: string, media: string | null = null): Rule[] => {
    const out: Rule[] = [];
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      let depth = 1;
      let j = open + 1;
      while (depth > 0) depth += text[j++] === "{" ? 1 : text[j - 1] === "}" ? -1 : 0;
      const head = text.slice(i, open).trim();
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith("@media")) out.push(...parse(body, head));
      else out.push({ selectors: head.split(",").map((x) => x.trim()), body, media });
      i = j;
    }
    return out;
  };
  const rules = parse(css.replace(/\/\*[\s\S]*?\*\//g, ""));
  const REDUCED = "@media (prefers-reduced-motion: reduce)";
  const loops = {
    ".win-rain": ["win-rain", RAIN_PERIOD, "translateY", 6],
    ".win-snow": ["win-snow", SNOW_PERIOD, "translateY", 8],
    ".win-cloud-right": ["win-cloud-right", CLOUD_PERIOD, "translate", CLOUD_PERIOD / 2],
    ".win-cloud-left": ["win-cloud-left", CLOUD_PERIOD, "translate", CLOUD_PERIOD / 2],
  } as const;

  it("declares each loop in one plain rule, never inside a media block", () => {
    for (const [sel, [name]] of Object.entries(loops)) {
      const own = rules.filter((r) => r.selectors.includes(sel));
      const live = own.filter((r) => /animation:\s*(?!none)\S/.test(r.body));
      expect(live, sel).toHaveLength(1);
      expect(live[0].media, sel).toBeNull();
      expect(live[0].selectors, sel).toEqual([sel]);
      expect(live[0].body, sel).toMatch(
        new RegExp(`animation:\\s*${name} [\\d.]+s steps\\(\\d+\\) infinite`),
      );
    }
  });

  it("steps whole 2 px cells: period over step count is 2 user units", () => {
    for (const [sel, [name, period, fn, steps]] of Object.entries(loops)) {
      const live = rules.find((r) => r.selectors.includes(sel) && r.media === null)!;
      expect(Number(/steps\((\d+)\)/.exec(live.body)![1]), sel).toBe(steps);
      expect(period / steps, sel).toBe(2);
      const frames = css.match(new RegExp(`@keyframes ${name}\\s*{([\\s\\S]*?\\n})`))?.[1] ?? "";
      expect(frames, sel).toContain(`${fn}(`);
      expect(frames, sel).toMatch(/\d+px/);
      expect(frames, sel).not.toMatch(/\d\.\d+px/);
    }
    const num = (name: string) =>
      [
        ...(css.match(new RegExp(`@keyframes ${name}\\s*{([\\s\\S]*?\\n})`))?.[1] ?? "").matchAll(
          /(-?\d+)px/g,
        ),
      ].map((m) => Number(m[1]));
    expect(num("win-rain")).toEqual([RAIN_PERIOD]);
    expect(num("win-snow")).toEqual([SNOW_PERIOD]);
    expect(num("win-cloud-right")).toEqual([CLOUD_PERIOD, CLOUD_PERIOD / 2]);
    expect(num("win-cloud-left")).toEqual([CLOUD_PERIOD, -CLOUD_PERIOD / 2]);
  });

  it("switches every loop off under reduced motion, and drops rain and snow", () => {
    for (const sel of Object.keys(loops)) {
      const off = rules.filter((r) => r.media === REDUCED && r.selectors.includes(sel));
      expect(off.length, sel).toBeGreaterThan(0);
      expect(
        off.some((r) => /animation:\s*none/.test(r.body)),
        sel,
      ).toBe(true);
    }
    for (const sel of [".win-rain", ".win-snow"])
      expect(
        rules.some(
          (r) => r.media === REDUCED && r.selectors.includes(sel) && /display:\s*none/.test(r.body),
        ),
        sel,
      ).toBe(true);
  });

  it("default timers are called unbound: a browser's clearTimeout throws as an object method", () => {
    const seen: unknown[] = [];
    vi.stubGlobal("setTimeout", function (this: unknown) {
      seen.push(this);
      return 1;
    });
    vi.stubGlobal("clearTimeout", function (this: unknown) {
      seen.push(this);
    });
    try {
      const el = fakeHit();
      const p = pulser(() => el, 1200);
      p.pulse("k");
      p.pulse("k");
      p.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const t of seen) expect(t).toBeUndefined();
  });
});
