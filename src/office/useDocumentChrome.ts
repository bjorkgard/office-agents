import { useEffect } from "react";

/** Tab title and favicon attention dot (D6), both driven by the waiting count N. */

export const BASE_TITLE = "Agent Office";

export function titleFor(n: number): string {
  return n > 0 ? `(${n}) ${BASE_TITLE}` : BASE_TITLE;
}

const svg = (dot: boolean) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" rx="4" fill="#1d2230"/>${
    dot ? '<circle cx="23" cy="9" r="7" fill="#b388ff"/>' : ""
  }</svg>`;

/** Static dot, no blink: on when N > 0, off at 0. */
export function faviconHref(n: number): string {
  return `data:image/svg+xml,${encodeURIComponent(svg(n > 0))}`;
}

/** Guarded no-op when there is no document (test, SSR). */
export function useDocumentChrome(n: number): void {
  useEffect(() => {
    if (typeof document === "undefined" || !document.head) return;
    document.title = titleFor(n);
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/svg+xml";
    link.href = faviconHref(n);
  }, [n]);
}
