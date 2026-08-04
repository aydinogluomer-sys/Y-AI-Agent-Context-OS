const TOKEN_STORAGE_KEY = "y_os_api_token";
const nativeFetch = globalThis.fetch.bind(globalThis);

let tokenPromise: Promise<string | null> | null = null;

function isApiRequest(input: RequestInfo | URL): boolean {
  const raw = typeof input === "string" ? input : input.toString();
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function isPublicApiRequest(input: RequestInfo | URL): boolean {
  const raw = typeof input === "string" ? input : input.toString();
  const url = new URL(raw, window.location.origin);
  return (
    url.pathname === "/api/health" ||
    url.pathname === "/api/auth/dev-session"
  );
}

async function resolveApiToken(): Promise<string | null> {
  const stored = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (stored) return stored;

  const response = await nativeFetch("/api/auth/dev-session", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;

  const body = await response.json();
  const token = typeof body?.token === "string" ? body.token : null;
  if (token) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  return token;
}

if (typeof window !== "undefined" && !(window as any).__Y_OS_AUTH_FETCH_INSTALLED__) {
  (window as any).__Y_OS_AUTH_FETCH_INSTALLED__ = true;

  globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (!isApiRequest(input) || isPublicApiRequest(input)) {
      return nativeFetch(input, init);
    }

    const headers = new Headers(init.headers);
    if (!headers.has("Authorization")) {
      tokenPromise ||= resolveApiToken();
      const token = await tokenPromise;
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    return nativeFetch(input, { ...init, headers });
  };
}

