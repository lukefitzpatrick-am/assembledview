# SEAM5 Deliverable Wrapper Drift

Reconnaissance only. No consolidation approach proposed.

Scope: all 20 `components/media-containers/*Container.tsx` files.

Production note: `ProductionContainer.tsx` is one of the 20 containers, but it is structurally outside this deliverable-wrapper seam. It uses `cost` and `amount`, does not import `computeDeliverableFromMedia`, and has no `getDeliverablesLabel` or `formatBuyTypeForDisplay` equivalent found in this census.

## STOP Flags

- `computeLoadedDeliverables`: 9 local hydration-time wrapper copies when including Television's same-shape `computeTelevisionLoadedDeliverables`; 5 structural variants.
- Rounding split: yes. Rounded on `BVOD`, `DigitalAudio`, `OOH`, `Television`; raw return on `Integration`, `Magazines`, `Newspaper`, `ProgVideo`, `Radio`. This is an explicit correctness question for Luke.
- Inline deliverable computation instead of shared primitive: standard `handleValueChange` has no inline CPC-family formula exceptions except `Production` being out of model and `Television` not computing in `handleValueChange`. Separate SocialMedia hydration/reset code still computes inline at `components/media-containers/SocialMediaContainer.tsx:653` and `components/media-containers/SocialMediaContainer.tsx:714`.
- Common label core: `cpc -> Clicks`, `cpv -> Views`, `cpm -> Impressions`, `fixed_cost -> Fixed Fee`, plus default `Deliverables`. Channel entries to preserve include Television `cpt -> TARPs`, Radio/Cinema/Television `spots -> Spots`, OOH `panels -> Panels`, Magazine/Newspaper `insertions -> Insertions`, Integration/Social/OOH bonus/package wording.

## A. `computeLoadedDeliverables` Census

### Copy Count

| Container | Function name | Local copy? | Notes |
|---|---:|---:|---|
| `BVODContainer.tsx` | `computeLoadedDeliverables` | yes | rounded |
| `CinemaContainer.tsx` | none | no | uses `cinemaBurstDeliverables` helper, not a loaded wrapper of same name |
| `DigitalAudioContainer.tsx` | `computeLoadedDeliverables` | yes | reference |
| `DigitalDisplayContainer.tsx` | none | no | hydration preserves calculated value directly |
| `DigitalVideoContainer.tsx` | none | no | hydration preserves calculated value directly |
| `InfluencersContainer.tsx` | none | no | hydration preserves calculated value directly |
| `IntegrationContainer.tsx` | `computeLoadedDeliverables` | yes | raw return |
| `MagazinesContainer.tsx` | `computeLoadedDeliverables` | yes | raw return, const |
| `NewspaperContainer.tsx` | `computeLoadedDeliverables` | yes | raw return, const |
| `OOHContainer.tsx` | `computeLoadedDeliverables` | yes | rounded, no `deliverables` fallback |
| `ProgAudioContainer.tsx` | none | no | hydration preserves calculated value directly |
| `ProgBVODContainer.tsx` | none | no | hydration preserves calculated value directly |
| `ProgDisplayContainer.tsx` | none | no | hydration preserves calculated value directly |
| `ProgOOHContainer.tsx` | none | no | hydration preserves calculated value directly |
| `ProgVideoContainer.tsx` | `computeLoadedDeliverables` | yes | raw return, const |
| `RadioContainer.tsx` | `computeLoadedDeliverables` | yes | raw return |
| `SearchContainer.tsx` | none | no | hydration preserves calculated value directly |
| `SocialMediaContainer.tsx` | none | no | has separate inline hydration/reset calculation |
| `TelevisionContainer.tsx` | `computeTelevisionLoadedDeliverables` | yes, equivalent | rounded, extra TV fallbacks |
| `ProductionContainer.tsx` | none | no | out of deliverable-wrapper model |

Count: 9 wrappers across 20 containers. Distinct structural variants: 5.

### Full Wrapper Bodies

DigitalAudio reference:

