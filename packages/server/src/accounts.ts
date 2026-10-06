/**
 * Checks a Supabase access token by asking Supabase who it belongs to. The URL and the anon key are public values (they are in the
 * website too); the answer is cached for a few minutes so a reconnect does not need another call.
 */
export function supabaseVerifier(url: string | undefined, anonKey: string | undefined): ((token: string) => Promise<{ id: string; email?: string } | null>) | undefined {
  if (!url || !anonKey) return undefined;
  const base = url.replace(/\/$/, "");
  const cache = new Map<string, { until: number; user: { id: string; email?: string } }>();
  return async (token) => {
    const hit = cache.get(token);
    if (hit && hit.until > Date.now()) return hit.user;
    const res = await fetch(`${base}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: anonKey } });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: unknown; email?: unknown };
    if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) return null;
    const user = { id: body.id, email: typeof body.email === "string" ? body.email : undefined };
    cache.set(token, { until: Date.now() + 5 * 60_000, user });
    if (cache.size > 2000) for (const k of cache.keys()) { cache.delete(k); break; }
    return user;
  };
}
