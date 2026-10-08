import { useRef, useState } from "react";
import { GameIcon } from "../ui/icons";
import { CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, SKIN_TONES, bodyFor, lookShape, sexOf, type Look } from "../lab/looks";
import type { StageBackdrop } from "../ui/CharacterStage";
import type { BodyShape } from "../lab/bodyShape";
import { BODY_SLIDERS } from "../lab/bodySliders";
import { FABRICS } from "../lab/procedural/fabrics";
import { ACCESSORY_OPTIONS, BOTTOMS, HAIR_STYLES, SHOES, TOPS } from "../iso/wardrobe";
import { BODY_DETAILS, randomAll, randomFor, type Tab } from "./randomise";
import type { SavedLook } from "./savedLooks";

const FACE_GROUPS = ["Face", "Eyes", "Nose", "Mouth"] as const;
const TABS: readonly (readonly [Tab, string])[] = [["body", "Body"], ["face", "Face"], ["hair", "Hair"], ["clothes", "Clothes"], ["extras", "Extras"]];
const BACKDROPS: { id: StageBackdrop; label: string }[] = [
  { id: "studio", label: "Studio" },
  { id: "room", label: "Home" },
  { id: "street", label: "Street" },
];
/** Head shapes you can pick in one tap: each is one of the head sliders turned up, the others turned off. */
const HEAD_SHAPES = [
  { id: "head_oval", label: "Oval" },
  { id: "head_round", label: "Round" },
  { id: "head_rect", label: "Long" },
  { id: "head_square", label: "Square" },
  { id: "head_invtriangle", label: "Heart" },
] as const;
/** The few face sliders most people want. Everything else is under "Fine-tune". */
const FACE_BASICS: { id: string; label: string }[] = [
  { id: "eye_size", label: "Eye size" },
  { id: "nose_width", label: "Nose width" },
  { id: "nose_length", label: "Nose length" },
  { id: "mouth_width", label: "Mouth width" },
  { id: "jaw_width", label: "Jaw width" },
  { id: "cheek_bones", label: "Cheekbones" },
];

export interface StudioProps {
  look: Look;
  update(patch: Partial<Look>): void;
  /** The body shape while a slider is being dragged (null when none is). The stage shows it at once; letting go commits it. */
  draft: BodyShape | null;
  previewShape(shape: BodyShape): void;
  commitShape(): void;
  walking: boolean;
  setWalking(on: boolean): void;
  onNext(): void;
  tab: Tab;
  onTab(tab: Tab): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  backdrop: StageBackdrop;
  setBackdrop(b: StageBackdrop): void;
  saved: SavedLook[];
  onSave(): void;
  onLoad(entry: SavedLook): void;
  onRemove(id: string): void;
}