```tsx
// components/media-containers/DigitalAudioContainer.tsx:98
function computeLoadedDeliverables(
  buyType: string,
  burst: any,
  budgetIncludesFees: boolean,
  feePct: number,
): number {
  const buyTypeLower = (buyType || "").toLowerCase()

  if (
    buyTypeLower === "bonus" ||
    buyTypeLower === "package_inclusions" ||
    buyTypeLower === "package"
  ) {
    return parseFloat(
      String(burst?.calculatedValue ?? burst?.deliverables ?? 0)
        .replace(/[^0-9.]/g, "")
    ) || 0
  }

  const rawBudget = parseFloat(String(burst?.budget ?? "0").replace(/[^0-9.]/g, "")) || 0
  const buyAmount = parseFloat(String(burst?.buyAmount ?? "1").replace(/[^0-9.]/g, "")) || 0
  const bt = coerceBuyTypeWithDevWarn(buyType, "DigitalAudioContainer.computeLoadedDeliverables")

  const value = computeDeliverableFromMedia({
    buyType: bt,
    rawBudget,
    buyAmount,
    budgetIncludesFees,
    feePct,
  })

  if (Number.isNaN(value)) {
    return parseFloat(
      String(burst?.calculatedValue ?? burst?.deliverables ?? 0)
        .replace(/[^0-9.]/g, "")
    ) || 0
  }

  return roundDeliverables(bt, value)
}
```

BVOD:

```tsx
// components/media-containers/BVODContainer.tsx:98
function computeLoadedDeliverables(
  buyType: string,
  burst: any,
  budgetIncludesFees: boolean,
  feePct: number,
): number {
  const buyTypeLower = (buyType || "").toLowerCase()
  if (buyTypeLower === "bonus" || buyTypeLower === "package_inclusions" || buyTypeLower === "package") {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  const rawBudget = parseFloat(String(burst?.budget ?? "0").replace(/[^0-9.]/g, "")) || 0
  const buyAmount = parseFloat(String(burst?.buyAmount ?? "1").replace(/[^0-9.]/g, "")) || 0
  const bt = coerceBuyTypeWithDevWarn(buyType, "BVODContainer.computeLoadedDeliverables")
  const value = computeDeliverableFromMedia({ buyType: bt, rawBudget, buyAmount, budgetIncludesFees, feePct })
  if (Number.isNaN(value)) {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  return roundDeliverables(bt, value)
}
```

Integration:

```tsx
// components/media-containers/IntegrationContainer.tsx:128
function computeLoadedDeliverables(
  buyType: string,
  burst: any,
  budgetIncludesFees: boolean,
  feePct: number
) {
  const buyTypeLower = (buyType || "").toLowerCase()
  if (buyTypeLower === "bonus" || buyTypeLower === "package_inclusions" || buyTypeLower === "package") {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  const rawBudget = parseFloat(String(burst?.budget ?? "0").replace(/[^0-9.]/g, "")) || 0
  const buyAmount = parseFloat(String(burst?.buyAmount ?? "1").replace(/[^0-9.]/g, "")) || 0
  const bt = coerceBuyTypeWithDevWarn(buyType, "IntegrationContainer.computeLoadedDeliverables")
  const value = computeDeliverableFromMedia({ buyType: bt, rawBudget, buyAmount, budgetIncludesFees, feePct })
  if (Number.isNaN(value)) {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  return value
}
```

Magazines:

```tsx
// components/media-containers/MagazinesContainer.tsx:301
const computeLoadedDeliverables = (
  buyType: string,
  burst: any,
  budgetIncludesFees: boolean,
  feePct: number,
) => {
  const buyTypeLower = (buyType || "").toLowerCase()
  if (buyTypeLower === "bonus" || buyTypeLower === "package_inclusions" || buyTypeLower === "package") {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  const rawBudget = parseFloat(String(burst?.budget ?? "0").replace(/[^0-9.]/g, "")) || 0
  const buyAmount = parseFloat(String(burst?.buyAmount ?? "1").replace(/[^0-9.]/g, "")) || 0
  const bt = coerceBuyTypeWithDevWarn(buyType, "MagazinesContainer.computeLoadedDeliverables")
  const value = computeDeliverableFromMedia({ buyType: bt, rawBudget, buyAmount, budgetIncludesFees, feePct })
  if (Number.isNaN(value)) {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  return value
};
```

Newspaper:

```tsx
// components/media-containers/NewspaperContainer.tsx:303
const computeLoadedDeliverables = (
  buyType: string,
  burst: any,
  budgetIncludesFees: boolean,
  feePct: number,
) => {
  const buyTypeLower = (buyType || "").toLowerCase()
  if (buyTypeLower === "bonus" || buyTypeLower === "package_inclusions" || buyTypeLower === "package") {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  const rawBudget = parseFloat(String(burst?.budget ?? "0").replace(/[^0-9.]/g, "")) || 0
  const buyAmount = parseFloat(String(burst?.buyAmount ?? "1").replace(/[^0-9.]/g, "")) || 0
  const bt = coerceBuyTypeWithDevWarn(buyType, "NewspapersContainer.computeLoadedDeliverables")
  const value = computeDeliverableFromMedia({ buyType: bt, rawBudget, buyAmount, budgetIncludesFees, feePct })
  if (Number.isNaN(value)) {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  return value
};
```

