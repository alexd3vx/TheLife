import type { Msg } from "./inbox.js";

/**
 * Keeps the inbox in a Supabase database instead of a file on the server, so messages and player IDs survive a new server, a wiped
 * disk or a move. It uses the project's service key (a secret that only the game server holds; never put it in the website). The tables
 * are made by docs/supabase-chat.sql.
 */
export interface RemoteInbox {
  load(): Promise<{ users: { uid: string; name: string; seen: number; phone?: string }[]; messages: { from: string; to: string; text: string; at: number }[] }>;
  saveUser(uid: string, name: string, seen: number, phone?: string): void;
  saveMessage(m: { from: string; to: string; text: string; at: number }): void;
}

export function supabaseInbox(url: string | undefined, serviceKey: string | undefined): RemoteInbox | undefined {
  if (!url || !serviceKey) return undefined;
  const base = url.replace(/\/$/, "");
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  const post = (path: string, body: unknown, extra: Record<string, string> = {}) => {
    void fetch(`${base}/rest/v1/${path}`, { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(body) })
      .then(async (r) => {
        if (!r.ok) console.error(`supabase ${path} failed`, r.status, (await r.text()).slice(0, 200));
      })
      .catch((e) => console.error(`supabase ${path} failed`, e));
  };
  return {
    async load() {
      const users: { uid: string; name: string; seen: number; phone?: string }[] = [];
      const messages: { from: string; to: string; text: string; at: number }[] = [];
      try {
        let u = await fetch(`${base}/rest/v1/players?select=uid,name,seen_at,phone&limit=100000`, { headers });
        // (a database made before phone numbers existed has no phone column yet: read it without)
        if (!u.ok) u = await fetch(`${base}/rest/v1/players?select=uid,name,seen_at&limit=100000`, { headers });
        if (u.ok) for (const r of (await u.json()) as { uid: string; name: string; seen_at: string; phone?: string | null }[]) users.push({ uid: r.uid, name: r.name, seen: Date.parse(r.seen_at) || 0, phone: r.phone ?? undefined });
        else console.error("supabase players load failed", u.status);
        const m = await fetch(`${base}/rest/v1/messages?select=from_uid,to_uid,body,sent_at&order=sent_at.desc&limit=20000`, { headers });
        if (m.ok) for (const r of ((await m.json()) as { from_uid: string; to_uid: string; body: string; sent_at: string }[]).reverse()) messages.push({ from: r.from_uid, to: r.to_uid, text: r.body, at: Date.parse(r.sent_at) || 0 });
        else console.error("supabase messages load failed", m.status);
      } catch (e) {
        console.error("supabase inbox load failed", e);
      }
      return { users, messages };
    },
    saveUser(uid, name, seen, phone) {
      post("players?on_conflict=uid", { uid, name, seen_at: new Date(seen).toISOString(), ...(phone ? { phone } : {}) }, { prefer: "resolution=merge-duplicates,return=minimal" });
    },
    saveMessage(m) {
      post("messages", { from_uid: m.from, to_uid: m.to, body: m.text, sent_at: new Date(m.at).toISOString() }, { prefer: "return=minimal" });
    },
  };
}
export type { Msg };
