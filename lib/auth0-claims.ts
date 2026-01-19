const ROLE_CLAIMS = ['https://assembledview.com/roles', 'https://assembledview.com.au/roles'];
const CLIENT_CLAIMS = ['https://assembledview.com/client', 'https://assembledview.com.au/client'];
const CLIENT_SLUG_CLAIMS = ['https://assembledview.com/client_slug', 'https://assembledview.com.au/client_slug'];
const CLIENT_SLUGS_CLAIMS = ['https://assembledview.com/client_slugs', 'https://assembledview.com.au/client_slugs'];

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string').map((v) => v.toLowerCase());
  }

  if (typeof value === 'string' && value.trim() !== '') {
    return [value.trim().toLowerCase()];
  }

  return [];
};

const slugify = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const normalizeSlugArray = (value: unknown): string[] => {
  const normalized = normalizeStringArray(value)
    .map((v) => slugify(v))
    .filter((v) => v !== '');
  return Array.from(new Set(normalized));
};

export const getRoles = (user: Record<string, unknown> = {}): string[] => {
  for (const claim of ROLE_CLAIMS) {
    const value = (user as Record<string, unknown>)[claim];
    const normalized = normalizeStringArray(value);
    if (normalized.length) return normalized;
  }
  return [];
};

export const getAllowedClientSlugs = (user: Record<string, unknown> = {}): string[] => {
  for (const claim of CLIENT_SLUGS_CLAIMS) {
    const value = (user as Record<string, unknown>)[claim];
    const slugs = normalizeSlugArray(value);
    if (slugs.length) return slugs;
  }

  for (const claim of CLIENT_SLUG_CLAIMS) {
    const value = (user as Record<string, unknown>)[claim];
    const slugs = normalizeSlugArray(value);
    if (slugs.length) return slugs;
  }

  for (const claim of CLIENT_CLAIMS) {
    const value = (user as Record<string, unknown>)[claim];
    const slugs = normalizeSlugArray(value);
    if (slugs.length) return slugs;
  }

  return [];
};

export const getClientSlug = (user: Record<string, unknown> = {}): string | undefined => {
  const allowed = getAllowedClientSlugs(user);
  return allowed[0];
};

export { ROLE_CLAIMS, CLIENT_CLAIMS, CLIENT_SLUG_CLAIMS, CLIENT_SLUGS_CLAIMS };