OOH:

```tsx
// components/media-containers/OOHContainer.tsx:302
function computeLoadedDeliverables(
  buyType: string,
  burst: any,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  const buyTypeLower = String(buyType || "").toLowerCase()
  if (buyTypeLower === "bonus" || buyTypeLower === "package_inclusions" || buyTypeLower === "package") {
    return parseFloat(String(burst?.calculatedValue ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  const rawBudget = parseFloat(String(burst?.budget ?? "0").replace(/[^0-9.]/g, "")) || 0
  const buyAmount = parseFloat(String(burst?.buyAmount ?? "1").replace(/[^0-9.]/g, "")) || 0
  const bt = coerceBuyTypeWithDevWarn(buyType, "OOHContainer.computeLoadedDeliverables")
  const value = computeDeliverableFromMedia({ buyType: bt, rawBudget, buyAmount, budgetIncludesFees, feePct })
  if (Number.isNaN(value)) {
    return parseFloat(String(burst?.calculatedValue ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  return roundDeliverables(bt, value)
}
```

ProgVideo:

```tsx
// components/media-containers/ProgVideoContainer.tsx:87
const computeLoadedDeliverables = (
  buyType: string,
  burst: any,
  budgetIncludesFees: boolean,
  feePct: number,
) => {
  const buyTypeLower = (buyType || "").toLowerCase()
  if (buyTypeLower === "bonus" || buyTypeLower === "package_inclusions" || buyTypeLower === "package") {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  const rawBudget = parseFloat(String(burst?.budget ?? "0").replace(/[^0-9.]/g, "")) || 0
  const buyAmount = parseFloat(String(burst?.buyAmount ?? "1").replace(/[^0-9.]/g, "")) || 0
  const bt = coerceBuyTypeWithDevWarn(buyType, "ProgVideoContainer.computeLoadedDeliverables")
  const value = computeDeliverableFromMedia({ buyType: bt, rawBudget, buyAmount, budgetIncludesFees, feePct })
  if (Number.isNaN(value)) {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  return value
}
```

Radio:

```tsx
// components/media-containers/RadioContainer.tsx:285
function computeLoadedDeliverables(
  buyType: string,
  burst: any,
  budgetIncludesFees: boolean,
  feePct: number,
) {
  const buyTypeLower = (buyType || "").toLowerCase()
  if (buyTypeLower === "bonus" || buyTypeLower === "package_inclusions" || buyTypeLower === "package") {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  const rawBudget = parseFloat(String(burst?.budget ?? "0").replace(/[^0-9.]/g, "")) || 0
  const buyAmount = parseFloat(String(burst?.buyAmount ?? "1").replace(/[^0-9.]/g, "")) || 0
  const bt = coerceBuyTypeWithDevWarn(buyType, "RadioContainer.computeLoadedDeliverables")
  const value = computeDeliverableFromMedia({ buyType: bt, rawBudget, buyAmount, budgetIncludesFees, feePct })
  if (Number.isNaN(value)) {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  return value
}
```

Television equivalent:

```tsx
// components/media-containers/TelevisionContainer.tsx:118
function computeTelevisionLoadedDeliverables(
  buyType: string,
  burst: any,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  const buyTypeLower = (buyType || "").toLowerCase()
  if (buyTypeLower === "bonus" || buyTypeLower === "package_inclusions" || buyTypeLower === "package") {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? burst?.tarps ?? burst?.spots ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  const rawBudget = parseFloat(String(burst?.budget ?? "0").replace(/[^0-9.]/g, "")) || 0
  const buyAmount = parseFloat(String(burst?.buyAmount ?? "1").replace(/[^0-9.]/g, "")) || 0
  const bt = coerceBuyTypeWithDevWarn(buyType, "TelevisionContainer.computeTelevisionLoadedDeliverables")
  const value = computeDeliverableFromMedia({ buyType: bt, rawBudget, buyAmount, budgetIncludesFees, feePct })
  if (Number.isNaN(value)) {
    return parseFloat(String(burst?.calculatedValue ?? burst?.deliverables ?? burst?.tarps ?? burst?.spots ?? 0).replace(/[^0-9.]/g, "")) || 0
  }
  return roundDeliverables(bt, value)
}
```

