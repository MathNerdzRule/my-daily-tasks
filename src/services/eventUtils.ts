export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(fw:|re:)\s*/i, '')
    .replace(/microsoft teams meeting|teams meeting/gi, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
