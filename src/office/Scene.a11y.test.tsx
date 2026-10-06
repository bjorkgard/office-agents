import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { agentKey, type Agent, type OfficeState } from "./machine";
import { Scene } from "./Scene";

function agent(sessionId: string, agentId: string | null = null): Agent {
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
  };
}

function render(agents: Agent[], seats: Record<string, number>): string {
  const office: OfficeState = {
    agents: Object.fromEntries(agents.map((a) => [a.key, a])),
    episodeSeq: 0,
    returned: {},
    kinds: {},
  };
  return renderToStaticMarkup(
    <Scene
      office={office}
      seats={seats}
      projects={{ p: "/work/atlas" }}
      viewport={{ width: 1200, height: 800 }}
      now={10 * 60_000}
      failure={null}
    />,
  );
}

describe("Scene accessibility", () => {
  const html = render([agent("s1"), agent("s2")], { s1: 0, s2: 1 });

  it("gives the scene root a role so its label is exposed", () => {
    expect(html).toMatch(/<div[^>]*class="scene"[^>]*role="group"[^>]*aria-label="Office"/);
  });

  it("hides every name tag from assistive tech; the hit buttons name the agents", () => {
    const tags = html.match(/<div[^>]*class="tag"[^>]*>/g) ?? [];
    expect(tags).toHaveLength(2);
    for (const tag of tags) expect(tag).toContain('aria-hidden="true"');
    expect(html.match(/<button[^>]*class="hit"[^>]*aria-label="[^"]+"/g)).toHaveLength(2);
  });

  it("puts the queued-helper count in the parent's label, since the tag is hidden", () => {
    // More children than the room has free desks, so some queue by the door.
    const kids = Array.from({ length: 60 }, (_, i) => ({ ...agent("s1", `k${i}`), arrivedAt: i }));
    const crowded = render([agent("s1"), ...kids], { s1: 0 });
    const labels = [...crowded.matchAll(/<button[^>]*class="hit"[^>]*aria-label="([^"]+)"/g)].map(
      (m) => m[1],
    );
    const counted = labels.filter((l) => /, \d+ more helpers$/.test(l));
    expect(counted).toHaveLength(1);
    const shown = crowded.match(/data-overflow[^>]*> \+(\d+)</)?.[1];
    expect(counted[0]).toMatch(new RegExp(`, ${shown} more helpers$`));
    expect(html).not.toContain("more helper");
  });

  it("says '1 more helper' in the singular for a single queued helper", () => {
    for (let n = 1; n <= 60; n++) {
      const kids = Array.from({ length: n }, (_, i) => ({ ...agent("s1", `k${i}`), arrivedAt: i }));
      const out = render([agent("s1"), ...kids], { s1: 0 });
      if (out.match(/data-overflow[^>]*> \+(\d+)</)?.[1] !== "1") continue;
      const labels = [...out.matchAll(/<button[^>]*class="hit"[^>]*aria-label="([^"]+)"/g)].map(
        (m) => m[1],
      );
      expect(labels.filter((l) => /, 1 more helper$/.test(l))).toHaveLength(1);
      expect(out).not.toContain("1 more helpers");
      return;
    }
    throw new Error("no crowd size produced exactly one queued helper");
  });
});
