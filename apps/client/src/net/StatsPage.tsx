import { useServerStats } from "./useServerStats";
import "./stats.css";

const when = (t: number) => (t ? new Date(t).toLocaleString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-");

function Bars({ values, labels, title }: { values: number[]; labels: string[]; title: string }) {
  const max = Math.max(1, ...values);
  return (
    <section className="stats-card">
      <h2>{title}</h2>
      <div className="stats-bars">
        {values.map((v, i) => (
          <div key={i} className="stats-bar" title={`${labels[i]}: ${v}`}>
            <i style={{ height: `${(v / max) * 100}%` }} />
            {(i % Math.ceil(values.length / 6) === 0 || i === values.length - 1) && <small>{labels[i]}</small>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** #/stats: who is on the game right now and how many have visited. For testing; no names or emails, only counts. */
export default function StatsPage() {
  const s = useServerStats(5000);
  return (
    <main className="stats">
      <header>
        <a href="#/">← Back</a>
        <h1>TheLife stats</h1>
        <small>{s ? `updated ${when(s.at)}` : "loading…"}</small>
      </header>
      {!s && <p className="stats-note">Asking the game server… If this stays empty the server is asleep or unreachable.</p>}
      {s && (
        <>
          <div className="stats-grid">
            <div className="stats-tile big"><b>{s.online}</b><span>online now</span></div>
            <div className="stats-tile"><b>{s.accounts}</b><span>with accounts</span></div>
            <div className="stats-tile"><b>{s.guests}</b><span>guests</span></div>
            <div className="stats-tile"><b>{s.atHome}</b><span>at home</span></div>
            <div className="stats-tile"><b>{s.inWorld}</b><span>out in Lagos</span></div>
            <div className="stats-tile"><b>{s.viewsToday}</b><span>views today</span></div>
            <div className="stats-tile"><b>{s.playersToday}</b><span>different players today</span></div>
            <div className="stats-tile"><b>{s.viewsTotal}</b><span>views, all time</span></div>
            <div className="stats-tile"><b>{s.playersTotal}</b><span>different players, all time</span></div>
            <div className="stats-tile"><b>{s.peakOnline}</b><span>most at once ({when(s.peakAt)})</span></div>
          </div>
          <Bars title="Views, last 24 hours" values={s.hourly.map((h) => h.views)} labels={s.hourly.map((h) => h.hour.slice(11) + ":00")} />
          <Bars title="Most online in an hour" values={s.hourly.map((h) => h.peak)} labels={s.hourly.map((h) => h.hour.slice(11) + ":00")} />
          <Bars title="Views, last 14 days" values={s.daily.map((d) => d.views)} labels={s.daily.map((d) => d.day.slice(5))} />
          <Bars title="Different players, last 14 days" values={s.daily.map((d) => d.players)} labels={s.daily.map((d) => d.day.slice(5))} />
          <p className="stats-note">A "view" is one time someone opened the game and got in. A guest is someone not logged in to an account. Counts are kept on the game server and survive restarts.</p>
        </>
      )}
    </main>
  );
}
