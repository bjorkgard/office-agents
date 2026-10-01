/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { join, sep } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { tokenRows } from "./design-md.ts";

// Vitest turns css ?raw imports into empty strings, so stylesheets are read from disk.
// This file is typed by tsconfig.node.json so node globals never reach browser code.
const here = import.meta.dirname;
const sheets = readdirSync(here, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".css") && !file.split(sep).includes("node_modules"))
  .map((file): [string, string] => [`src/${file}`, readFileSync(join(here, file), "utf8")]);
const indexCss = readFileSync(join(here, "index.css"), "utf8");
const design = readFileSync(join(here, "../DESIGN.md"), "utf8");
const ROOT_BLOCK = /:root\s*\{[^}]*\}/;
// Declaration bodies only (text between braces), so #id selectors cannot match.
const DECL_BODY = /\{[^{}]*\}/g;
const HEX = /#[0-9a-f]{3,8}\b/gi;

const cssTokens = (source: string) => {
  const map = new Map<string, string>();
  for (const m of source
    .match(ROOT_BLOCK)![0]
    .matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)) {
    map.set(m[1], m[2].toLowerCase());
  }
  return map;
};

const motionStart = design.indexOf("## Motion");
assert(motionStart >= 0, 'DESIGN.md heading "## Motion"');
const motion = design.slice(motionStart);

const colorStart = design.indexOf("## Color tokens");
const colorSection = design.slice(colorStart, design.indexOf("\n## ", colorStart + 1));

describe("design tokens", () => {
  it("matches the DESIGN.md color table in index.css :root", () => {
    expect(colorStart, 'DESIGN.md heading "## Color tokens"').toBeGreaterThanOrEqual(0);
    const expected = tokenRows(colorSection);
    expect(expected.size, "DESIGN.md color rows parsed").toBeGreaterThanOrEqual(7);
    const actual = cssTokens(indexCss);
    for (const [token, value] of expected) {
      expect(actual.get(token), `${token} in src/index.css`).toBe(value.toLowerCase());
    }
  });

  it("matches the DESIGN.md easing and durations in index.css :root", () => {
    const root = indexCss.match(ROOT_BLOCK)![0];
    const ease = /--ease:\s*(cubic-bezier\([^)]*\))/.exec(motion);
    expect(ease, "--ease in DESIGN.md").not.toBeNull();
    expect(root, "--ease").toContain(`--ease: ${ease![1]};`);
    for (const name of ["dur-fast", "dur-base", "dur-slow"]) {
      const ms = new RegExp(`--${name}:\\s*(\\d+ms)`).exec(motion);
      expect(ms, `--${name} in DESIGN.md`).not.toBeNull();
      expect(root, `--${name}`).toContain(`--${name}: ${ms![1]};`);
    }
  });

  it("keeps hex colors inside the first :root token block", () => {
    expect(sheets.length, "css files found").toBeGreaterThan(0);
    for (const [file, source] of sheets) {
      const stray = (source.replace(ROOT_BLOCK, "").match(DECL_BODY) ?? []).flatMap(
        (body) => body.match(HEX) ?? [],
      );
      expect(stray, `hex outside :root in ${file}`).toEqual([]);
    }
  });

  it("collapses fast and base durations under reduced motion, keeps slow", () => {
    const block = /prefers-reduced-motion:\s*reduce\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(indexCss);
    expect(block, "reduced-motion block in src/index.css").not.toBeNull();
    const body = block![1];
    expect(body, "--dur-fast").toMatch(/--dur-fast:\s*0ms/);
    expect(body, "--dur-base").toMatch(/--dur-base:\s*0ms/);
    const slow = /--dur-slow:\s*(\d+ms)/.exec(motion);
    expect(slow, "--dur-slow in DESIGN.md").not.toBeNull();
    expect(body, "--dur-slow").toContain(`--dur-slow: ${slow![1]};`);
  });

  // Value: protects=DESIGN.md spacing, font, size, line-height, radius match index.css; fails_when=either side drifts; why_new=only colors and motion were compared; seam=none
  it("matches the DESIGN.md spacing, type and radius values in index.css :root", () => {
    const root = indexCss.match(ROOT_BLOCK)![0];
    const spacing = /Spacing scale in 4px steps: ([^.]*)\./.exec(design);
    expect(spacing, "spacing scale in DESIGN.md").not.toBeNull();
    const steps = spacing![1].split(",").map((n) => Number(n.trim()));
    const actual = [...root.matchAll(/--space-\d+:\s*(\d+)px;/g)].map((m) => Number(m[1]));
    expect(actual, "--space-* in src/index.css").toEqual(steps);

    const stack = /- Stack: `([^`]*)`/.exec(design);
    expect(stack, "font stack in DESIGN.md").not.toBeNull();
    expect(root, "--font").toContain(`--font: ${stack![1]};`);

    const tag = /Name tags and bubbles: (\d+px)/.exec(design);
    const bar = /Top bar: (\d+px)/.exec(design);
    const line = /Line height (\d\.\d+)/.exec(design);
    const radii = /Radius: (\d+px) for chips, (\d+px) for bubbles/.exec(design);
    for (const [name, m] of [
      ["tag", tag],
      ["bar", bar],
      ["line", line],
      ["radii", radii],
    ] as const) {
      expect(m, `${name} in DESIGN.md`).not.toBeNull();
    }
    expect(root, "--size-tag").toContain(`--size-tag: ${tag![1]};`);
    expect(root, "--size-bar").toContain(`--size-bar: ${bar![1]};`);
    expect(root, "--line").toContain(`--line: ${line![1]};`);
    expect(root, "--radius-sm").toContain(`--radius-sm: ${radii![1]};`);
    expect(root, "--radius-md").toContain(`--radius-md: ${radii![2]};`);
  });
});
