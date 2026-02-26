let cachedClients: any[] | null = null
let cacheExpiresAt = 0

export function getCachedClients(): any[] | null {
  if (cachedClients && cacheExpiresAt > Date.now()) {
    return cachedClients
  }
  return null
}

export function setCachedClients(data: any[], ttlMs: number) {
  cachedClients = data
  cacheExpiresAt = Date.now() + ttlMs
}

export function invalidateClientsCache() {
  cachedClients = null
  cacheExpiresAt = 0
}

