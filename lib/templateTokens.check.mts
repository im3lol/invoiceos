/* Runnable check for template token substitution: `npm run check`. */
import assert from "node:assert/strict";
import { HIDE_WHEN_ZERO, fillTokens, hasToken, singleToken } from "./templateTokens.ts";

// hasToken must give the same answer on repeat calls against the same string —
// a /g regex's .test() alternates true/false across calls if reused carelessly.
const s = "Tax ({{taxRate}}%)";
assert.equal(hasToken(s), true);
assert.equal(hasToken(s), true);
assert.equal(hasToken(s), true);
assert.equal(hasToken("Sub Total"), false);
assert.equal(hasToken("Sub Total"), false);

// substitution: known tokens replaced, unknown ones left visible (not blanked)
assert.equal(fillTokens("{{total}} due by {{due}}", { total: "E£ 100.00" }), "E£ 100.00 due by {{due}}");
assert.equal(fillTokens("Sub Total", {}), "Sub Total");

// single-token detection tolerates a prefix/suffix, rejects multi-token strings
assert.equal(singleToken("{{paid}}"), "paid");
assert.equal(singleToken("-{{paid}}"), "paid");
assert.equal(singleToken("{{taxRate}}%"), "taxRate");
assert.equal(singleToken("{{a}} of {{b}}"), null);
assert.equal(singleToken("no tokens here"), null);

assert.deepEqual([...HIDE_WHEN_ZERO], ["tax", "paid"]);

console.log("templateTokens: all checks passed");
