/* Token substitution for the template fields that DO reach the invoice:
 * the header's meta rows and the totals rows. A value like "{{total}}" is
 * replaced with the real figure; anything else is printed literally.
 *
 * Deliberately not a template engine — a fixed vocabulary, one regex, and an
 * unknown token is left visible so a typo shows up instead of blanking out.
 * ponytail: no expressions, no filters. Add them only if a real invoice needs one. */

export const META_TOKENS = ["number", "date", "due", "status", "customer", "supplier"] as const;
export const TOTAL_TOKENS = ["subtotal", "discount", "tax", "taxRate", "total", "paid", "balance"] as const;

const RE = /\{\{\s*(\w+)\s*\}\}/g;
// A separate non-global regex for hasToken: a `/g` regex's .test() advances
// (and depends on) lastIndex across calls, so reusing RE here would make
// repeated calls on the same string alternate true/false.
const RE_TEST = /\{\{\s*\w+\s*\}\}/;

/** Does this string ask for invoice data? Templates saved before tokens existed
 * hold literal samples ("INV-001654"), and must keep rendering the computed
 * standard rows rather than printing that sample onto every invoice. */
export function hasToken(s: string): boolean {
  return RE_TEST.test(s || "");
}

export function fillTokens(s: string, ctx: Record<string, string>): string {
  return (s || "").replace(RE, (whole, key: string) => (key in ctx ? ctx[key] : whole));
}

/** Totals rows that today's renderer only shows when non-zero. */
export const HIDE_WHEN_ZERO: ReadonlySet<string> = new Set(["tax", "paid"]);

/** The token name, if this string references exactly one — "{{paid}}" and
 * "-{{paid}}" both qualify, "{{a}} of {{b}}" doesn't. Lets a zero-value token
 * hide its whole row (e.g. a "Paid" line) even with surrounding text like a
 * minus sign or a currency-less percent suffix. */
export function singleToken(s: string): string | null {
  const matches = [...(s || "").matchAll(RE)];
  return matches.length === 1 ? matches[0][1] : null;
}
