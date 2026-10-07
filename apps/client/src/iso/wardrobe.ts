// What the character can wear and how they can look: plain lists, shared by the sprite baker and the creator.

export interface Option {
  id: string;
  label: string;
}

export const HAIR_STYLES: Option[] = [
  { id: "p_buzz", label: "Buzz cut" },
  { id: "p_taper", label: "High taper" },
  { id: "p_fade", label: "Low fade" },
  { id: "p_waves", label: "Waves" },
  { id: "p_afro", label: "Afro" },
  { id: "p_puffs", label: "Afro puffs" },
  { id: "p_twists", label: "Twist-out" },
  { id: "p_cornrows", label: "Cornrows" },
  { id: "p_braids", label: "Box braids" },
  { id: "p_locs", label: "Locs" },
  { id: "p_shortlocs", label: "Short locs" },
  { id: "p_bantu", label: "Bantu knots" },
  { id: "p_bun", label: "Top bun" },
  { id: "p_pony", label: "Ponytail" },
  { id: "p_bob", label: "Bob" },
  { id: "p_long", label: "Long straight" },
  { id: "p_wrap", label: "Head wrap" },
  { id: "p_durag", label: "Durag" },
  { id: "p_hijab", label: "Hijab" },
];

export const TOPS: Option[] = [
  { id: "p_tee", label: "T-shirt" },
  { id: "p_polo", label: "Polo" },
  { id: "p_tank", label: "Tank top" },
  { id: "p_vest", label: "Vest" },
  { id: "p_crop", label: "Crop top" },
  { id: "p_long", label: "Long sleeve" },
  { id: "p_hoodie", label: "Hoodie" },
  { id: "p_jersey", label: "Jersey" },
  { id: "p_dress", label: "Dress" },
  { id: "p_kaftan", label: "Kaftan" },
  { id: "p_agbada", label: "Agbada" },
  { id: "p_shirt", label: "Shirt" },
  { id: "p_blazer", label: "Blazer" },
  { id: "p_sweater", label: "Sweater" },
];

export const BOTTOMS: Option[] = [
  { id: "p_shorts", label: "Shorts" },
  { id: "p_capri", label: "Capri" },
  { id: "p_trousers", label: "Trousers" },
  { id: "p_jeans", label: "Jeans" },
  { id: "p_slacks", label: "Suit trousers" },
  { id: "p_palazzo", label: "Wide trousers" },
];

export const SHOES: Option[] = [
  { id: "p_sneakers", label: "Sneakers" },
  { id: "p_slippers", label: "Slippers" },
  { id: "p_sandals", label: "Sandals" },
  { id: "p_boots", label: "Boots" },
  { id: "p_formal", label: "Formal shoes" },
];

export const ACCESSORY_OPTIONS: Option[] = [
  { id: "a_round", label: "Round glasses" },
  { id: "a_square", label: "Square glasses" },
  { id: "a_shades", label: "Sunglasses" },
  { id: "a_cap", label: "Cap" },
  { id: "a_beanie", label: "Beanie" },
  { id: "a_headband", label: "Headband" },
  { id: "a_hoops", label: "Hoop earrings" },
  { id: "a_chain", label: "Chain" },
  { id: "a_tie", label: "Tie" },
];
