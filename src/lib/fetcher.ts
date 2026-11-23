/** Client-side JSON fetch that surfaces the API's error message. */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown; timeoutMs?: number }): Promise<T> {
  const { json, timeoutMs, ...rest } = init ?? {};
  const timeout = timeoutMs ? AbortSignal.timeout(timeoutMs) : null;
  const signal = timeout && rest.signal ? AbortSignal.any([rest.signal, timeout]) : (timeout ?? rest.signal);
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      signal,
      method: rest.method ?? (json !== undefined ? "POST" : "GET"),
      headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError" && rest.signal?.aborted) throw err;
    if (timeout?.aborted) throw new Error("That took too long. Please try again.");
    throw new Error("You appear to be offline. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}
