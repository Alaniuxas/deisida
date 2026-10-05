const NOTICE_KEY = "eile-flash-notice";
const VARIANT_KEY = "eile-flash-notice-variant";

export type EileFlashVariant = "success" | "error";

export function setEileFlashNotice(
  message: string,
  variant: EileFlashVariant = "success",
): void {
  try {
    sessionStorage.setItem(NOTICE_KEY, message);
    sessionStorage.setItem(VARIANT_KEY, variant);
  } catch {
    // Private mode / disabled storage — caller may fall back to URL.
  }
}

export function readEileFlashNotice(): {
  message: string;
  variant: EileFlashVariant;
} | null {
  try {
    const message = sessionStorage.getItem(NOTICE_KEY);
    if (!message) return null;
    const variant = sessionStorage.getItem(VARIANT_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    sessionStorage.removeItem(VARIANT_KEY);
    return {
      message,
      variant: variant === "error" ? "error" : "success",
    };
  } catch {
    return null;
  }
}

/** Strip flash query params without triggering Next.js navigation. */
export function stripEileFlashSearchParams(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const keys = [
    "notice",
    "error",
    "confirmed",
    "jobs",
    "rebalanced",
    "accepted",
    "reopened",
    "moved",
    "enqueued",
  ];
  let changed = false;
  for (const key of keys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}
