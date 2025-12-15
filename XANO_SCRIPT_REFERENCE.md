# Xano Script Reference for media_plan_versions Endpoint

## Issue
The Xano endpoint `/media_plan_versions` is returning "Unable to locate input: client_name" because the `input` block doesn't explicitly declare input fields.

## Required Xano Script Structure

The Xano script must explicitly declare all input fields in the `input` block. Here's the correct structure:

```xano
query media_plan_versions verb=POST {
  input {
    media_plan_master_id: integer
    version_number: integer
    mba_number: string
    campaign_name: string
    campaign_status: string
    campaign_start_date: datetime
    campaign_end_date: datetime
    brand: string
    client_name: string
    client_contact: string
    po_number: string
    mp_campaignbudget: number
    fixed_fee: boolean
    mp_television: boolean
    mp_radio: boolean
    mp_newspaper: boolean
    mp_magazines: boolean
    mp_ooh: boolean
    mp_cinema: boolean
    mp_digidisplay: boolean
    mp_digiaudio: boolean
    mp_digivideo: boolean
    mp_bvod: boolean
    mp_integration: boolean
    mp_search: boolean
    mp_socialmedia: boolean
    mp_progdisplay: boolean
    mp_progvideo: boolean
    mp_progbvod: boolean
    mp_progaudio: boolean
    mp_progooh: boolean
    mp_influencers: boolean
    billingSchedule: json
    created_at: integer
  }
  stack {
    db.add media_plan_versions {
      data = {
        media_plan_master_id: $input.media_plan_master_id
        version_number      : $input.version_number
        mba_number          : $input.mba_number
        campaign_name       : $input.campaign_name
        campaign_status     : $input.campaign_status
        campaign_start_date : $input.campaign_start_date
        campaign_end_date   : $input.campaign_end_date
        brand               : $input.brand
        mp_client_name      : $input.client_name
        client_contact      : $input.client_contact
        po_number           : $input.po_number
        mp_campaignbudget   : $input.mp_campaignbudget
        fixed_fee           : $input.fixed_fee
        mp_television       : $input.mp_television
        mp_radio            : $input.mp_radio
        mp_newspaper        : $input.mp_newspaper
        mp_magazines        : $input.mp_magazines
        mp_ooh              : $input.mp_ooh
        mp_cinema           : $input.mp_cinema
        mp_digidisplay      : $input.mp_digidisplay
        mp_digiaudio        : $input.mp_digiaudio
        mp_digivideo        : $input.mp_digivideo
        mp_bvod             : $input.mp_bvod
        mp_integration      : $input.mp_integration
        mp_search           : $input.mp_search
        mp_socialmedia      : $input.mp_socialmedia
        mp_progdisplay      : $input.mp_progdisplay
        mp_progvideo        : $input.mp_progvideo
        mp_progbvod         : $input.mp_progbvod
        mp_progaudio        : $input.mp_progaudio
        mp_progooh          : $input.mp_progooh
        mp_influencers      : $input.mp_influencers
        billingSchedule     : $input.billingSchedule
        created_at          : "now"
      }
    } as $model
  }
  response = $model
}
```

## Key Points

1. **Remove `dblink` from input block**: The current script has `input { dblink { table = "media_plan_versions" } }` which prevents Xano from parsing JSON body fields.

2. **Explicit field declarations**: All input fields must be explicitly declared with their types (string, integer, boolean, datetime, json).

3. **Field mapping**: The `client_name` input field maps to `mp_client_name` in the database (line: `mp_client_name: $input.client_name`).

4. **Created_at handling**: Use `"now"` instead of `$input.created_at` if you want Xano to set the timestamp automatically, or keep `$input.created_at` if the frontend sends it.

## Frontend Payload Structure

The frontend sends the following payload structure (verified in `app/mediaplans/create/page.tsx`):

```json
{
  "media_plan_master_id": 67,
  "version_number": 1,
  "mba_number": "krusty002",
  "campaign_name": "brand campaign",
  "campaign_status": "approved",
  "campaign_start_date": "2025-12-10T02:34:48.404Z",
  "campaign_end_date": "2025-12-30T13:00:00.000Z",
  "brand": "brand 2",
  "client_name": "Krusty Krab",
  "client_contact": "Mr Krabs",
  "po_number": "123456",
  "mp_campaignbudget": 20000,
  "fixed_fee": false,
  "mp_television": false,
  "mp_radio": true,
  // ... all other boolean media type flags ...
  "billingSchedule": [...],
  "created_at": 1765334153154
}
```

## Testing

After updating the Xano script:
1. Test creating a new media plan version
2. Verify `client_name` is correctly saved as `mp_client_name` in the database
3. Check that all other fields are properly mapped

