"use client";

import { useCallback, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";

interface AgeRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  step?: number;
  onChange: (value: [number, number]) => void;
}

// Dual-handle range slider. shadcn/Radix Slider doesn't ship a two-handle
// variant by default in most projects, so this is a custom implementation
// using two overlaid native range inputs. Keep it self-contained.
export function AgeRangeSlider({ min, max, value, step = 2, onChange }: AgeRangeSliderProps) {
  const [lo, hi] = value;

  const handleLo = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const next = Math.min(Number(e.target.value), hi - step);
      onChange([next, hi]);
    },
    [hi, step, onChange]
  );

  const handleHi = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const next = Math.max(Number(e.target.value), lo + step);
      onChange([lo, next]);
    },
    [lo, step, onChange]
  );

  const range = max - min;
  const loPct = ((lo - min) / range) * 100;
  const hiPct = ((hi - min) / range) * 100;

  return (
    <div className="w-full">
      <div className="relative h-8">
        <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded-full bg-muted" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${loPct}%`, width: `${hiPct - loPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={handleLo}
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent",
            "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-background",
            "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary",
            "[&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4",
            "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-background",
            "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary",
            "[&::-moz-range-thumb]:cursor-pointer"
          )}
          aria-label="Minimum age"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={handleHi}
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent",
            "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-background",
            "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary",
            "[&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4",
            "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-background",
            "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary",
            "[&::-moz-range-thumb]:cursor-pointer"
          )}
          aria-label="Maximum age"
        />
      </div>
      <div className="mt-1 flex justify-between text-xs">
        <span className="font-medium">{lo}</span>
        <span className="font-medium">
          {hi >= max ? `${max - (max % 5 === 0 ? 1 : 0)}+` : hi}
        </span>
      </div>
    </div>
  );
}
