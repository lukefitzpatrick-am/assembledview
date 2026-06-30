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

export const GROUP_COLORS: Record<string, CategoryColor> = {
  "Planning & Strategy": { backgroundColor: "hsl(222 68% 54%)", textColor: "#ffffff", borderColor: "hsl(222 68% 42%)" },
  "Buying & Trading": { backgroundColor: "hsl(28 88% 52%)", textColor: "#ffffff", borderColor: "hsl(28 88% 40%)" },
  "Channels & Formats": { backgroundColor: "hsl(180 60% 38%)", textColor: "#ffffff", borderColor: "hsl(180 60% 28%)" },
  "Audiences & Targeting": { backgroundColor: "hsl(325 68% 56%)", textColor: "#ffffff", borderColor: "hsl(325 68% 44%)" },
  "Creative": { backgroundColor: "hsl(265 68% 60%)", textColor: "#ffffff", borderColor: "hsl(265 68% 48%)" },
  "Metrics": { backgroundColor: "hsl(150 58% 40%)", textColor: "#ffffff", borderColor: "hsl(150 58% 30%)" },
  "Measurement & Attribution": { backgroundColor: "hsl(199 80% 43%)", textColor: "#ffffff", borderColor: "hsl(199 80% 32%)" },
  "Tracking & Ad Ops": { backgroundColor: "hsl(255 45% 58%)", textColor: "#ffffff", borderColor: "hsl(255 45% 46%)" },
  "Finance & Commercial": { backgroundColor: "hsl(43 80% 45%)", textColor: "#ffffff", borderColor: "hsl(43 80% 34%)" },
  "Governance & Privacy": { backgroundColor: "hsl(352 68% 52%)", textColor: "#ffffff", borderColor: "hsl(352 68% 40%)" },
  "Platforms & Tools": { backgroundColor: "hsl(292 70% 52%)", textColor: "#ffffff", borderColor: "hsl(292 70% 40%)" },
  "Other / Uncategorised": { backgroundColor: "hsl(220 10% 55%)", textColor: "#ffffff", borderColor: "hsl(220 10% 43%)" },
};

export const getGroupColor = (
  group: string | undefined,
  map: Record<string, CategoryColor> = GROUP_COLORS
): CategoryColor => (group && map[group]) || DEFAULT_CATEGORY_COLOR;

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



























