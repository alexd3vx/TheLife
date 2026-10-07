import { isAdmin } from "../ui/admin";
import { GameIcon } from "../ui/icons";
import { useServerStats } from "./useServerStats";

/** A small icon chip with how many people are playing right now. Admins can tap it to open the stats page. */
export default function OnlineCount({ low }: { low?: boolean }) {
  const s = useServerStats();
  if (!s) return null;
  const cls = `online-count${low ? " is-low" : ""}`;
  const body = (
    <>
      <GameIcon name="people" size={14} />
      <b>{s.online}</b>
      {s.guests > 0 && <small>{s.guests} guest{s.guests === 1 ? "" : "s"}</small>}
    </>
  );
  const label = `${s.online} online, ${s.guests} guests`;
  return isAdmin() ? (
    <a className={cls} href="#/stats" title="Stats" aria-label={label}>{body}</a>
  ) : (
    <span className={cls} role="status" aria-label={label}>{body}</span>
  );
}
