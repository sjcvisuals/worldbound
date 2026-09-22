const KEY = "worldbound.setup.complete";

export function hasCompletedSetup(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markSetupComplete() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* private mode */
  }
}

export function wantsForcedSetup(): boolean {
  try {
    return new URLSearchParams(window.location.search).has("setup");
  } catch {
    return false;
  }
}
