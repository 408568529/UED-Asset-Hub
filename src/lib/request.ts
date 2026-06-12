import { API_BASE_URL } from "@/config/api";

type RequestOptions = RequestInit & {
  query?: Record<string, string | number | boolean | undefined>;
};

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(path, API_BASE_URL || "http://localhost");

  Object.entries(options.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });

  const response = await fetch(API_BASE_URL ? url.toString() : url.pathname + url.search, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}
