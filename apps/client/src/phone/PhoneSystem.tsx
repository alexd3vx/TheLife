import { useBackHandler } from "./active";
import { GameIcon } from "../ui/icons";
import { useState } from "react";
import {
  HOME_PLANS, STORAGE_MB, PHONE_MODELS, compatibleTiers, STORE_APPS, STORE_CATEGORIES, clockOf, connection, hasApp, homePlanById, homeWifiWorks, modelOf, storageTotalMB, storageUsedMB, storeAppById, tierAtLeast, type GameState, type StoreAppId, type StoreCategory,
} from "@thelife/game-core";
import { buyHomePlan, cancelDownload, setMobileData, setWifi, startDownload, uninstallApp } from "./remote";
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

/** A circular progress ring: the download animation. */
export function Ring({ value, size = 36, paused = false }: { value: number; size?: number; paused?: boolean }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <span className={`pa-ring${paused ? " is-paused" : ""}`} style={{ width: size, height: size }} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="pa-ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} className="pa-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.02, Math.min(1, value)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <i>{paused ? <GameIcon name="pause" size={10} /> : `${Math.round(value * 100)}`}</i>
    </span>
  );
}

const TIER_SHORT = { basic: "Go", mid: "Plus", flagship: "Max" } as const;

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
  const [detail, setDetail] = useState<StoreAppId | null>(null);
  useBackHandler(detail ? () => setDetail(null) : null);
  const p = state.phone;
  const link = connection(state);
  const list = STORE_APPS.filter((a) => (cat === "all" || a.category === cat) && (!query || `${a.name} ${a.blurb}`.toLowerCase().includes(query.toLowerCase())));
  const queue = p.downloads;

  const button = (id: StoreAppId) => {
    const a = storeAppById(id)!;
    const d = queue.find((x) => x.appId === id);
    if (p.installed.includes(id)) return <Btn kind="soft" onClick={() => (hasApp(p, id) ? onOpen(id) : act(() => ({ ok: false, reason: `${a.name} needs a better phone.` })))}>Open</Btn>;
    if (d) return <Ring value={d.doneMB / a.sizeMB} paused={d.paused} />;
    if (!tierAtLeast(p.model, a.minTier)) return <span className="pa-fine pa-bad">Not compatible</span>;
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
                <div key={a.id} className="pa-row is-tappable" onClick={() => setDetail(a.id)}>
                  <AppTile id={a.id} />
                  <span className="pa-row-main">
                    <strong>{a.name}</strong>
                    <small>{a.blurb}</small>
                    <small className={tierAtLeast(p.model, a.minTier) ? "" : "pa-bad"}>{MB(a.sizeMB)}{a.dataMB === 0 ? " · works offline" : ""} · {tierAtLeast(p.model, a.minTier) ? "Compatible" : `Needs ${TIER_SHORT[a.minTier]} or newer`}</small>
                  </span>
                  <span onClick={(e) => e.stopPropagation()}>{button(a.id)}</span>
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
                  <Ring value={d.doneMB / a.sizeMB} paused={d.paused} size={32} />
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
      {detail && (() => {
        const a = storeAppById(detail)!;
        const ok = tierAtLeast(p.model, a.minTier);
        return (
          <div className="ps-sheet-wrap" onClick={() => setDetail(null)}>
            <div className="ps-sheet" role="dialog" aria-label={a.name} onClick={(e) => e.stopPropagation()}>
              <div className="ps-sheet-head">
                <AppTile id={a.id} size={64} />
                <span><strong>{a.name}</strong><small>{a.blurb}</small></span>
              </div>
              <div className="ps-facts">
                <span><b>{MB(a.sizeMB)}</b>size</span>
                <span><b>{a.price ? naira(a.price) : "Free"}</b>price</span>
                <span><b>{a.dataMB ? `${a.dataMB} MB` : "None"}</b>data per open</span>
              </div>
              <p className="pa-section">Works on</p>
              <div className="ps-compat">
                {(["basic", "mid", "flagship"] as const).map((t) => (
                  <span key={t} className={`${compatibleTiers(a).includes(t) ? "is-yes" : "is-no"}${p.model === t ? " is-you" : ""}`}>
                    <GameIcon name={compatibleTiers(a).includes(t) ? "check" : "close"} size={12} /> {PHONE_MODELS[t].name.replace("LifePhone ", "")}{p.model === t ? " (yours)" : ""}
                  </span>
                ))}
              </div>
              {!ok && <p className="pa-note pa-bad">Your {PHONE_MODELS[p.model].name} can't run this app. Buy a newer phone in LifeShop.</p>}
              <div className="ps-sheet-actions">{button(a.id)}<Btn kind="soft" onClick={() => setDetail(null)}>Close</Btn></div>
            </div>
          </div>
        );
      })()}
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
