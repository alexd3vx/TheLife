import { describe, expect, it } from "vitest";
import { Inbox, uidOf } from "./inbox.js";
import type { RemoteInbox } from "./supabaseInbox.js";

describe("the inbox", () => {
  it("gives the same short ID every time for the same key, and a different one for another", () => {
    expect(uidOf("acct-123")).toBe(uidOf("acct-123"));
    expect(uidOf("acct-123")).toMatch(/^[a-f0-9]{10}$/);
    expect(uidOf("acct-123")).not.toBe(uidOf("acct-124"));
  });

  it("rebuilds conversations from the database and writes new ones back", async () => {
    const saved: unknown[] = [];
    const remote: RemoteInbox = {
      load: async () => ({ users: [{ uid: "aaaaaaaaaa", name: "Ada", seen: 1 }, { uid: "bbbbbbbbbb", name: "Bayo", seen: 2 }], messages: [{ from: "aaaaaaaaaa", to: "bbbbbbbbbb", text: "hi", at: 10 }] }),
      saveUser: (uid, name) => void saved.push(["user", uid, name]),
      saveMessage: (m) => void saved.push(["msg", m.text]),
    };
    const inbox = new Inbox(null, remote);
    await inbox.ready;
    expect(inbox.nameOf("bbbbbbbbbb")).toBe("Bayo");
    expect(inbox.inbox("bbbbbbbbbb")[0]).toMatchObject({ uid: "aaaaaaaaaa", name: "Ada" });
    expect(inbox.inbox("bbbbbbbbbb")[0]!.msgs.map((m) => m.text)).toEqual(["hi"]);
    inbox.send("bbbbbbbbbb", "aaaaaaaaaa", "hello back", 20);
    inbox.touch("cccccccccc", "Chi", 30);
    expect(saved).toEqual([["msg", "hello back"], ["user", "cccccccccc", "Chi"]]);
    expect(inbox.inbox("aaaaaaaaaa")[0]!.msgs.map((m) => m.text)).toEqual(["hi", "hello back"]);
  });
});