### Diff Table Against DigitalAudio

| Container | Declaration style | Bonus/package guard | Budget parsing | Shared primitive | Return | Fallback includes `?? burst?.deliverables` | Classification |
|---|---|---|---|---|---|---|---|
| `DigitalAudio` | `function`, `: number` | reference | reference | `computeDeliverableFromMedia` | `roundDeliverables(bt, value)` | yes | reference |
| `BVOD` | same | same | same | same | same | yes | DRIFT: only warn string differs |
| `Integration` | `function`, no return type | same | same | same | raw `value` | yes | DRIFT: rounding absent; Luke decision |
| `Magazines` | `const` arrow | same | same | same | raw `value` | yes | DRIFT: declaration style and rounding absent; Luke decision |
| `Newspaper` | `const` arrow | same | same | same | raw `value` | yes | DRIFT: declaration style, `NewspapersContainer` warning string typo, rounding absent; Luke decision |
| `OOH` | `function`, `: number` | same | same | same | `roundDeliverables(bt, value)` | no | DRIFT for missing `deliverables` fallback; OOH label rules are nuance elsewhere |
| `ProgVideo` | `const` arrow | same | same | same | raw `value` | yes | DRIFT: declaration style and rounding absent; Luke decision |
| `Radio` | `function`, no return type | same | same | same | raw `value` | yes | DRIFT: rounding absent; Luke decision |
| `Television` | `function`, `: number`, channel name | same | same | same | `roundDeliverables(bt, value)` | yes, plus `tarps`/`spots` | NUANCE for TV fallbacks; rounding split still Luke decision |

## B. Label Census

### `getDeliverablesLabel` Bodies

Found in 19 of 20 containers. Missing from `ProductionContainer.tsx`.

Identical CPC-family body appears in `BVODContainer.tsx:1029`, `DigitalAudioContainer.tsx:988`, `DigitalDisplayContainer.tsx:1088`, `DigitalVideoContainer.tsx:945`, `InfluencersContainer.tsx:829`, `ProgAudioContainer.tsx:878`, `ProgBVODContainer.tsx:869`, `ProgDisplayContainer.tsx:886`, `ProgOOHContainer.tsx:885`, `ProgVideoContainer.tsx:949`, and `SearchContainer.tsx:916`:

```tsx
const getDeliverablesLabel = useCallback((buyType: string) => {
  if (!buyType) return "Deliverables";
  switch (buyType.toLowerCase()) {
    case "cpc": return "Clicks";
    case "cpv": return "Views";
    case "cpm": return "Impressions";
    case "fixed_cost": return "Fixed Fee";
    default: return "Deliverables";
  }
}, []);
```

Radio/Cinema variant at `RadioContainer.tsx:1150` and `CinemaContainer.tsx:862`:

```tsx
const getDeliverablesLabel = useCallback((buyType: string) => {
  if (!buyType) return "Deliverables";
  switch (buyType.toLowerCase()) {
    case "spots": return "Spots";
    case "package": return "Package";
    case "cpm": return "Impressions";
    case "fixed_cost": return "Fixed Fee";
    default: return "Deliverables";
  }
}, []);
```

Integration variant at `IntegrationContainer.tsx:1009`:

```tsx
const getDeliverablesLabel = useCallback((buyType: string) => {
  if (!buyType) return "Deliverables";
  switch (buyType.toLowerCase()) {
    case "cpc": return "Clicks";
    case "cpv": return "Views";
    case "cpm": return "Impressions";
    case "fixed_cost": return "Fixed Fee";
    case "package": return "Package";
    case "package_inclusions": return "Inclusions";
    case "bonus": return "Bonus";
    default: return "Deliverables";
  }
}, []);
```

Magazines variant at `MagazinesContainer.tsx:1097`:

```tsx
const getDeliverablesLabel = useCallback((buyType: string) => {
  if (!buyType) return "Deliverables";
  switch (buyType.toLowerCase()) {
    case "cpc": return "Clicks";
    case "insertions": return "Insertions";
    case "package": return "Package";
    case "cpv": return "Views";
    case "cpm": return "Impressions";
    case "fixed_cost": return "Fixed Fee";
    default: return "Deliverables";
  }
}, []);
```

Newspaper variant at `NewspaperContainer.tsx:1109`:

