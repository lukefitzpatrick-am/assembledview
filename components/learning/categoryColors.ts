export type CategoryColor = {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
};

type PaletteEntry = CategoryColor & { key: string };

const anchors = [
  { h: 292, s: 75, l: 52 }, // brand purple
  { h: 210, s: 70, l: 52 }, // primary blue
  { h: 180, s: 72, l: 48 }, // teal
  { h: 84, s: 65, l: 52 }, // lime accent
  { h: 325, s: 78, l: 60 }, // highlight pink
  { h: 45, s: 92, l: 55 }, // warm yellow
  { h: 24, s: 95, l: 56 }, // orange
  { h: 150, s: 65, l: 46 }, // success green
  { h: 195, s: 72, l: 54 }, // info cyan
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const wrapHue = (h: number) => ((h % 360) + 360) % 360;

const hashString = (value: string) => {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
};

const createColorFromSeed = (seed: number): PaletteEntry => {
  const anchor = anchors[seed % anchors.length];
  const hueOffset = ((seed >> 3) % 9 - 4) * 4; // -16..16
  const saturationOffset = ((seed >> 6) % 7 - 3) * 4; // -12..12
  const lightnessOffset = ((seed >> 9) % 7 - 3) * 3; // -9..9

  const h = wrapHue(anchor.h + hueOffset);
  const s = clamp(anchor.s + saturationOffset, 45, 82);
  const l = clamp(anchor.l + lightnessOffset, 38, 68);

  const textColor = l > 62 ? "#111827" : "#ffffff"; // dark text on lighter swatches
  const borderColor = `hsl(${h} ${s}% ${clamp(l - 8, 26, 60)}%)`;

  return {
    backgroundColor: `hsl(${h} ${s}% ${l}%)`,
    textColor,
    borderColor,
    key: `${h}-${s}-${l}`,
  };
};

export const DEFAULT_CATEGORY_COLOR: CategoryColor = {
  backgroundColor: "hsl(292 75% 52%)",
  textColor: "#ffffff",
  borderColor: "hsl(292 75% 40%)",
};

export const normalizeCategory = (category?: string) => (category?.trim() || "General");

export const buildCategoryColorMap = (categories: string[]): Record<string, CategoryColor> => {
  const usedKeys = new Set<string>();
  const map: Record<string, CategoryColor> = {};

  categories.forEach((rawCategory, index) => {
    const category = normalizeCategory(rawCategory) || `Category ${index + 1}`;
    const seed = hashString(category.toLowerCase());

    let attempt = 0;
    let color: PaletteEntry | null = null;

    while (!color || usedKeys.has(color.key)) {
      color = createColorFromSeed(seed + attempt * 17);
      attempt += 1;
      if (attempt > 12) break;
    }

    const { key, ...finalColor } = color || { ...DEFAULT_CATEGORY_COLOR, key: DEFAULT_CATEGORY_COLOR.backgroundColor };
    usedKeys.add(key);
    map[category] = finalColor;
  });

  return map;
};

export const getCategoryColor = (
  category: string | undefined,
  map: Record<string, CategoryColor> | undefined
): CategoryColor => {
  const key = normalizeCategory(category);
  return map?.[key] || DEFAULT_CATEGORY_COLOR;
};



















