# SendGrid dynamic template — Daily pacing summary

Build this template in the SendGrid UI and set **`SENDGRID_PACING_TEMPLATE_ID`** to the template id.

Dynamic data uses **exactly** the field names returned by `buildPacingSummaryPayload` in `lib/email/pacing-summary-payload.ts`.

## Subject

```
Pacing summary — {{critical_count}} critical, {{warning_count}} warning
```

## Preheader (optional)

Use `date_label` and `total_active_line_items` for a short preheader line if your template supports it.

## Variables (root)

| Variable | Type | Description |
|----------|------|-------------|
| `user_first_name` | string | Greeting name |
| `date_label` | string | e.g. `Tuesday 7 April 2026` (Melbourne) |
| `total_active_line_items` | number | Line items in scope (Snowflake view) |
| `status_counts` | object | See below |
| `critical_count` | number | From alert rows |
| `warning_count` | number | From alert rows |
| `clients` | array | Per-client blocks |
| `manage_url` | string | Full URL to pacing settings |
| `unsubscribe_url` | string | Full URL (e.g. settings + hash) |

### `status_counts`

Object with numeric fields (may be zero):

- `on_track`
- `slightly_under`
- `slightly_over`
- `under_pacing`
- `over_pacing`
- `no_delivery`

Use as small pills or a compact grid in the header next to the agency logo.

## `clients[]`

Each element:

| Field | Type |
|-------|------|
| `client_name` | string |
| `line_items` | array |

### `clients[].line_items[]`

| Field | Type | Notes |
|-------|------|--------|
| `label` | string | Line item label |
| `media_type` | string | |
| `status` | string | Pacing status |
| `severity` | string | `critical` / `warning` / `info` |
| `variance_pct_label` | string | e.g. `+18.4%` or `-22.1%` or `—` |
| `budget_label` | string | AUD, e.g. `$12,500` |
| `spend_to_date_label` | string | AUD |
| `required_daily_label` | string | e.g. `$280/day` or `—` |
| `deep_link` | string | HTTPS URL to line item in app |

Sort order is already **severity (critical first)** then **highest absolute variance**. Clients are sorted **alphabetically** by `client_name`.

## Layout

- **Mobile-first** single column.
- **Header:** logo, `date_label`, pills for `status_counts` and/or headline counts.
- **Body:** for each `client_name`, a section title then a **table** (or stacked cards on narrow screens) for `line_items`: status pill, `variance_pct_label`, `required_daily_label`, primary CTA button using `deep_link` (“Open in AssembledView”).
- **Footer:** link `manage_url` (“Manage alerts”), link `unsubscribe_url`, plus a **plain-text fallback** block repeating key counts and URLs.

## Empty states

- `clients` may be an **empty array** when there are no matching alerts but the user has **`send_when_no_alerts`** enabled — still show aggregates (`total_active_line_items`, `status_counts`).

## Testing

Use **SendGrid test data** with the JSON shape above, or trigger **`POST`** `/api/pacing/send-daily-summary?subscription_id=<id>&test=true` from an **admin** session (pacing settings → “Send test now”).

Production cron (Vercel) calls the same path with **`GET`** at `20:30` UTC; authenticate with the **`CRON_SECRET`** header (`x-cron-secret` or `Authorization: Bearer ...`).
