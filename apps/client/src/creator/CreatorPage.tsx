import { GameIcon } from "../ui/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BACKGROUNDS, TIER_LABEL, TRAITS, rollBackground, sanitizeTraits, strengthSlots, type Profile, type Tier } from "@thelife/game-core";
import { DEFAULT_LOOK, sexOf, type Look } from "../lab/looks";
import CharacterStage from "../ui/CharacterStage";
import StudioPanel from "./StudioPanel";
import { setPending, takeRestart } from "../play/pendingLife";
import "./creator.css";

const naira = (n: number) => `₦${n.toLocaleString()}`;
const TIERS: Tier[] = ["lapo", "middle", "nepo"];
const PHONE_LABEL = { basic: "LifePhone Go (cracked screen)", mid: "LifePhone Plus", flagship: "LifePhone Max" } as const;
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Make your person, then roll the background that decides how life starts: lapo, middle or nepo. */
export default function CreatorPage() {
  const lookRef = useRef<Look>({ ...DEFAULT_LOOK });
  const [look, setLook] = useState<Look>(() => ({ ...DEFAULT_LOOK }));
  const [walking, setWalking] = useState(false);
  const [step, setStep] = useState<"look" | "background" | "traits">("look");
  const [traits, setTraits] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rolling, setRolling] = useState(false);
  const [reel, setReel] = useState<Tier | null>(null);
  const [rerolls, setRerolls] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");

  const update = useCallback((patch: Partial<Look>) => {
    setLook((prev) => {
      const next = { ...prev, ...patch };
      lookRef.current = next;
      return next;
    });
  }, []);

  const roll = useCallback(async () => {
    if (rolling) return;
    setRolling(true);
    const result = rollBackground(Math.random, sexOf(look.body));
    // A slot-machine spin over the three tiers that slows down and lands on the real result.
    const order = [...TIERS, ...TIERS, ...TIERS, ...TIERS];
    const landing = order.length + TIERS.indexOf(result.tier) - (order.length % 3);
    for (let i = 0; i < landing; i++) {
      setReel(TIERS[i % 3]!);
      await sleep(60 + i * i * 1.1);
    }
    setReel(result.tier);
    await sleep(350);
    setProfile(result);
    setFirstName(result.firstName);
    setSurname(result.surname);
    setRolling(false);
  }, [look.body, rolling]);

  const reroll = useCallback(() => {
    if (rerolls <= 0) return;
    setRerolls((n) => n - 1);
    void roll();
  }, [rerolls, roll]);

  const start = useCallback(() => {
    if (!profile) return;
    setPending({ ...profile, traits: sanitizeTraits(traits), firstName: firstName.trim() || profile.firstName, surname: surname.trim() || profile.surname }, takeRestart(), JSON.stringify(look));
    window.location.hash = "#/play";
  }, [profile, look, firstName, surname, traits]);

  const weaknessCount = traits.filter((id) => TRAITS.find((t) => t.id === id)?.kind === "weakness").length;
  const strengthCount = traits.length - weaknessCount;
  const slots = strengthSlots(weaknessCount);
  const toggleTrait = useCallback((id: string) => {
    setTraits((prev) => {
      if (prev.includes(id)) return prev.filter((t) => t !== id);
      const def = TRAITS.find((t) => t.id === id);
      if (!def) return prev;
      if (def.kind === "weakness") return [...prev.filter((t) => TRAITS.find((x) => x.id === t)?.kind !== "weakness"), id];
      const strengths = prev.filter((t) => TRAITS.find((x) => x.id === t)?.kind === "strength");
      const hasWeakness = prev.length > strengths.length;
      if (strengths.length >= strengthSlots(hasWeakness ? 1 : 0)) return prev;
      return [...prev, id];
    });
  }, []);

  return (
    <div className={`creator${step === "look" ? "" : " is-full"}`}>
      <div className="creator-stage">
        <CharacterStage look={look} walking={walking} onBusy={setBusy} />
        {busy && <div className="creator-busy">Dressing…</div>}
        <div className="studio-hint">Drag to turn around</div>
      </div>

      <aside className="creator-panel">
        <header className="creator-head">
          <a className="creator-back" href="#/" aria-label="Back">
            ←
          </a>
          <div>
            <h1>Create your person</h1>
            <ol className="creator-steps" aria-label="Steps">
              <li className={step === "look" ? "is-on" : "is-done"}>
                <button onClick={() => setStep("look")}>1 · Look</button>
              </li>
              <li className={step === "background" ? "is-on" : step === "traits" ? "is-done" : ""}>
                <button onClick={() => setStep("background")}>2 · Background</button>
              </li>
              <li className={step === "traits" ? "is-on" : ""}>
                <button onClick={() => profile && setStep("traits")} disabled={!profile} title={profile ? "" : "Roll your background first"}>
                  3 · Traits
                </button>
              </li>
            </ol>
          </div>
        </header>

        {step === "look" && <StudioPanel look={look} update={update} walking={walking} setWalking={setWalking} onNext={() => setStep("background")} />}

        {step === "background" && (
          <div className="creator-body">
            <section>
              <h2>Who are you?</h2>
              <div className="creator-names">
                <label>
                  First name
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Rolled with your background" maxLength={30} autoComplete="off" />
                </label>
                <label>
                  Surname
                  <input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="" maxLength={30} autoComplete="off" />
                </label>
              </div>
            </section>

            <section className="creator-roll">
              <h2>Your background</h2>
              <p className="creator-lede">Where you come from decides your money, your rent, your phone and how hard the first weeks are. It is rolled by luck.</p>
              <div className="creator-reel" aria-live="polite">
                {TIERS.map((t) => (
                  <span key={t} className={`creator-tier creator-tier-${t}${reel === t ? " is-on" : ""}`}>
                    {TIER_LABEL[t]}
                  </span>
                ))}
              </div>

              {!profile && !rolling && (
                <button className="btn btn-primary creator-dice" onClick={roll} disabled={busy}>
                  <GameIcon name="dice" /> Roll my background
                </button>
              )}
              {rolling && <p className="creator-rolling">Rolling…</p>}

              {profile && !rolling && (
                <article className={`creator-card creator-card-${profile.tier}`}>
                  <div className="creator-card-top">
                    <span className={`creator-tier creator-tier-${profile.tier} is-on`}>{TIER_LABEL[profile.tier]}</span>
                    <strong>{profile.title}</strong>
                    <span className="creator-town">from {profile.hometown}</span>
                  </div>
                  <p>{profile.story}</p>
                  <dl>
                    <div>
                      <dt>Starting money</dt>
                      <dd>{naira(profile.startingMoney)}</dd>
                    </div>
                    <div>
                      <dt>Rent</dt>
                      <dd>{profile.rentPerWeek === 0 ? "None, family house" : `${naira(profile.rentPerWeek)} a week`}</dd>
                    </div>
                    {profile.weeklyAllowance > 0 && (
                      <div>
                        <dt>Allowance</dt>
                        <dd>
                          {naira(profile.weeklyAllowance)} a week from {profile.allowanceFrom}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Phone</dt>
                      <dd>{PHONE_LABEL[profile.phone]}</dd>
                    </div>
                  </dl>
                  <div className="creator-traits">
                    {profile.flavour.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </article>
              )}
            </section>

            {profile && !rolling && (
              <div className="creator-actions">
                <button className="btn btn-primary" onClick={() => setStep("traits")}>
                  Next: choose your traits
                </button>
                <button className="btn btn-ghost" onClick={reroll} disabled={rerolls <= 0}>
                  {rerolls > 0 ? `Roll again (${rerolls} left)` : "No re-rolls left"}
                </button>
              </div>
            )}
            <p className="creator-fine">{BACKGROUNDS.length} backgrounds across lapo, middle and nepo. You can change how you look later in the Lab.</p>
          </div>
        )}

        {step === "traits" && profile && (
          <div className="creator-body">
            <section>
              <h2>Strengths</h2>
              <p className="creator-lede">
                Choose {slots}. Taking one weakness unlocks a third strength. <strong className="creator-count">{strengthCount} of {slots} chosen</strong>
              </p>
              <ul className="creator-traitlist">
                {TRAITS.filter((t) => t.kind === "strength").map((t) => {
                  const on = traits.includes(t.id);
                  const full = !on && strengthCount >= slots;
                  return (
                    <li key={t.id}>
                      <button className="creator-trait" aria-pressed={on} disabled={full} onClick={() => toggleTrait(t.id)}>
                        <strong>{t.label}</strong>
                        <span>{t.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section>
              <h2>Weakness (optional)</h2>
              <ul className="creator-traitlist">
                {TRAITS.filter((t) => t.kind === "weakness").map((t) => (
                  <li key={t.id}>
                    <button className="creator-trait is-weak" aria-pressed={traits.includes(t.id)} onClick={() => toggleTrait(t.id)}>
                      <strong>{t.label}</strong>
                      <span>{t.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <div className="creator-actions">
              <button className="btn btn-primary" onClick={start}>
                Start my life
              </button>
              <button className="btn btn-ghost" onClick={() => setStep("background")}>
                Back
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
