import { useRef, useState } from "react";
import { CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, SKIN_TONES, bodyFor, lookShape, sexOf, type Look } from "../lab/looks";
import type { BodyShape } from "../lab/bodyShape";
import { BODY_SLIDERS } from "../lab/bodySliders";
import { FABRICS } from "../lab/procedural/fabrics";
import { ACCESSORY_OPTIONS, BOTTOMS, HAIR_STYLES, SHOES, TOPS } from "../iso/wardrobe";

type Tab = "body" | "face" | "hair" | "clothes" | "extras";
const FACE_GROUPS = ["Face", "Eyes", "Nose", "Mouth"] as const;
const BODY_DETAILS = ["shoulders", "chest_width", "waist", "belly", "hip_width", "glutes", "arm_muscle", "thigh_fat"];

function Slider({ label, value, min = -1, max = 1, step = 0.05, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange(v: number): void }) {
  return (
    <label className="studio-slider wide">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </label>
  );
}

function Swatches({ list, value, onPick, label, small }: { list: { id: string; label: string; color: string }[]; value: string | null; onPick(id: string): void; label: string; small?: boolean }) {
  return (
    <div className={`creator-swatches${small ? " small" : ""}`} role="group" aria-label={label}>
      {list.map((c) => (
        <button key={c.id} title={c.label} aria-label={`${label}: ${c.label}`} aria-pressed={value === c.id} style={{ background: c.color }} onClick={() => onPick(c.id)} />
      ))}
    </div>
  );
}

