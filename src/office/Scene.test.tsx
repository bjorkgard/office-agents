import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { layoutOffice } from "./iso";
import { agentKey, type Agent, type OfficeState } from "./machine";
import { Scene } from "./Scene";
import { roomShell, wallPropRect } from "./room";
import { QUEUE_VISIBLE, TAG_H, tagWidth } from "./scene-model";

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
      now={10 * 60_000}
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
  });

  it("names each hit area with first name, project and state, waiting agents first", () => {
    const html = render([agent("s1", null), waving("s2", 0)], { s1: 0, s2: 1 });
    const labels = [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toMatch(/, atlas, waiting for you$/);
    expect(labels[1]).toMatch(/, atlas, working$/);
  });

  it("shows +N on the parent's tag for subagents queued past its two slots", () => {
    const kids = ["a", "b", "c"].map((id, i) => agent("s1", id, { arrivedAt: i }));
    const others = ["s2", "s3", "s4"].map((id) => agent(id, null));
    const html = render([agent("s1", null), ...others, ...kids], { s1: 0, s2: 1, s3: 2, s4: 3 });
    expect(html).toContain("+1");
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
    [...html.matchAll(/class="hit"[^>]*style="left:(-?[\d.]+)px/g)].map((m) => Number(m[1]));

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
    for (const name of ["CLOCK", "STEAM", "PLANT_TALL", "PLANT_BUSH"])
      expect(empty).toContain(`data-prop="${name}"`);
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

describe("Scene wall props", () => {
  const html = render([agent("s1", null)], { s1: 0 });
  const shell = roomShell(layoutOffice(1, { width: 1200, height: 800 }));

  it("draws the door, coffee station and clock without skew", () => {
    for (const name of ["DOOR", "COFFEE_STATION", "CLOCK"])
      expect(wrapperStyle(html, name)).not.toMatch(/skew|transform/);
  });

  it("puts the door and coffee station where their base meets the wall", () => {
    for (const [name, at] of [
      ["DOOR", shell.door],
      ["COFFEE_STATION", shell.coffee],
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
  const num = (s: string, p: string) => Number(new RegExp(`${p}:(-?[\\d.]+)px`).exec(s)![1]);
  const bubbles = [...html.matchAll(/data-bubble="([^"]+)"([^>]*)style="([^"]*)"/g)].map((m) => ({
    id: m[1],
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

  it("counts the rest in a +N button after every agent button", () => {
    const html = queued(QUEUE_VISIBLE + 3);
    const marker =
      /<button[^>]*data-queue-more[^>]*aria-label="([^"]+)"[^>]*>([^<]*)<\/button>/.exec(html)!;
    expect(marker[1]).toBe("and 3 more waiting");
    expect(marker[2]).toBe("+3");
    expect(html.lastIndexOf("data-queue-more")).toBeGreaterThan(html.lastIndexOf('class="hit"'));
    expect(html.match(/class="hit"/g)).toHaveLength(1 + QUEUE_VISIBLE);
  });
});
