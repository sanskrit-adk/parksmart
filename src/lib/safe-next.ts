/** Only allow same-site relative redirects after sign-in. */
export function safeNext(v: unknown, fallback = "/find") {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback;
}
