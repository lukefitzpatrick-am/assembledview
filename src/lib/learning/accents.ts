// Knowledge Hub — shared accent palette (token classes only).
// One source of truth so Home tiles, the Resource Hub, Platforms and Guides all
// use the same colour language. Every value is a design-system token utility
// (channel-*, pacing-*/status-*-fg, brand, accent) — never a raw hex.
//
// Each accent supplies four slots:
//   chip   — icon chip: tint background + saturated foreground
//   border — coloured card border / left rule
//   dot    — 9px category-rail dot (solid)
//   bar    — 3px top/side accent strip (solid)

export type Accent = {
  chip: string;
  border: string;
  dot: string;
  bar: string;
};

export type AccentKey =
  | "green"
  | "blue"
  | "purple"
  | "amber"
  | "coral"
  | "magenta"
  | "lime"
  | "neutral";

export const ACCENTS: Record<AccentKey, Accent> = {
  green: {
    chip: "bg-pacing-ahead-bg text-status-ahead-fg",
    border: "border-primary",
    dot: "bg-primary",
    bar: "bg-primary",
  },
  blue: {
    chip: "bg-channel-social-bg text-channel-social-fg",
    border: "border-channel-social",
    dot: "bg-channel-social",
    bar: "bg-channel-social",
  },
  purple: {
    chip: "bg-channel-bvod-bg text-channel-bvod",
    border: "border-channel-bvod",
    dot: "bg-channel-bvod",
    bar: "bg-channel-bvod",
  },
  amber: {
    chip: "bg-pacing-behind-bg text-status-behind-fg",
    border: "border-channel-progDisplay",
    dot: "bg-channel-progDisplay",
    bar: "bg-channel-progDisplay",
  },
  coral: {
    chip: "bg-pacing-critical-bg text-status-critical-fg",
    border: "border-channel-tv",
    dot: "bg-channel-tv",
    bar: "bg-channel-tv",
  },
  magenta: {
    chip: "bg-brand/10 text-brand",
    border: "border-brand",
    dot: "bg-brand",
    bar: "bg-brand",
  },
  lime: {
    chip: "bg-accent text-accent-foreground",
    border: "border-accent",
    dot: "bg-accent",
    bar: "bg-accent",
  },
  neutral: {
    chip: "bg-surface-muted text-text-secondary",
    border: "border-border",
    dot: "bg-muted-foreground",
    bar: "bg-muted-foreground",
  },
};

export function accent(key: AccentKey): Accent {
  return ACCENTS[key];
}
