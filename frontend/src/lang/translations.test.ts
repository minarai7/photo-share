import { describe, expect, it } from "vitest";
import { en, ja, translations } from ".";

type Tree = { [key: string]: unknown };

function leaves(obj: Tree, prefix = ""): [string, unknown][] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? leaves(v as Tree, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, unknown]],
  );
}

// TypeScript already forces both dictionaries to have every key. These checks
// cover what the type system can't: empty strings, functions that return
// nothing, and a language accidentally aliased to the other.
describe("translations", () => {
  it("registers every language", () => {
    expect(Object.keys(translations).sort()).toEqual(["en", "ja"]);
    expect(translations.ja).not.toBe(translations.en);
  });

  it.each([
    ["en", en],
    ["ja", ja],
  ])("%s has no empty strings and every function returns text", (_, dict) => {
    for (const [key, value] of leaves(dict as unknown as Tree)) {
      if (typeof value === "function") {
        const out = (value as (...args: unknown[]) => unknown)("sample", 2);
        expect(typeof out === "string" && out.trim().length > 0, `${key}() returned ${String(out)}`).toBe(true);
      } else {
        expect(typeof value === "string" && value.trim().length > 0, `${key} is empty`).toBe(true);
      }
    }
  });

  it("en and ja have the same keys with the same value kinds", () => {
    const kinds = (d: object) => Object.fromEntries(leaves(d as Tree).map(([k, v]) => [k, typeof v]));
    expect(kinds(ja)).toEqual(kinds(en));
  });
});
