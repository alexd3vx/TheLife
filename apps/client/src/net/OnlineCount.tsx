import { useServerStats } from "./useServerStats";

/** A small chip that says how many people are playing right now (and how many of them are guests). */
export default function OnlineCount({ low }: { low?: boolean }) {
  const s = useServerStats();
  if (!s) return null;
  return (
    <a className={`online-count${low ? " is-low" : ""}`} href="#/stats" title="Open the stats page">
      <i /> {s.online} online{s.guests > 0 ? ` · ${s.guests} guest${s.guests === 1 ? "" : "s"}` : ""}
    </a>
  );
}
