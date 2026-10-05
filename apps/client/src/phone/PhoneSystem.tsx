import { useState } from "react";
import {
  HOME_PLANS, STORAGE_MB, STORE_APPS, STORE_CATEGORIES, buyHomePlan, cancelDownload, clockOf, connection, hasApp, homePlanById, homeWifiWorks, modelOf, setMobileData, setWifi,
  startDownload, storageTotalMB, storageUsedMB, storeAppById, tierAtLeast, uninstallApp,
  type GameState, type StoreAppId, type StoreCategory,
} from "@thelife/game-core";
import { Btn, MB, Row, Tabs, naira, type Act } from "./PhoneApps";
import { Icon, type IconName } from "./icons";
import { styleOf } from "./appStyle";

export function AppTile({ id, size = 44 }: { id: StoreAppId | string; size?: number }) {
  const look = styleOf(id as never);
  return (
    <span className="pa-tile" style={{ width: size, height: size, background: `linear-gradient(150deg, ${look.from}, ${look.to})` }}>
      <Icon name={look.icon} size={Math.round(size * 0.52)} />
    </span>
  );
}

const daysLeft = (state: GameState) => Math.max(0, Math.ceil(((state.phone.homeNet?.until ?? 0) - state.minute) / 1440));

function Switch({ title, sub, on, onChange }: { title: string; sub: string; on: boolean; onChange(v: boolean): void }) {
  return (
    <label className="pa-switch">
      <span>
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

// ------------------------------------------------------------------ Settings

export function Settings({ state, act }: { state: GameState; act: Act }) {
  const p = state.phone;
  const model = modelOf(p);
  const link = connection(state);
  const used = storageUsedMB(state);
  const total = storageTotalMB(state);
  const wifiSub = !p.homeNet || p.homeNet.until <= state.minute ? "No home plan. Buy one below." : !homeWifiWorks(state) ? "Router has no power (power cut)" : `${homePlanById(p.homeNet.plan)?.name ?? "Home Wi-Fi"} · ${daysLeft(state)} days left`;
  return (
    <div className="pa-page">
      <p className="pa-section">Connections</p>
      <div className="pa-group">
        <Switch title="Wi-Fi" sub={wifiSub} on={p.wifiOn} onChange={(v) => act((s) => setWifi(s, v))} />
        <Switch title="Mobile data" sub={`${MB(p.dataMB)} left · buy more in LifePay`} on={p.mobileOn} onChange={(v) => act((s) => setMobileData(s, v))} />
        <Row icon="signal" tone="#4d8bff" title="Connected via" sub={link.kind === "none" ? "Nothing. Apps that need the internet won't open." : `${link.label} · about ${link.speed} MB per minute`} />
      </div>

      <p className="pa-section">Home internet</p>
      <div className="pa-group">
        {HOME_PLANS.map((plan) => (
          <Row key={plan.id} icon="wifi" tone="#2fbf71" title={plan.name} sub={`${plan.blurb} · ${plan.speed} MB/min`} right={<Btn kind="soft" onClick={() => act((s) => buyHomePlan(s, plan.id))}>{naira(plan.price)}</Btn>} />
        ))}
      </div>
      <p className="pa-fine">Wi-Fi needs mains power for the router, so a power cut takes it away. Downloads then use mobile data.</p>

      <p className="pa-section">Storage</p>
      <div className="pa-card-soft">
        <span>Apps use</span>
        <strong>{MB(used)} of {MB(total)}</strong>
        <div className="pa-bar" role="progressbar" aria-valuenow={used} aria-valuemax={total}>
          <i style={{ width: `${Math.min(100, (used / total) * 100)}%` }} />
        </div>
      </div>
      <div className="pa-group">
        {p.installed.length === 0 && <p className="pa-empty">No downloaded apps. Open LifeStore to get some.</p>}
        {p.installed.map((id) => {
          const a = storeAppById(id)!;
          return <Row key={id} title={a.name} sub={MB(a.sizeMB)} right={<Btn kind="soft" onClick={() => act((s) => uninstallApp(s, id))}>Remove</Btn>} />;
        })}
      </div>

      <p className="pa-section">About</p>
      <div className="pa-group">
        <Row icon="power" tone="#6b7a90" title={model.name} sub={`${model.screen} · ${MB(STORAGE_MB[p.model])} for apps`} />
        <Row icon="clock" tone="#9aa6ff" title="Phone time" sub={`${clockOf(state.minute).label}, day ${clockOf(state.minute).day}`} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ LifeStore

type StoreTab = "browse" | "downloads" | "mine";

export function LifeStore({ state, act, onOpen }: { state: GameState; act: Act; onOpen(id: StoreAppId): void }) {
  const [tab, setTab] = useState<StoreTab>("browse");
  const [cat, setCat] = useState<StoreCategory | "all">("all");
  const [query, setQuery] = useState("");
  const p = state.phone;
  const link = connection(state);
  const list = STORE_APPS.filter((a) => (cat === "all" || a.category === cat) && (!query || `${a.name} ${a.blurb}`.toLowerCase().includes(query.toLowerCase())));
  const queue = p.downloads;

  const button = (id: StoreAppId) => {
    const a = storeAppById(id)!;
    const d = queue.find((x) => x.appId === id);
    if (p.installed.includes(id)) return <Btn kind="soft" onClick={() => (hasApp(p, id) ? onOpen(id) : act(() => ({ ok: false, reason: `${a.name} needs a better phone.` })))}>Open</Btn>;
    if (d) return <span className="pa-fine">{d.paused ? "Paused" : `${Math.round((d.doneMB / a.sizeMB) * 100)}%`}</span>;
    if (!tierAtLeast(p.model, a.minTier)) return <span className="pa-fine">Needs Plus</span>;
    return <Btn onClick={() => act((s) => startDownload(s, id))}>{a.price ? naira(a.price) : "Get"}</Btn>;
  };

  return (
    <div className="pa-with-tabs">
      <div className="pa-page">
        <div className={`pa-note pa-conn is-${link.kind}`}>
          <Icon name={link.kind === "wifi" ? "wifi" : "signal"} size={16} />{" "}
          {link.kind === "wifi" ? "On Wi-Fi: downloads are free." : link.kind === "data" ? `On mobile data (${MB(p.dataMB)} left): downloads use your bundle.` : "No connection. Turn on Wi-Fi or buy data to download."}
        </div>

        {tab === "browse" && (
          <>
            <label className="pa-search">
              <Icon name="search" size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search apps" aria-label="Search apps" />
            </label>
            <div className="pa-chips">
              <button className={`pa-chip${cat === "all" ? " is-accent" : ""}`} onClick={() => setCat("all")}>All</button>
              {STORE_CATEGORIES.map((c) => (
                <button key={c.id} className={`pa-chip${cat === c.id ? " is-accent" : ""}`} onClick={() => setCat(c.id)}>{c.label}</button>
              ))}
            </div>
            <div className="pa-group">
              {list.length === 0 && <p className="pa-empty">Nothing found.</p>}
              {list.map((a) => (
                <div key={a.id} className="pa-row">
                  <AppTile id={a.id} />
                  <span className="pa-row-main">
                    <strong>{a.name}</strong>
                    <small>{a.blurb}</small>
                    <small>{MB(a.sizeMB)}{a.dataMB === 0 ? " · works offline" : ""}</small>
                  </span>
                  {button(a.id)}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "downloads" && (
          <div className="pa-group">
            {queue.length === 0 && <p className="pa-empty">No downloads right now.</p>}
            {queue.map((d, i) => {
              const a = storeAppById(d.appId)!;
              return (
                <div key={d.appId} className="pa-row">
                  <AppTile id={a.id} />
                  <span className="pa-row-main">
                    <strong>{a.name}</strong>
                    <small>{i === 0 ? (d.paused ? "Paused: waiting for a connection" : `${MB(d.doneMB)} of ${MB(a.sizeMB)}`) : "Waiting in the queue"}</small>
                    <div className="pa-bar"><i style={{ width: `${Math.min(100, (d.doneMB / a.sizeMB) * 100)}%` }} /></div>
                  </span>
                  <button className="pa-icon-btn" aria-label={`Cancel ${a.name}`} onClick={() => act((s) => cancelDownload(s, d.appId))}>
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "mine" && (
          <>
            <p className="pa-fine">{MB(storageUsedMB(state))} of {MB(storageTotalMB(state))} used</p>
            <div className="pa-group">
              {p.installed.length === 0 && <p className="pa-empty">You haven't downloaded anything yet.</p>}
              {p.installed.map((id) => {
                const a = storeAppById(id)!;
                return (
                  <div key={id} className="pa-row">
                    <AppTile id={id} />
                    <span className="pa-row-main"><strong>{a.name}</strong><small>{MB(a.sizeMB)}</small></span>
                    <Btn kind="soft" onClick={() => onOpen(id)}>Open</Btn>
                    <button className="pa-icon-btn" aria-label={`Uninstall ${a.name}`} onClick={() => act((s) => uninstallApp(s, id))}><Icon name="trash" size={18} /></button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <Tabs<StoreTab>
        tabs={[
          { id: "browse", label: "Browse", icon: "store" as IconName },
          { id: "downloads", label: queue.length ? `Downloads (${queue.length})` : "Downloads", icon: "download" as IconName },
          { id: "mine", label: "Installed", icon: "check" as IconName },
        ]}
        value={tab}
        onChange={setTab}
      />
    </div>
  );
}
