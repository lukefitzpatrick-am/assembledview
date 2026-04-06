import type { GroupedLineItemForKPI } from './groupLineItemsForKPI'

export type PublisherMappingResult = {
  publisher: string
  bidStrategy: string
  label: string
}

// Works with both raw LineItem (camelCase) and Xano-format items (snake_case).
// item is typed as any because containers emit two different shapes.
export function extractKPIKeys(
  item: GroupedLineItemForKPI | Record<string, any>,
  mediaType: string
): PublisherMappingResult {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const v = (item as any)[k]
      if (v && String(v).trim()) return String(v).trim()
    }
    return ''
  }

  let publisher: string
  switch (mediaType) {
    case 'search':
    case 'socialMedia':
    case 'progDisplay':
    case 'progVideo':
    case 'progBvod':
    case 'progAudio':
    case 'progOoh':
    case 'integration':
    case 'influencers':
    case 'production':
      publisher = get('platform', 'site')
      break
    case 'digiDisplay':
    case 'digiAudio':
    case 'digiVideo':
    case 'bvod':
      publisher = get('site', 'platform', 'network')
      break
    case 'television':
    case 'radio':
    case 'ooh':
    case 'cinema':
      publisher = get('network', 'station', 'platform')
      break
    case 'newspaper':
    case 'magazines':
      publisher = get('network', 'title', 'platform')
      break
    default:
      publisher = get('platform', 'network', 'site')
  }

  const bidStrategy = get(
    'bidStrategy', 'bid_strategy',
    'buyType', 'buy_type',
    'targeting', 'creative_targeting', 'creativeTargeting'
  )

  const label = get(
    'creative', 'targeting', 'creativeTargeting', 'creative_targeting',
    'title', 'placement', 'station', 'platform', 'network'
  ) || 'Line Item'

  return {
    publisher: publisher.toLowerCase().trim(),
    bidStrategy: bidStrategy.toLowerCase().trim(),
    label,
  }
}
