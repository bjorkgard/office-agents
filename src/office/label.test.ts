import { describe, expect, it } from "vite-plus/test";
import { identityFor, pickShirt, type ShirtChoice } from "./identity";
import { agentIdentity, projectLabel } from "./label";

describe("projectLabel", () => {
  it("takes the basename", () => {
    expect(projectLabel("/Users/dev/code/office-agents")).toBe("office-agents");
    expect(projectLabel("/Users/dev/code/office-agents/")).toBe("office-agents");
    expect(projectLabel("C:\\Users\\dev\\proj")).toBe("proj");
  });

  it("returns an empty string for an empty path", () => {
    expect(projectLabel("")).toBe("");
    expect(projectLabel("/")).toBe("");
  });

  it("bounds a 5 KB input to 24 code points plus an ellipsis", () => {
    const label = projectLabel(`/a/${"x".repeat(5 * 1024)}`);
    expect(Array.from(label)).toHaveLength(25);
    expect(label.endsWith("\u2026")).toBe(true);
    expect(projectLabel(`/a/${"y".repeat(5 * 1024)}/`).length).toBeLessThanOrEqual(26);
  });

  it("does not split a surrogate pair when truncating", () => {
    const label = projectLabel(`/a/${"\u{1F600}".repeat(40)}`);
    expect(Array.from(label)).toHaveLength(25);
    expect(label).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });

  it("strips bidi overrides and control characters", () => {
    const label = projectLabel("/a/pro\u202Eject\u2066x\u2069\u0007\u0000\n");
    expect(label).toBe("projectx");
  });

  it("strips C1 controls, including the range ends", () => {
    expect(projectLabel("/a/x\u0080y\u0085z\u009Fw")).toBe("xyzw");
  });

  it("strips the Arabic letter mark U+061C", () => {
    expect(projectLabel("/a/ab\u061Ccd")).toBe("abcd");
  });

  it("keeps markup as inert text", () => {
    const label = projectLabel("/a/<img src=x onerror=alert(1)>");
    expect(label).toContain("<img");
    expect(label.length).toBeLessThanOrEqual(25);
  });
});

describe("agentIdentity", () => {
  it("gives a main agent the session identity", () => {
    expect(agentIdentity("s1", null)).toEqual(identityFor("s1"));
  });

  it("gives a subagent a different name from its parent for every session", () => {
    for (let i = 0; i < 500; i++) {
      const s = `session-${i}`;
      expect(agentIdentity(s, "sub-1").name).not.toBe(agentIdentity(s, null).name);
    }
  });

  it("is stable for the same ids", () => {
    expect(agentIdentity("s", "a")).toEqual(agentIdentity("s", "a"));
  });
});

describe("shirt per project", () => {
  it("follows the identity.ts fixed order", () => {
    const held: ShirtChoice[] = [];
    for (const p of ["/a/one", "/a/two", "/a/three"]) held.push(pickShirt(p, held));
    expect(new Set(held.map((s) => `${s.index}${s.stripe}`)).size).toBe(3);
    expect(pickShirt("/a/one", [])).toEqual(held[0]);
  });
});