```tsx
const getDeliverablesLabel = useCallback((buyType: string) => {
  if (!buyType) return "Deliverables";
  switch (buyType.toLowerCase()) {
    case "cpc": return "Clicks";
    case "cpv": return "Views";
    case "cpm": return "Impressions";
    case "fixed_cost": return "Fixed Fee";
    case "package": return "Package";
    case "insertions": return "Insertions";
    default: return "Deliverables";
  }
}, []);
```

OOH variant at `OOHContainer.tsx:965`:

```tsx
const getDeliverablesLabel = useCallback((buyType: string) => {
  if (!buyType) return "Deliverables";
  switch (buyType.toLowerCase()) {
    case "bonus": return "Bonus Deliverables";
    case "package_inclusions": return "Package Inclusions";
    case "cpc": return "Clicks";
    case "cpv": return "Views";
    case "cpm": return "Impressions";
    case "fixed_cost": return "Fixed Fee";
    case "package": return "Package";
    case "panels": return "Panels";
    default: return "Deliverables";
  }
}, []);
```

Social variant at `SocialMediaContainer.tsx:967`:

```tsx
const getDeliverablesLabel = useCallback((buyType: string) => {
  if (!buyType) return "Deliverables";
  switch (buyType.toLowerCase()) {
    case "cpc": return "Clicks";
    case "cpv": return "Views";
    case "cpm": return "Impressions";
    case "fixed_cost": return "Fixed Fee";
    case "bonus": return "Bonus";
    case "package_inclusions": return "Package Inclusions";
    default: return "Deliverables";
  }
}, []);
```

Television variant at `TelevisionContainer.tsx:1047`:

```tsx
const getDeliverablesLabel = useCallback((buyType: string) => {
  if (!buyType) return "Deliverables";
  switch (buyType.toLowerCase()) {
    case "cpt": return "TARPs";
    case "spots": return "Spots";
    case "cpm": return "Impressions";
    case "fixed_cost": return "Fixed Fee";
    case "package": return "Package";
    case "bonus": return "Bonus";
    default: return "Deliverables";
  }
}, []);
```

### `getDeliverablesLabel` Coverage Table

Abbrev columns: BVOD, Cin, DA, DD, DV, Inf, Int, Mag, News, OOH, PA, PB, PD, PO, PV, Rad, Search, Soc, TV.

| Buy type | BVOD | Cin | DA | DD | DV | Inf | Int | Mag | News | OOH | PA | PB | PD | PO | PV | Rad | Search | Soc | TV |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `cpc` | Clicks | default | Clicks | Clicks | Clicks | Clicks | Clicks | Clicks | Clicks | Clicks | Clicks | Clicks | Clicks | Clicks | Clicks | default | Clicks | Clicks | default |
| `cpv` | Views | default | Views | Views | Views | Views | Views | Views | Views | Views | Views | Views | Views | Views | Views | default | Views | Views | default |
| `cpm` | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions | Impressions |
| `fixed_cost` | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee | Fixed Fee |
| `spots` | default | Spots | default | default | default | default | default | default | default | default | default | default | default | default | default | Spots | default | default | Spots |
| `package` | default | Package | default | default | default | default | Package | Package | Package | Package | default | default | default | default | default | Package | default | default | Package |
| `package_inclusions` | default | default | default | default | default | default | Inclusions | default | default | Package Inclusions | default | default | default | default | default | default | default | Package Inclusions | default |
| `bonus` | default | default | default | default | default | default | Bonus | default | default | Bonus Deliverables | default | default | default | default | default | default | default | Bonus | Bonus |
| `insertions` | default | default | default | default | default | default | default | Insertions | Insertions | default | default | default | default | default | default | default | default | default | default |
| `panels` | default | default | default | default | default | default | default | default | default | Panels | default | default | default | default | default | default | default | default | default |
| `cpt` | default | default | default | default | default | default | default | default | default | default | default | default | default | default | default | default | default | default | TARPs |

Classification: core CPC/CPV/CPM/fixed-cost/default entries are DRIFT to share. Channel entries are NUANCE to preserve.

### `formatBuyTypeForDisplay` Bodies

