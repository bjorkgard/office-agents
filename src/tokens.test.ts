import { describe, expect, it } from "vite-plus/test";
import notice from "../NOTICE?raw";
import indexHtml from "../index.html?raw";
import main from "./main.tsx?raw";

describe("self-hosted font", () => {
  it("imports Plex Sans 400 and 600 in src/main.tsx", () => {
    expect(main, "src/main.tsx").toContain('import "@fontsource/ibm-plex-sans/400.css"');
    expect(main, "src/main.tsx").toContain('import "@fontsource/ibm-plex-sans/600.css"');
  });

  it("ships the OFL text in NOTICE", () => {
    expect(notice, "NOTICE").toContain("SIL OPEN FONT LICENSE Version 1.1");
  });

  it("never loads fonts from Google", () => {
    expect(indexHtml, "index.html").not.toContain("fonts.googleapis.com");
    expect(main, "src/main.tsx").not.toContain("fonts.googleapis.com");
  });
});
