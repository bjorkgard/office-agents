import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

const root = createRoot(document.getElementById("root")!);

// Dev-only style sheet at ?art (any path); the dynamic import keeps it out of production.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("art")) {
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
} else if (import.meta.env.DEV && new URLSearchParams(location.search).has("demo")) {
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