Found in 14 of 20 containers: `BVODContainer.tsx:1046`, `CinemaContainer.tsx:879`, `DigitalDisplayContainer.tsx:1105`, `DigitalVideoContainer.tsx:962`, `InfluencersContainer.tsx:846`, `MagazinesContainer.tsx:1118`, `NewspaperContainer.tsx:1130`, `OOHContainer.tsx:990`, `RadioContainer.tsx:1167`, `SearchContainer.tsx:933`, `SocialMediaContainer.tsx:988`, `TelevisionContainer.tsx:1068`, `IntegrationContainer.tsx:1032`, plus same generic body in the listed generic containers.

Generic body used by `BVOD`, `Cinema`, `DigitalDisplay`, `DigitalVideo`, `Influencers`, `Magazines`, `Newspaper`, `OOH`, `Radio`, `Search`, and `SocialMedia`:

```tsx
const formatBuyTypeForDisplay = useCallback((buyType: string) => {
  if (!buyType) return "Not selected";
  switch (buyType.toLowerCase()) {
    case "cpt": return "CPT";
    case "cpm": return "CPM";
    case "cpv": return "CPV";
    case "cpc": return "CPC";
    case "spots": return "Spots";
    case "package": return "Package";
    case "bonus": return "Bonus";
    case "package_inclusions": return "Package Inclusions";
    case "fixed_cost": return "Fixed Cost";
    case "guaranteed_leads": return "Guaranteed Leads";
    case "insertions": return "Insertions";
    case "panels": return "Panels";
    case "screens": return "Screens";
    default: return buyType;
  }
}, []);
```

Integration body at `IntegrationContainer.tsx:1032`:

```tsx
const formatBuyTypeForDisplay = useCallback((buyType: string) => {
  if (!buyType) return "Not selected";
  switch (buyType.toLowerCase()) {
    case "cpm": return "CPM";
    case "cpv": return "CPV";
    case "cpc": return "CPC";
    case "package": return "Package";
    case "bonus": return "Bonus";
    case "package_inclusions": return "Package Inclusions";
    case "fixed_cost": return "Fixed Cost";
    default: return buyType;
  }
}, []);
```

Television body at `TelevisionContainer.tsx:1068`:

```tsx
const formatBuyTypeForDisplay = useCallback((buyType: string) => {
  if (!buyType) return "Not selected";
  switch (buyType.toLowerCase()) {
    case "cpt": return "CPT";
    case "cpm": return "CPM";
    case "cpv": return "CPV";
    case "cpc": return "CPC";
    case "spots": return "Spots";
    case "package": return "Package";
    case "bonus": return "Bonus";
    case "fixed_cost": return "Fixed Cost";
    case "guaranteed_leads": return "Guaranteed Leads";
    case "insertions": return "Insertions";
    case "panels": return "Panels";
    case "screens": return "Screens";
    default: return buyType;
  }
}, []);
```

Missing `formatBuyTypeForDisplay`: `DigitalAudio`, `ProgAudio`, `ProgBVOD`, `ProgDisplay`, `ProgOOH`, `ProgVideo`, `Production`.

### `formatBuyTypeForDisplay` Coverage Table

| Buy type | Generic 11 | Integration | Television |
|---|---|---|---|
| empty | Not selected | Not selected | Not selected |
| `cpc` | CPC | CPC | CPC |
| `cpv` | CPV | CPV | CPV |
| `cpm` | CPM | CPM | CPM |
| `package` | Package | Package | Package |
| `bonus` | Bonus | Bonus | Bonus |
| `fixed_cost` | Fixed Cost | Fixed Cost | Fixed Cost |
| `package_inclusions` | Package Inclusions | Package Inclusions | default |
| `cpt` | CPT | default | CPT |
| `spots` | Spots | default | Spots |
| `guaranteed_leads` | Guaranteed Leads | default | Guaranteed Leads |
| `insertions` | Insertions | default | Insertions |
| `panels` | Panels | default | Panels |
| `screens` | Screens | default | Screens |
| default | buyType | buyType | buyType |

Classification: identical display strings are DRIFT to share. Entries that are only valid for some channels are NUANCE to preserve by channel.

## C. Standard-Mode `handleValueChange` Calc Site

