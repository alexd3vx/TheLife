"""Body shapes from MakeHuman targets: the macro stack (sex, age, muscle, weight, height, proportions, race, bust) and the detail sliders.

Every morph we ship is a plain additive delta against one rest body (an adult of African descent, neutral sex, 25 years, average build),
so the client can mix them with a weighted sum.
"""
from __future__ import annotations

import functools

import numpy as np

import mh

REST = {"gender": 0.5, "age": 0.5, "muscle": 0.5, "weight": 0.5, "proportions": 0.5, "height": 0.5, "cupsize": 0.5, "firmness": 0.5, "race": {"african": 1.0, "asian": 0.0, "caucasian": 0.0}}


def _interp(cfg: dict, name: str, value: float):
    out = []
    for part in cfg[name]["parts"]:
        lo, hi = part["lowest"], part["highest"]
        if lo < value < hi:
            pos = (value - lo) / (hi - lo)
            if part["low"]:
                out.append((part["low"], round(1 - pos, 4)))
            if part["high"]:
                out.append((part["high"], round(pos, 4)))
    return out


def macro_stack(p: dict, cutoff: float = 0.0005) -> list[tuple[str, float]]:
    cfg = mh.macro_config()
    comp = {k: _interp(cfg, k, p[k]) for k in ("gender", "age", "muscle", "weight", "proportions", "height", "cupsize", "firmness")}
    out: list[tuple[str, float]] = []
    for race, rw in p["race"].items():
        if rw <= 0.0001:
            continue
        for a, aw in comp["age"]:
            for g, gw in comp["gender"]:
                w = rw * gw * aw
                if w > cutoff:
                    out.append((f"macrodetails/{race}-{g}-{a}", w))
    for g, gw in comp["gender"]:
        for a, aw in comp["age"]:
            for m, mw in comp["muscle"]:
                for wt, ww in comp["weight"]:
                    w = gw * aw * mw * ww
                    if w > cutoff:
                        out.append((f"macrodetails/universal-{g}-{a}-{m}-{wt}", w))
                    for h, hw in comp["height"]:
                        w2 = w * hw
                        if w2 > cutoff:
                            out.append((f"macrodetails/height/{g}-{a}-{m}-{wt}-{h}", w2))
                    for pr, pw in comp["proportions"]:
                        w2 = w * pw
                        if w2 > cutoff and "baby" not in a:
                            out.append((f"macrodetails/proportions/{g}-{a}-{m}-{wt}-{pr}", w2))
                    if g == "female" and "baby" not in a:
                        for c, cw in comp["cupsize"]:
                            for fi, fw in comp["firmness"]:
                                w3 = aw * mw * ww * cw * fw
                                if w3 > cutoff and not (c == "averagecup" and fi == "averagefirmness"):
                                    out.append((f"breast/{g}-{a}-{m}-{wt}-{c}-{fi}", w3))
    return out


@functools.lru_cache(maxsize=None)
def _target(rel: str):
    return mh.load_target(mh.target_path(rel))


def apply_stack(base: np.ndarray, stack: list[tuple[str, float]]) -> np.ndarray:
    out = base.copy()
    for rel, w in stack:
        idx, d = _target(rel)
        out[idx] += d * w
    return out


def macro_pose(base: np.ndarray, **kw) -> np.ndarray:
    p = {**REST, **{k: v for k, v in kw.items() if k != "race"}}
    p["race"] = kw.get("race", REST["race"])
    return apply_stack(base, macro_stack(p))


# name -> parameters to change from REST; the delta is macro_pose(params) - macro_pose(REST)
MACROS: dict[str, dict] = {
    "masculine": {"gender": 1.0},
    "feminine": {"gender": 0.0},
    "older": {"age": 0.846},  # 70 years (MakeHuman maps 0.5 to 25 and 1.0 to 90)
    "younger": {"age": 0.34},  # 18 years
    "muscular": {"muscle": 1.0},
    "soft": {"muscle": 0.0},
    "heavy": {"weight": 1.0},
    "slim": {"weight": 0.0},
    "tall": {"height": 1.0},
    "short": {"height": 0.0},
    "proportions_ideal": {"proportions": 1.0},
    "proportions_uncommon": {"proportions": 0.0},
    "features_european": {"race": {"african": 0.0, "caucasian": 1.0, "asian": 0.0}},
    "features_east_asian": {"race": {"african": 0.0, "caucasian": 0.0, "asian": 1.0}},
}
# the bust only exists in the female stack, so it is measured there
BUST = {"bust_full": {"gender": 0.0, "cupsize": 1.0}, "bust_small": {"gender": 0.0, "cupsize": 0.0}}