function Chips({ list, value, onPick, none }: { list: { id: string; label: string }[]; value: string | null; onPick(id: string | null): void; none?: string }) {
  return (
    <div className="creator-chips">
      {none && (
        <button aria-pressed={value === null} onClick={() => onPick(null)}>
          {none}
        </button>
      )}
      {list.map((o) => (
        <button key={o.id} aria-pressed={value === o.id} onClick={() => onPick(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const pickOne = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]!;

/** Everything about how the person looks. Changes show on the stage straight away. */
export default function StudioPanel({ look, update, walking, setWalking, onNext }: { look: Look; update(patch: Partial<Look>): void; walking: boolean; setWalking(on: boolean): void; onNext(): void }) {
  const [tab, setTab] = useState<Tab>("body");
  const [faceGroup, setFaceGroup] = useState<(typeof FACE_GROUPS)[number]>("Face");
  const male = sexOf(look.body) === "male";
  const shape = lookShape(look);
  // two slider events can arrive before the screen redraws: build on the newest shape, not the one this render started with
  const latest = useRef(shape);
  latest.current = shape;
  const setShape = (patch: Partial<BodyShape>) => {
    latest.current = { ...latest.current, ...patch };
    update({ shape: latest.current });
  };
  const setDetail = (id: string, v: number) => {
    latest.current = { ...latest.current, detail: { ...latest.current.detail, [id]: v } };
    update({ shape: latest.current });
  };
  const sliderLabel = (id: string) => BODY_SLIDERS.find((s) => s.id === id)?.label ?? id;
  const surprise = () =>
    update({
      skinTone: pickOne(SKIN_TONES).id,
      hair: pickOne(HAIR_STYLES).id,
      hairColor: pickOne(HAIR_COLORS).id,
      top: pickOne(TOPS).id,
      topColor: pickOne(CLOTH_COLORS).id,
      topFabric: pickOne(FABRICS).id,
      bottom: pickOne(BOTTOMS).id,
      bottomColor: pickOne(CLOTH_COLORS).id,
      bottomFabric: pickOne(FABRICS).id,
      shoes: pickOne(SHOES).id,
      shoesColor: pickOne(CLOTH_COLORS).id,
      accessory: Math.random() < 0.4 ? pickOne(ACCESSORY_OPTIONS).id : null,
      shape: {
        ...shape,
        height: (Math.random() - 0.5) * 1.2,
        weight: (Math.random() - 0.45) * 1.2,
        muscle: (Math.random() - 0.4) * 1.2,
        age: Math.round(18 + Math.random() * 30),
        bust: male ? 0 : (Math.random() - 0.4) * 1.2,
        detail: Object.fromEntries(BODY_SLIDERS.filter(() => Math.random() < 0.3).map((s) => [s.id, Math.round((s.oneWay ? Math.random() * 0.7 : (Math.random() - 0.5) * 1.2) * 20) / 20])),
      },
    });
  return (
    <div className="creator-body studio">
      <nav className="studio-tabs" role="tablist">
        {([["body", "Body"], ["face", "Face"], ["hair", "Hair"], ["clothes", "Clothes"], ["extras", "Extras"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "body" && (
        <>
          <section>
            <h2>Body</h2>
            <div className="creator-segment">
              {(["male", "female"] as const).map((sex) => (
                <button key={sex} aria-pressed={sexOf(look.body) === sex} onClick={() => update({ body: bodyFor(sex, true), beard: sex === "male" ? look.beard : false, hair: look.hair, shape: { ...shape, sex: sex === "male" ? 1 : 0 } })}>
                  {sex === "male" ? "Male" : "Female"}
                </button>
              ))}
            </div>
            <p className="studio-note">Pick the one that is really you. Your voice, in calls and in the city, will match it.</p>
            <h3>Skin tone</h3>
            <Swatches list={SKIN_TONES.map((t) => ({ id: t.id, label: t.label, color: t.base }))} value={look.skinTone} onPick={(id) => update({ skinTone: id })} label="Skin tone" />
          </section>
          <section>
            <h2>Shape</h2>
            <Slider label="Looks about" value={shape.age} min={18} max={70} step={1} onChange={(v) => setShape({ age: v })} />
            <Slider label="Height" value={shape.height} min={-0.8} max={0.8} onChange={(v) => setShape({ height: v })} />
            <Slider label="Build" value={shape.weight} onChange={(v) => setShape({ weight: v })} />
            <Slider label="Muscle" value={shape.muscle} onChange={(v) => setShape({ muscle: v })} />
            {!male && <Slider label="Bust" value={shape.bust} onChange={(v) => setShape({ bust: v })} />}
            {BODY_DETAILS.map((id) => (
              <Slider key={id} label={sliderLabel(id)} value={shape.detail[id] ?? 0} onChange={(v) => setDetail(id, v)} />
            ))}
          </section>
          <section>
            <h2>Eyes and beard</h2>
            <Swatches list={EYE_COLORS.map((c) => ({ ...c, color: c.id === "brown" ? "#5a3a22" : c.color }))} value={look.eyeColor} onPick={(id) => update({ eyeColor: id })} label="Eye colour" />
            {male && (
              <label className="creator-check">
                <input type="checkbox" checked={look.beard} onChange={(e) => update({ beard: e.target.checked })} /> Beard
              </label>
            )}
          </section>
        </>
      )}

      {tab === "face" && (
        <section>
          <h2>Face</h2>
          <div className="creator-chips">
            {FACE_GROUPS.map((g) => (
              <button key={g} aria-pressed={faceGroup === g} onClick={() => setFaceGroup(g)}>
                {g}
              </button>
            ))}
          </div>
          {BODY_SLIDERS.filter((s) => s.group === faceGroup).map((s) => (
            <Slider key={s.id} label={s.label} value={shape.detail[s.id] ?? 0} min={s.oneWay ? 0 : -1} onChange={(v) => setDetail(s.id, v)} />
          ))}
          <button className="studio-reset" onClick={() => update({ shape: { ...shape, detail: Object.fromEntries(Object.entries(shape.detail).filter(([id]) => !BODY_SLIDERS.some((s) => s.id === id && s.group === faceGroup))) } })}>
            Reset these
          </button>
        </section>
      )}

      {tab === "hair" && (
        <section>
          <h2>Hair</h2>
          <Chips list={HAIR_STYLES} value={look.hair} none="None" onPick={(id) => update({ hair: id })} />
          <h3>Colour</h3>
          <Swatches list={HAIR_COLORS} value={look.hairColor} onPick={(id) => update({ hairColor: id })} label="Hair colour" />
        </section>
      )}

      {tab === "clothes" && (
        <>
          <section>
            <h2>Top</h2>
            <Chips list={TOPS} value={look.top} none="None" onPick={(id) => update({ top: id })} />
            <Swatches small list={CLOTH_COLORS} value={look.topColor} onPick={(id) => update({ topColor: id })} label="Top colour" />
            <h3>Fabric</h3>
            <Chips list={FABRICS} value={look.topFabric} onPick={(id) => update({ topFabric: id ?? "plain" })} />
          </section>
          <section>
            <h2>Bottom</h2>
            <Chips list={BOTTOMS} value={look.bottom} none="None" onPick={(id) => update({ bottom: id })} />
            <Swatches small list={CLOTH_COLORS} value={look.bottomColor} onPick={(id) => update({ bottomColor: id })} label="Bottom colour" />
            <h3>Fabric</h3>
            <Chips list={FABRICS} value={look.bottomFabric} onPick={(id) => update({ bottomFabric: id ?? "plain" })} />
          </section>
          <section>
            <h2>Shoes</h2>
            <Chips list={SHOES} value={look.shoes} none="Barefoot" onPick={(id) => update({ shoes: id })} />
            <Swatches small list={CLOTH_COLORS} value={look.shoesColor} onPick={(id) => update({ shoesColor: id })} label="Shoe colour" />
          </section>
        </>
      )}

      {tab === "extras" && (
        <section>
          <h2>Accessory</h2>
          <Chips list={ACCESSORY_OPTIONS} value={look.accessory} none="None" onPick={(id) => update({ accessory: id })} />
          <h3>Colour</h3>
          <Swatches small list={CLOTH_COLORS} value={look.accessoryColor} onPick={(id) => update({ accessoryColor: id })} label="Accessory colour" />
          <p className="studio-note">Sunglasses, hoops and chains keep their own colour.</p>
        </section>
      )}

      <div className="studio-actions">
        <button onClick={() => setWalking(!walking)} aria-pressed={walking}>
          {walking ? "Stand still" : "See them walk"}
        </button>
        <button onClick={surprise}>Surprise me</button>
      </div>
      <button className="btn btn-primary creator-next" onClick={onNext}>
        Next: your background
      </button>
    </div>
  );
}
