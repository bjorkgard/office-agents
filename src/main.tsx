import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { parseHourParam, setHourOverride, setSceneOverride, setSeedOverride } from "./office/decor";

const root = createRoot(document.getElementById("root")!);
const params = new URLSearchParams(location.search);

// Dev-only window scene at ?scene=<id> (dusk, night, rain, snow, overcast, afternoon; any other id reads as dusk).
if (import.meta.env.DEV) {
  const scene = params.get("scene");
  if (scene !== null) setSceneOverride(scene);
  // ?hour=<0-23> forces the hour the window scene is chosen for; ?seed=<text> salts its variant.
  const hour = parseHourParam(params.get("hour"));
  if (hour !== null) setHourOverride(hour);
  const seed = params.get("seed");
  if (seed !== null) setSeedOverride(seed);
}

// Dev-only style sheet at ?art (any path); the dynamic import keeps it out of production.
if (import.meta.env.DEV && params.has("art")) {
  void import("./office/ArtSheet.tsx")
    .then(({ default: ArtSheet }) =>
      root.render(
        <StrictMode>
          <ArtSheet />
        </StrictMode>,
      ),
    )
    .catch((error) => {
      console.error(error);
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
    });
} else if (import.meta.env.DEV && params.has("demo")) {
  // Dev-only demo feed at ?demo; the dynamic import keeps the module and its marker out of production.
  void import("./office/demo")
    .then(({ demoScenario: scenarioOf, createDemoDeps }) => {
      const scenario = scenarioOf(location.search);
      const deps = scenario
        ? createDemoDeps(
            {
              setTimeout: (f, ms) => setTimeout(f, ms),
              clearTimeout: (h) => clearTimeout(h as number),
              now: Date.now,
            },
            scenario,
          )
        : undefined;
      root.render(
        <StrictMode>
          <App deps={deps} />
        </StrictMode>,
      );
    })
    .catch((error) => {
      console.error(error);
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
    });
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