# detail sliders: (id, label, group, decrease target(s), increase target(s)); a target containing '{s}' is made for both sides
# (the slider moves left and right together). Singles (no decrease) are one-directional.
def D(i, label, group, dec, inc):
    return (i, label, group, dec, inc)


DETAILS = [
    # head and face
    D("head_width", "Head width", "Face", "head/head-scale-horiz-decr", "head/head-scale-horiz-incr"),
    D("head_height", "Head height", "Face", "head/head-scale-vert-decr", "head/head-scale-vert-incr"),
    D("head_depth", "Head depth", "Face", "head/head-scale-depth-decr", "head/head-scale-depth-incr"),
    D("head_oval", "Oval head", "Face", None, "head/head-oval"),
    D("head_round", "Round head", "Face", None, "head/head-round"),
    D("head_rect", "Long head", "Face", None, "head/head-rectangular"),
    D("head_square", "Square head", "Face", None, "head/head-square"),
    D("head_triangle", "Triangle head", "Face", None, "head/head-triangular"),
    D("head_invtriangle", "Heart-shaped head", "Face", None, "head/head-invertedtriangular"),
    D("head_diamond", "Diamond head", "Face", None, "head/head-diamond"),
    D("forehead_height", "Forehead height", "Face", "forehead/forehead-scale-vert-decr", "forehead/forehead-scale-vert-incr"),
    D("forehead_tilt", "Forehead slope", "Face", "forehead/forehead-trans-backward", "forehead/forehead-trans-forward"),
    D("forehead_temple", "Temples", "Face", "forehead/forehead-temple-decr", "forehead/forehead-temple-incr"),
    D("cheek_volume", "Cheek fullness", "Face", "cheek/{s}-cheek-volume-decr", "cheek/{s}-cheek-volume-incr"),
    D("cheek_bones", "Cheekbones", "Face", "cheek/{s}-cheek-bones-decr", "cheek/{s}-cheek-bones-incr"),
    # eyes and brows
    D("eye_size", "Eye size", "Eyes", "eyes/{s}-eye-scale-decr", "eyes/{s}-eye-scale-incr"),
    D("eye_open", "Eye opening", "Eyes", "eyes/{s}-eye-height1-decr", "eyes/{s}-eye-height1-incr"),
    D("eye_lid", "Eyelid height", "Eyes", "eyes/{s}-eye-height2-decr", "eyes/{s}-eye-height2-incr"),
    D("eye_spacing", "Eye spacing", "Eyes", "eyes/{s}-eye-trans-in", "eyes/{s}-eye-trans-out"),
    D("eye_tilt", "Eye tilt", "Eyes", "eyes/{s}-eye-corner1-down", "eyes/{s}-eye-corner1-up"),
    D("eye_bags", "Eye bags", "Eyes", "eyes/{s}-eye-bag-decr", "eyes/{s}-eye-bag-incr"),
    D("brow_height", "Brow height", "Eyes", "eyebrows/eyebrows-trans-down", "eyebrows/eyebrows-trans-up"),
    D("brow_angle", "Brow angle", "Eyes", "eyebrows/eyebrows-angle-down", "eyebrows/eyebrows-angle-up"),
    # nose
    D("nose_width", "Nose width", "Nose", "nose/nose-scale-horiz-decr", "nose/nose-scale-horiz-incr"),
    D("nose_length", "Nose length", "Nose", "nose/nose-scale-vert-decr", "nose/nose-scale-vert-incr"),
    D("nose_depth", "Nose projection", "Nose", "nose/nose-scale-depth-decr", "nose/nose-scale-depth-incr"),
    D("nostril_width", "Nostril width", "Nose", "nose/nose-nostrils-width-decr", "nose/nose-nostrils-width-incr"),
    D("nose_tip_width", "Tip width", "Nose", "nose/nose-point-width-decr", "nose/nose-point-width-incr"),
    D("nose_tip_height", "Tip up or down", "Nose", "nose/nose-point-down", "nose/nose-point-up"),
    D("nose_hump", "Bridge hump", "Nose", "nose/nose-hump-decr", "nose/nose-hump-incr"),
    D("nose_flare", "Nostril flare", "Nose", "nose/nose-flaring-decr", "nose/nose-flaring-incr"),
    D("nose_bridge", "Bridge width", "Nose", "nose/nose-width1-decr", "nose/nose-width1-incr"),
    # mouth and chin
    D("mouth_width", "Mouth width", "Mouth", "mouth/mouth-scale-horiz-decr", "mouth/mouth-scale-horiz-incr"),
    D("mouth_height", "Mouth height", "Mouth", "mouth/mouth-scale-vert-decr", "mouth/mouth-scale-vert-incr"),
    D("lip_upper", "Upper lip", "Mouth", "mouth/mouth-upperlip-volume-decr", "mouth/mouth-upperlip-volume-incr"),
    D("lip_lower", "Lower lip", "Mouth", "mouth/mouth-lowerlip-volume-decr", "mouth/mouth-lowerlip-volume-incr"),
    D("lip_upper_h", "Upper lip height", "Mouth", "mouth/mouth-upperlip-height-decr", "mouth/mouth-upperlip-height-incr"),
    D("lip_lower_h", "Lower lip height", "Mouth", "mouth/mouth-lowerlip-height-decr", "mouth/mouth-lowerlip-height-incr"),
    D("cupid", "Cupid's bow", "Mouth", "mouth/mouth-cupidsbow-decr", "mouth/mouth-cupidsbow-incr"),
    D("mouth_corners", "Mouth corners", "Mouth", "mouth/mouth-angles-down", "mouth/mouth-angles-up"),
    D("mouth_pos", "Mouth position", "Mouth", "mouth/mouth-trans-down", "mouth/mouth-trans-up"),
    D("chin_height", "Chin height", "Mouth", "chin/chin-height-decr", "chin/chin-height-incr"),
    D("chin_forward", "Chin forward", "Mouth", "chin/chin-prominent-decr", "chin/chin-prominent-incr"),
    D("chin_width", "Chin width", "Mouth", "chin/chin-width-decr", "chin/chin-width-incr"),
    D("chin_cleft", "Chin cleft", "Mouth", "chin/chin-cleft-decr", "chin/chin-cleft-incr"),
    D("jaw_width", "Jaw width", "Mouth", "chin/chin-bones-decr", "chin/chin-bones-incr"),
    D("jaw_forward", "Jaw forward", "Mouth", "chin/chin-prognathism-decr", "chin/chin-prognathism-incr"),
    D("ear_size", "Ear size", "Face", "ears/{s}-ear-scale-decr", "ears/{s}-ear-scale-incr"),
    D("ear_wing", "Ears out", "Face", "ears/{s}-ear-wing-decr", "ears/{s}-ear-wing-incr"),
    D("ear_lobe", "Ear lobes", "Face", "ears/{s}-ear-lobe-decr", "ears/{s}-ear-lobe-incr"),
    # neck and torso
    D("neck_thick", "Neck thickness", "Body", "neck/neck-scale-horiz-decr", "neck/neck-scale-horiz-incr"),
    D("neck_length", "Neck length", "Body", "neck/neck-scale-vert-decr", "neck/neck-scale-vert-incr"),
    D("shoulders", "Shoulder width", "Body", "torso/measure-shoulder-dist-decr", "torso/measure-shoulder-dist-incr"),
    D("chest_width", "Chest width", "Body", "torso/torso-scale-horiz-decr", "torso/torso-scale-horiz-incr"),
    D("chest_depth", "Chest depth", "Body", "torso/torso-scale-depth-decr", "torso/torso-scale-depth-incr"),
    D("torso_length", "Torso length", "Body", "torso/torso-scale-vert-decr", "torso/torso-scale-vert-incr"),
    D("v_taper", "V-taper", "Body", "torso/torso-vshape-decr", "torso/torso-vshape-incr"),
    D("waist", "Waist", "Body", "torso/measure-waist-circ-decr", "torso/measure-waist-circ-incr"),
    D("pecs", "Chest muscle", "Body", "torso/torso-muscle-pectoral-decr", "torso/torso-muscle-pectoral-incr"),
    D("back_muscle", "Back muscle", "Body", "torso/torso-muscle-dorsi-decr", "torso/torso-muscle-dorsi-incr"),
    D("belly", "Belly", "Body", "stomach/stomach-pregnant-decr", "stomach/stomach-pregnant-incr"),
    D("hip_width", "Hip width", "Body", "hip/hip-scale-horiz-decr", "hip/hip-scale-horiz-incr"),
    D("hip_depth", "Hip depth", "Body", "hip/hip-scale-depth-decr", "hip/hip-scale-depth-incr"),
    D("glutes", "Glutes", "Body", "buttocks/buttocks-volume-decr", "buttocks/buttocks-volume-incr"),
    # limbs
    D("arm_length", "Upper arm length", "Limbs", "arms/measure-upperarm-length-decr", "arms/measure-upperarm-length-incr"),
    D("forearm_length", "Forearm length", "Limbs", "arms/measure-lowerarm-length-decr", "arms/measure-lowerarm-length-incr"),
    D("arm_fat", "Arm fat", "Limbs", "arms/{s}-upperarm-fat-decr", "arms/{s}-upperarm-fat-incr"),
    D("arm_muscle", "Arm muscle", "Limbs", "arms/{s}-upperarm-muscle-decr", "arms/{s}-upperarm-muscle-incr"),
    D("thigh_length", "Thigh length", "Limbs", "legs/upperlegs-height-decr", "legs/upperlegs-height-incr"),
    D("shin_length", "Shin length", "Limbs", "legs/lowerlegs-height-decr", "legs/lowerlegs-height-incr"),
    D("thigh_fat", "Thigh fat", "Limbs", "legs/{s}-upperleg-fat-decr", "legs/{s}-upperleg-fat-incr"),
    D("calf_fat", "Calf fat", "Limbs", "legs/{s}-lowerleg-fat-decr", "legs/{s}-lowerleg-fat-incr"),
    D("thigh_muscle", "Thigh muscle", "Limbs", "legs/{s}-upperleg-muscle-decr", "legs/{s}-upperleg-muscle-incr"),
    D("hand_size", "Hand size", "Limbs", "hands/{s}-hand-scale-decr", "hands/{s}-hand-scale-incr"),
    D("finger_length", "Finger length", "Limbs", "hands/{s}-hand-fingers-length-decr", "hands/{s}-hand-fingers-length-incr"),
    D("foot_size", "Foot size", "Limbs", "feet/{s}-foot-scale-decr", "feet/{s}-foot-scale-incr"),
]


