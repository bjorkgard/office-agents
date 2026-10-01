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
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
