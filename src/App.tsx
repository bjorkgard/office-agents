import { type ReactNode, useEffect, useState } from "react";
import { ErrorBoundary } from "./office/ErrorBoundary";
import type { FeedDeps } from "./office/feed-client";
import type { Viewport } from "./office/iso";
import {
  displayErrorShown,
  isTooSmall,
  nextSceneKey,
  TOO_SMALL_NOTICE,
  viewportOf,
  findAgentWrapper,
  pulser,
} from "./office/app-logic";
import { Scene } from "./office/Scene";
import { waitingCount } from "./office/selectors";
import { TopBar } from "./office/TopBar";
import { useDocumentChrome } from "./office/useDocumentChrome";
import { useOffice } from "./office/useOffice";

/** Coarse clock for bubble wait times; minute precision needs no faster tick. */
const NOW_TICK_MS = 15 * 1000;
const PULSE_MS = 1200;

type BoundaryProps = { children: ReactNode; onError: () => void };

/** Reports a caught render error to the parent so the top bar can say "Display error" (D16). */
class ReportingBoundary extends ErrorBoundary {
  declare props: BoundaryProps;
  componentDidCatch(error: unknown) {
    super.componentDidCatch(error);
    this.props.onError();
  }
}

function readViewport(): Viewport {
  return viewportOf(document.documentElement);
}

function App({ deps }: { deps?: FeedDeps }) {
  const state = useOffice(deps);
  useDocumentChrome(waitingCount(state.office));

  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const onResize = () => {
      const next = readViewport();
      setViewport((v) => (v.width === next.width && v.height === next.height ? v : next));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const tooSmall = isTooSmall(viewport);
  // A new key remounts the boundary when the room returns from the narrow notice; the flag is
  // tied to the key that caught, so it clears with the remount.
  const [sceneKey, setSceneKey] = useState({ key: 0, narrow: tooSmall });
  if (sceneKey.narrow !== tooSmall)
    setSceneKey({ key: nextSceneKey(sceneKey.key, sceneKey.narrow, tooSmall), narrow: tooSmall });
  const [caughtKey, setCaughtKey] = useState<number | null>(null);
  const onBoundaryError = () => setCaughtKey(sceneKey.key);
  const displayError = displayErrorShown(caughtKey, sceneKey.key);

  // Chip click: focus the character and flag it briefly (index.css draws the pulse).
  const [pulses] = useState(() =>
    pulser((key) => {
      const wrapper = findAgentWrapper(document.querySelectorAll<HTMLElement>("[data-agent]"), key);
      // The hit button is the character's real box; the wrapper has none.
      return wrapper?.querySelector<HTMLElement>("button.hit");
    }, PULSE_MS),
  );
  useEffect(() => pulses.dispose, [pulses]);
  const pulse = pulses.pulse;

  return (
    <>
      <TopBar state={state} displayError={displayError} narrow={tooSmall} onPulse={pulse} />
      <main aria-label="Office">
        {tooSmall ? (
          <p className="wider-notice" role="status">
            {TOO_SMALL_NOTICE}
          </p>
        ) : (
          <ReportingBoundary key={sceneKey.key} onError={onBoundaryError}>
            <Scene
              office={state.office}
              seats={state.seats}
              projects={state.projects}
              viewport={viewport}
              now={now}
              failure={state.failure}
            />
          </ReportingBoundary>
        )}
      </main>
    </>
  );
}

export default App;
