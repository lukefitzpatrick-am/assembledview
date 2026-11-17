/**
 * The plan form's channels by billing key, with the form flag that turns each
 * on (B52, S33 A). Both plan pages map their channel state through this, so a
 * record of channel state is complete by type.
 */
const PLAN_CHANNEL_FORM_FLAG = {
  television: "mp_television",
  radio: "mp_radio",
  newspaper: "mp_newspaper",
  magazines: "mp_magazines",
  ooh: "mp_ooh",
  cinema: "mp_cinema",
  digiDisplay: "mp_digidisplay",
  digiAudio: "mp_digiaudio",
  digiVideo: "mp_digivideo",
  bvod: "mp_bvod",
  integration: "mp_integration",
  production: "mp_production",
  search: "mp_search",
  socialMedia: "mp_socialmedia",
  progDisplay: "mp_progdisplay",
  progVideo: "mp_progvideo",
  progBvod: "mp_progbvod",
  progAudio: "mp_progaudio",
  progOoh: "mp_progooh",
  influencers: "mp_influencers",
} as const

type PlanChannelKey = keyof typeof PLAN_CHANNEL_FORM_FLAG

/** One value per channel: a missing channel is a type error. */
export type PlanChannelRecord<T> = Record<PlanChannelKey, T>