function Slider({ label, value, min = -1, max = 1, step = 0.05, onPreview, onCommit }: { label: string; value: number; min?: number; max?: number; step?: number; onPreview(v: number): void; onCommit(): void }) {
  return (
    <label className="studio-slider wide">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onPreview(Number(e.target.value))}
        onPointerUp={onCommit}
        onTouchEnd={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        aria-label={label}
      />
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

/** Everything about how the person looks, kept short: the common choices up front, the rest folded away. Changes show on the stage straight away. */
export default function StudioPanel({ look, update, draft, previewShape, commitShape, walking, setWalking, onNext, tab, onTab, undo, redo, canUndo, canRedo, backdrop, setBackdrop, saved, onSave, onLoad, onRemove }: StudioProps) {
  const [faceGroup, setFaceGroup] = useState<(typeof FACE_GROUPS)[number]>("Face");
  const male = sexOf(look.body) === "male";
  const shape = draft ?? lookShape(look);
  // two slider events can arrive before the screen redraws: build on the newest shape, not the one this render started with
  const latest = useRef(shape);
  latest.current = shape;
  const setShape = (patch: Partial<BodyShape>) => {
    latest.current = { ...latest.current, ...patch };
    previewShape(latest.current);
  };
  const setDetail = (patch: Record<string, number>) => {
    latest.current = { ...latest.current, detail: { ...latest.current.detail, ...patch } };
    previewShape(latest.current);
  };
  const sliderLabel = (id: string) => BODY_SLIDERS.find((s) => s.id === id)?.label ?? id;
  const current = () => ({ ...look, shape: latest.current });
  const roll = (t: Tab) => {
    const base = current();
    if (t === "body") update({ ...randomFor("body", base), skinTone: randomFor("skin", base).skinTone });
    else if (t === "face") update({ ...randomFor("face", base), eyeColor: randomFor("skin", base).eyeColor });
    else update(randomFor(t, base));
  };
  const rollAll = () => update(randomAll(current()));
  const tabName = TABS.find(([id]) => id === tab)![1];
  const headShape = HEAD_SHAPES.find((h) => (shape.detail[h.id] ?? 0) > 0.3)?.id ?? null;
  const pickHeadShape = (id: string | null) => {
    const detail = { ...shape.detail };
    for (const h of HEAD_SHAPES) delete detail[h.id];
    if (id) detail[id] = 0.8;
    update({ shape: { ...shape, detail } });
  };
  const detailValue = (id: string) => shape.detail[id] ?? 0;
  const lipFullness = ((detailValue("lip_upper") + detailValue("lip_lower")) / 2);

  return (
    <div className="creator-body studio">
      <nav className="studio-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => onTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="studio-bar">
        <button onClick={undo} disabled={!canUndo} aria-label="Undo">
          ↶ Undo
        </button>
        <button onClick={redo} disabled={!canRedo} aria-label="Redo">
          Redo ↷
        </button>
        <button className="studio-dice" onClick={() => roll(tab)} aria-label={`Randomise ${tabName}`}>
          <GameIcon name="dice" /> {tabName}
        </button>
      </div>

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
            <Slider label="Looks about" value={shape.age} min={18} max={70} step={1} onPreview={(v) => setShape({ age: v })} onCommit={commitShape} />
            <Slider label="Height" value={shape.height} min={-0.8} max={0.8} onPreview={(v) => setShape({ height: v })} onCommit={commitShape} />
            <Slider label="Build" value={shape.weight} onPreview={(v) => setShape({ weight: v })} onCommit={commitShape} />
            <Slider label="Muscle" value={shape.muscle} onPreview={(v) => setShape({ muscle: v })} onCommit={commitShape} />
            {!male && <Slider label="Bust" value={shape.bust} onPreview={(v) => setShape({ bust: v })} onCommit={commitShape} />}
            <details className="studio-more">
              <summary>More body shaping</summary>
              {BODY_DETAILS.map((id) => (
                <Slider key={id} label={sliderLabel(id)} value={detailValue(id)} onPreview={(v) => setDetail({ [id]: v })} onCommit={commitShape} />
              ))}
            </details>
          </section>
        </>
      )}

      {tab === "face" && (
        <>
          <section>
            <h2>Head shape</h2>
            <Chips list={HEAD_SHAPES.map((h) => ({ id: h.id, label: h.label }))} value={headShape} none="Natural" onPick={pickHeadShape} />
          </section>
          <section>
            <h2>Features</h2>
            {FACE_BASICS.map((f) => (
              <Slider key={f.id} label={f.label} value={detailValue(f.id)} onPreview={(v) => setDetail({ [f.id]: v })} onCommit={commitShape} />
            ))}
            <Slider
              label="Lip fullness"
              value={lipFullness}
              onPreview={(v) => setDetail({ lip_upper: v, lip_lower: v })}
              onCommit={commitShape}
            />
            <details className="studio-more">
              <summary>Fine-tune the face</summary>
              <div className="creator-chips">
                {FACE_GROUPS.map((g) => (
                  <button key={g} aria-pressed={faceGroup === g} onClick={() => setFaceGroup(g)}>
                    {g}
                  </button>
                ))}
              </div>
              {BODY_SLIDERS.filter((s) => s.group === faceGroup).map((s) => (
                <Slider key={s.id} label={s.label} value={detailValue(s.id)} min={s.oneWay ? 0 : -1} onPreview={(v) => setDetail({ [s.id]: v })} onCommit={commitShape} />
              ))}
              <button className="studio-reset" onClick={() => update({ shape: { ...shape, detail: Object.fromEntries(Object.entries(shape.detail).filter(([id]) => !BODY_SLIDERS.some((s) => s.id === id && FACE_GROUPS.includes(s.group as (typeof FACE_GROUPS)[number])))) } })}>
                Reset the whole face
              </button>
            </details>
          </section>
          <section>
            <h2>Eyes{male ? " and beard" : ""}</h2>
            <Swatches list={EYE_COLORS.map((c) => ({ ...c, color: c.id === "brown" ? "#5a3a22" : c.color }))} value={look.eyeColor} onPick={(id) => update({ eyeColor: id })} label="Eye colour" />
            {male && (
              <label className="creator-check">
                <input type="checkbox" checked={look.beard} onChange={(e) => update({ beard: e.target.checked })} /> Beard
              </label>
            )}
          </section>
        </>
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
          </section>
          <section>
            <h2>Bottom</h2>
            <Chips list={BOTTOMS} value={look.bottom} none="None" onPick={(id) => update({ bottom: id })} />
            <Swatches small list={CLOTH_COLORS} value={look.bottomColor} onPick={(id) => update({ bottomColor: id })} label="Bottom colour" />
          </section>
          <section>
            <h2>Shoes</h2>
            <Chips list={SHOES} value={look.shoes} none="Barefoot" onPick={(id) => update({ shoes: id })} />
            <Swatches small list={CLOTH_COLORS} value={look.shoesColor} onPick={(id) => update({ shoesColor: id })} label="Shoe colour" />
          </section>
          <details className="studio-more">
            <summary>Fabrics</summary>
            <h3>Top</h3>
            <Chips list={FABRICS} value={look.topFabric} onPick={(id) => update({ topFabric: id ?? "plain" })} />
            <h3>Bottom</h3>
            <Chips list={FABRICS} value={look.bottomFabric} onPick={(id) => update({ bottomFabric: id ?? "plain" })} />
          </details>
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

      <details className="studio-more studio-extras">
        <summary>Preview and saved looks</summary>
        <h3>Preview</h3>
        <div className="creator-chips">
          {BACKDROPS.map((b) => (
            <button key={b.id} aria-pressed={backdrop === b.id} onClick={() => setBackdrop(b.id)}>
              {b.label}
            </button>
          ))}
          <button aria-pressed={walking} onClick={() => setWalking(!walking)}>
            {walking ? "Stand still" : "Walk"}
          </button>
        </div>
        <h3>My looks</h3>
        <div className="studio-shelf">
          {saved.map((e) => (
            <div key={e.id} className="studio-saved">
              <button className="studio-saved-pic" onClick={() => onLoad(e)} aria-label="Use this saved look">
                {e.img ? <img src={e.img} alt="" /> : <span>Look</span>}
              </button>
              <button className="studio-saved-x" onClick={() => onRemove(e.id)} aria-label="Delete this saved look">
                ×
              </button>
            </div>
          ))}
          <button className="studio-save" onClick={onSave}>
            + Save this look
          </button>
        </div>
      </details>
      <div className="studio-actions">
        <button onClick={rollAll}>
          <GameIcon name="dice" /> Surprise me
        </button>
      </div>
      <button className="btn btn-primary creator-next" onClick={onNext}>
        Next: your background
      </button>
    </div>
  );
}
