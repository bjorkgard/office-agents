import { Component, type ReactNode } from "react";

/** D16: a render or machine failure shows "Display error" and leaves the top bar to the parent. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("office: display error", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" data-testid="display-error">
        Display error. Reload the page; details are in the browser console.
      </div>
    );
  }
}

/** Scene renders this so a machine failure (returned by useOffice as data) throws inside the boundary. */
export function ThrowFailure({ failure }: { failure: Error | null }): null {
  if (failure) throw failure;
  return null;
}