| Container | Calc path | File:line | Classification |
|---|---|---:|---|
| `BVOD` | direct `computeDeliverableFromMedia`, then `roundDeliverables` | `components/media-containers/BVODContainer.tsx:948` | uniform rounded direct |
| `Cinema` | local `cinemaBurstDeliverables` helper | `components/media-containers/CinemaContainer.tsx:776` | exception: local helper |
| `DigitalAudio` | direct `computeDeliverableFromMedia`, then `roundDeliverables` | `components/media-containers/DigitalAudioContainer.tsx:892` | uniform rounded direct |
| `DigitalDisplay` | direct `computeDeliverableFromMedia` raw | `components/media-containers/DigitalDisplayContainer.tsx:997` | uniform direct, no rounding |
| `DigitalVideo` | direct `computeDeliverableFromMedia` raw | `components/media-containers/DigitalVideoContainer.tsx:854` | uniform direct, no rounding |
| `Influencers` | direct `computeDeliverableFromMedia` raw | `components/media-containers/InfluencersContainer.tsx:765` | uniform direct, no rounding |
| `Integration` | direct `computeDeliverableFromMedia` raw | `components/media-containers/IntegrationContainer.tsx:918` | uniform direct, no rounding |
| `Magazines` | direct `computeDeliverableFromMedia` raw | `components/media-containers/MagazinesContainer.tsx:1006` | uniform direct, no rounding |
| `Newspaper` | direct `computeDeliverableFromMedia` raw | `components/media-containers/NewspaperContainer.tsx:1018` | uniform direct, no rounding |
| `OOH` | direct `computeDeliverableFromMedia`, then `roundDeliverables` | `components/media-containers/OOHContainer.tsx:858` | uniform rounded direct |
| `ProgAudio` | direct `computeDeliverableFromMedia` raw | `components/media-containers/ProgAudioContainer.tsx:787` | uniform direct, no rounding |
| `ProgBVOD` | direct `computeDeliverableFromMedia` raw | `components/media-containers/ProgBVODContainer.tsx:778` | uniform direct, no rounding |
| `ProgDisplay` | direct `computeDeliverableFromMedia` raw | `components/media-containers/ProgDisplayContainer.tsx:795` | uniform direct, no rounding |
| `ProgOOH` | direct `computeDeliverableFromMedia` raw | `components/media-containers/ProgOOHContainer.tsx:794` | uniform direct, no rounding |
| `ProgVideo` | direct `computeDeliverableFromMedia` raw | `components/media-containers/ProgVideoContainer.tsx:857` | uniform direct, no rounding |
| `Radio` | direct `computeDeliverableFromMedia` raw | `components/media-containers/RadioContainer.tsx:1060` | uniform direct, no rounding |
| `Search` | direct `computeDeliverableFromMedia` raw | `components/media-containers/SearchContainer.tsx:840` | uniform direct, no rounding |
| `SocialMedia` | direct `computeDeliverableFromMedia` raw in `handleValueChange` | `components/media-containers/SocialMediaContainer.tsx:876` | standard path uniform; separate hydration/reset inline exceptions |
| `Television` | no deliverable compute in `handleValueChange`; TARPs direct input | `components/media-containers/TelevisionContainer.tsx:965` | NUANCE/exception |
| `Production` | no deliverable wrapper model; amount/cost model | `components/media-containers/ProductionContainer.tsx:500` | out of scope model |

Inline deliverable formulas found outside standard handler:

```tsx
// components/media-containers/SocialMediaContainer.tsx:653
// Calculate calculatedValue based on buyType, budget, and buyAmount
let calculatedValue = 0;
```

```tsx
// components/media-containers/SocialMediaContainer.tsx:714
// Recalculate calculatedValue for all bursts after form reset
// This ensures deliverables are calculated correctly
let calculatedValue = 0;
```

## D. Shared Display Component

Relevant shared component code:

```tsx
// components/media-containers/burst-calculated-fields.tsx:129
/** Column header text aligned with `CpcFamilyBurstCalculatedField` labels (no new copy). */
export function getCpcFamilyBurstCalculatedColumnLabel(
  variant: CpcFamilyVariant,
  buyType: string
): string {
  if (buyType === "bonus" || buyType === "package_inclusions") return "Bonus Deliverables"
  return titleForVariant(variant, buyType)
}
```

