/** Formats integer cents the way the shop displays them, e.g. 2499 -> "$24.99". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Parses a displayed price such as "$1,234.50" back into integer cents. */
export function parsePriceToCents(text: string): number {
  const cleaned = text.replace(/[^0-9.]/g, '');
  return Math.round(Number(cleaned) * 100);
}
