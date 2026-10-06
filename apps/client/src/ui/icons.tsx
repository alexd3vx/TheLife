import type { ReactElement } from "react";
import {
  FaBatteryEmpty, FaBatteryFull, FaBolt, FaBomb, FaBowlFood, FaBuildingColumns, FaCaretDown, FaCaretLeft, FaCaretRight, FaCaretUp, FaCartShopping, FaCheck, FaChurch, FaCloud,
  FaCloudBolt, FaCloudRain, FaCrown, FaDiceOne, FaDiceTwo, FaDiceThree, FaDiceFour, FaDiceFive, FaDiceSix, FaFaceFrown, FaFaceGrinBeam, FaFaceMeh, FaFaceSmile, FaFaceTired, FaFire, FaFlag,
  FaGasPump, FaGraduationCap, FaHand, FaHospital, FaHouse, FaMobileScreen, FaMoon, FaMosque, FaMoneyBillWave, FaMusic, FaPalette, FaPause, FaPencil, FaPersonRunning, FaPersonWalking,
  FaPlane, FaShieldHalved, FaShower, FaSun, FaToilet, FaUtensils, FaXmark, FaMapLocationDot, FaStar, FaCross, FaStarAndCrescent, FaPlay, FaDice, FaAppleWhole, FaLemon, FaCarrot,
  FaPepperHot, FaFish, FaEgg, FaCookie, FaSeedling, FaCircleDot,
} from "react-icons/fa6";
import type { IconType } from "react-icons";

/** The game's own icon set, drawn from Font Awesome (react-icons). Use names, never emoji. */
export const FA = {
  hunger: FaUtensils, energy: FaBolt, hygiene: FaShower, bladder: FaToilet, fun: FaMusic,
  phone: FaMobileScreen, map: FaMapLocationDot, palette: FaPalette, moon: FaMoon, sun: FaSun, cart: FaCartShopping, meal: FaBowlFood, home: FaHouse, money: FaMoneyBillWave,
  skill: FaGraduationCap, batteryFull: FaBatteryFull, batteryEmpty: FaBatteryEmpty, charging: FaBolt, walk: FaPersonWalking, run: FaPersonRunning, hand: FaHand, spot: FaCircleDot,
  airport: FaPlane, police: FaShieldHalved, hospital: FaHospital, school: FaPencil, church: FaChurch, mosque: FaStarAndCrescent, fire: FaFire, fuel: FaGasPump, hotel: FaCrown,
  market: FaCartShopping, bank: FaBuildingColumns, star: FaStar, cross: FaCross, play: FaPlay, pause: FaPause, check: FaCheck, close: FaXmark, up: FaCaretUp, down: FaCaretDown,
  left: FaCaretLeft, right: FaCaretRight, bomb: FaBomb, flag: FaFlag, dice: FaDice,
  sunny: FaSun, cloudy: FaCloud, rain: FaCloudRain, storm: FaCloudBolt,
  d1: FaDiceOne, d2: FaDiceTwo, d3: FaDiceThree, d4: FaDiceFour, d5: FaDiceFive, d6: FaDiceSix,
  m1: FaFaceTired, m2: FaFaceFrown, m3: FaFaceMeh, m4: FaFaceSmile, m5: FaFaceGrinBeam,
  apple: FaAppleWhole, lemon: FaLemon, carrot: FaCarrot, pepper: FaPepperHot, fish: FaFish, egg: FaEgg, cookie: FaCookie, seed: FaSeedling,
} satisfies Record<string, IconType>;

export type FaName = keyof typeof FA;

export function GameIcon({ name, size = 16, className, title }: { name: FaName; size?: number; className?: string; title?: string }) {
  const Icon = FA[name];
  return <Icon size={size} className={className} aria-hidden={title ? undefined : true} title={title} style={{ flex: "none", verticalAlign: "-0.15em" }} />;
}

/** The paths of an icon, for drawing into a canvas (map pins). react-icons components are plain functions, so we read their element tree directly. */
const pathCache = new Map<string, { d: string; box: [number, number] } | null>();
export function iconPath(name: FaName): { d: string; box: [number, number] } | null {
  const hit = pathCache.get(name);
  if (hit !== undefined) return hit;
  const el = (FA[name] as unknown as (p: object) => ReactElement<{ attr: { viewBox?: string }; children?: ReactElement<{ d?: string }> | ReactElement<{ d?: string }>[] }>)({});
  const kids = ([] as ReactElement<{ d?: string }>[]).concat(el.props.children ?? []);
  const d = kids.map((k) => k.props.d).filter(Boolean).join(" ");
  const vb = /^0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)$/.exec(el.props.attr.viewBox ?? "");
  const out = d && vb ? { d, box: [Number(vb[1]), Number(vb[2])] as [number, number] } : null;
  pathCache.set(name, out);
  return out;
}