```tsx
// components/media-containers/burst-calculated-fields.tsx:187
/** CPC/CPV/CPM-style burst calculated readouts; hooks run at component top level (not inside FormField render callbacks). */
export function CpcFamilyBurstCalculatedField<T extends FieldValues>({
  form,
  itemsKey,
  lineItemIndex,
  burstIndex,
  field,
  feePct,
  netMedia: _deprecatedNetMedia,
  variant = "cpcCpvCpm",
  inputClassName = "w-full min-w-[8rem] h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground",
  bonusInputClassName,
}: CpcFamilyProps<T>) {
  const buyType = useWatch({ control: form.control, name: `${itemsKey}.${lineItemIndex}.buyType` as never }) as unknown as string
  const budgetValue = useWatch({ control: form.control, name: `${itemsKey}.${lineItemIndex}.bursts.${burstIndex}.budget` as never })
  const buyAmountValue = useWatch({ control: form.control, name: `${itemsKey}.${lineItemIndex}.bursts.${burstIndex}.buyAmount` as never })
  const budgetIncludesFees = useWatch({ control: form.control, name: `${itemsKey}.${lineItemIndex}.budgetIncludesFees` as never })
  const calculatedValue = useMemo(() => {
    if (buyType === "bonus" || buyType === "package_inclusions") return "0"
    if (buyType === "package") return String(field.value ?? "0")
    const rawBudget = parseFloat(String(budgetValue)?.replace(/[^0-9.]/g, "") || "0")
    const buyAmount = parseFloat(String(buyAmountValue)?.replace(/[^0-9.]/g, "") || "1")
    const bt = coerceBuyTypeWithDevWarn(buyType, "CpcFamilyBurstCalculatedField")
    const value = computeDeliverableFromMedia({ buyType: bt, rawBudget, buyAmount, budgetIncludesFees: !!budgetIncludesFees, feePct })
    if (Number.isNaN(value)) return "0"
    return String(value)
  }, [budgetValue, buyAmountValue, buyType, budgetIncludesFees, feePct, field.value])
  return <Input type="text" value={displayCalculated(calculatedValue)} readOnly />
}
```

Import/render coverage:

| Container | Shared calculated-column UI |
|---|---|
| `BVOD` | imports and renders `CpcFamilyBurstCalculatedField` |
| `Cinema` | imports and renders `CpcFamilyBurstCalculatedField` |
| `DigitalAudio` | imports and renders `CpcFamilyBurstCalculatedField` |
| `DigitalDisplay` | imports and renders `CpcFamilyBurstCalculatedField` |
| `DigitalVideo` | imports and renders `CpcFamilyBurstCalculatedField` |
| `Influencers` | imports and renders `CpcFamilyBurstCalculatedField` |
| `Integration` | imports and renders `CpcFamilyBurstCalculatedField` |
| `Magazines` | imports and renders `CpcFamilyBurstCalculatedField` |
| `Newspaper` | imports and renders `CpcFamilyBurstCalculatedField` |
| `OOH` | imports and renders `CpcFamilyBurstCalculatedField` |
| `ProgAudio` | imports and renders `CpcFamilyBurstCalculatedField` |
| `ProgBVOD` | imports and renders `CpcFamilyBurstCalculatedField` |
| `ProgDisplay` | imports and renders `CpcFamilyBurstCalculatedField` |
| `ProgOOH` | imports and renders `CpcFamilyBurstCalculatedField` |
| `ProgVideo` | imports and renders `CpcFamilyBurstCalculatedField` |
| `Radio` | imports and renders `CpcFamilyBurstCalculatedField` |
| `Search` | imports and renders `CpcFamilyBurstCalculatedField` |
| `SocialMedia` | imports and renders `SocialLineBurstCalculatedField`, not `CpcFamilyBurstCalculatedField` |
| `Television` | imports and renders `TelevisionBurstTarpsField`, not `CpcFamilyBurstCalculatedField` |
| `Production` | bespoke cost/amount UI, no shared calculated-column component |

## Wrapper Drift Readiness

- `computeLoadedDeliverables`: 9 copies, 5 distinct variants, rounding split yes.
- `getDeliverablesLabel`: common core size 4 explicit entries plus default; channels with extra entries: `Cinema`, `Integration`, `Magazines`, `Newspaper`, `OOH`, `Radio`, `SocialMedia`, `Television`.
- `formatBuyTypeForDisplay`: common core size 6 explicit entries plus empty/default handling; channels with extra entries: generic 11 have `cpt`, `spots`, `guaranteed_leads`, `insertions`, `panels`, `screens`, while `Television` omits `package_inclusions` and `Integration` omits the broader channel entries.
- Standard calc path: not fully uniform. Exceptions: `Cinema` uses local helper, `Television` does not compute in `handleValueChange`, `Production` is out of model; `SocialMedia` has inline hydration/reset calculations outside standard `handleValueChange`.
- Calculated-column UI: mostly shared via `burst-calculated-fields`; exceptions: `SocialMedia` uses shared social-specific field, `Television` uses shared television-specific field, `Production` is bespoke/out of model.
