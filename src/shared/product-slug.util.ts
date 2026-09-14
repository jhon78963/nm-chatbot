/** Aligned with libs/common and nm-ecommerce product slug format. */

export function slugifyProductName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

export function buildProductSlug(name: string, id: string): string {
  const base = slugifyProductName(name);
  const suffix = id.replace(/-/g, '').slice(0, 8).toLowerCase();

  if (!base) {
    return id;
  }

  return `${base}-${suffix}`;
}

export function buildProductUrl(
  storeUrl: string,
  product: { id: string; name: string },
): string {
  const base = storeUrl.replace(/\/$/, '');
  return `${base}/producto/${buildProductSlug(product.name, product.id)}`;
}
