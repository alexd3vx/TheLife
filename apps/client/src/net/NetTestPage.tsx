import { useEffect, useState } from "react";
import { PROTOCOL_VERSION } from "@thelife/shared";
import { defaultServerUrl } from "./connection";

/** #/nettest: checks, step by step and with timings, whether this device can reach the game server. For finding out why a connection sticks. */
export default function NetTestPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [run, setRun] = useState(0);
  useEffect(() => {
    let live = true;
    const say = (t: string) => live && setLines((l) => [...l, t]);
    setLines([]);
    (async () => {
      const wss = defaultServerUrl();
      const https = wss.replace(/^ws/, "http");
      say(`Page: ${location.origin}`);
      say(`Server: ${wss}`);
      let t = performance.now();
      try {
        const r = await Promise.race([fetch(`${https}/health`), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("no answer in 10 s")), 10000))]);
        say(`1. Server page: ${r.status} ${JSON.stringify(await r.json())} (${Math.round(performance.now() - t)} ms)`);
      } catch (e) {
        say(`1. Server page FAILED: ${e instanceof Error ? e.message : e}`);
      }
      for (let i = 1; i <= 3; i++) {
        t = performance.now();
        await new Promise<void>((done) => {
          let opened = 0;
          const ws = new WebSocket(wss);
          const stop = setTimeout(() => { say(`2.${i} Socket: no answer in 20 s (state ${ws.readyState})`); ws.close(); done(); }, 20000);
          ws.onopen = () => {
            opened = performance.now() - t;
            ws.send(JSON.stringify({ t: "hello", name: "Test", protocol: PROTOCOL_VERSION, key: `nettest-${Math.random().toString(36).slice(2)}-0123456789`, where: "home" }));
          };
          ws.onmessage = (e) => {
            say(`2.${i} Socket opened in ${Math.round(opened)} ms; server said: ${String(e.data).slice(0, 90)}`);
            clearTimeout(stop);
            ws.close();
            done();
          };
          ws.onclose = (e) => {
            say(`2.${i} Socket closed: code ${e.code}${opened ? ` after opening in ${Math.round(opened)} ms` : " without ever opening"} (${Math.round(performance.now() - t)} ms)`);
            clearTimeout(stop);
            done();
          };
        });
      }
      say("Done. Send a screenshot of this page.");
    })();
    return () => { live = false; };
  }, [run]);
  return (
    <main style={{ padding: 20, font: "15px/1.5 system-ui", color: "#eee", background: "#1d1a17", minHeight: "100vh" }}>
      <h2>Connection check</h2>
      {lines.map((l, i) => <p key={i} style={{ margin: "6px 0", wordBreak: "break-word" }}>{l}</p>)}
      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setRun((n) => n + 1)}>Run again</button>
    </main>
  );
}