def detail_delta(spec: str, n: int) -> np.ndarray:
    """One slider direction: the sum of its target files (both sides when it has '{s}')."""
    out = np.zeros((n, 3))
    files = [spec.replace("{s}", s) for s in ("l", "r")] if "{s}" in spec else [spec]
    for rel in files:
        idx, d = _target(rel)
        np.add.at(out, idx, d)
    return out


# Face units (the building blocks of an expression, as in FACS): id -> the MakeHuman expression targets that make it (African variants).
# Left and right eyes and brows are separate where a wink or a raised brow needs them, together where they always move as one.
FACE_UNITS: dict[str, list[str]] = {
    "fu_blinkL": ["eye-left-closure"],
    "fu_blinkR": ["eye-right-closure"],
    "fu_eyeWide": ["eye-left-opened-up", "eye-right-opened-up"],
    "fu_eyeSlit": ["eye-left-slit", "eye-right-slit"],
    "fu_browDown": ["eyebrows-left-down", "eyebrows-right-down"],
    "fu_browUp": ["eyebrows-left-up", "eyebrows-right-up"],
    "fu_browInner": ["eyebrows-left-inner-up", "eyebrows-right-inner-up"],
    "fu_browOuter": ["eyebrows-left-extern-up", "eyebrows-right-extern-up"],
    "fu_browUpL": ["eyebrows-left-up"],
    "fu_jawOpen": ["mouth-open"],
    "fu_smile": ["mouth-corner-puller"],
    "fu_frown": ["mouth-depression"],
    "fu_lipRaise": ["mouth-elevation"],
    "fu_pucker": ["mouth-pursing"],
    "fu_press": ["mouth-compression"],
    "fu_protrude": ["mouth-protusion"],
    "fu_stretch": ["mouth-retraction"],
    "fu_noseWrinkle": ["nose-compression"],
    "fu_nostrils": ["nose-left-dilatation", "nose-right-dilatation"],
    "fu_chinDown": ["mouth-depression-retraction"],
}


def face_unit_delta(parts: list[str], n: int) -> np.ndarray:
    out = np.zeros((n, 3))
    for name in parts:
        idx, d = mh.load_target(mh.target_path(f"expression/units/african/{name}"))
        np.add.at(out, idx, d)
    return out
