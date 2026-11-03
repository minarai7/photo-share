import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "./getApiErrorMessage";
import { en, ja } from "../lang";

// Cross-stack guardrail: every error code the Go backend can send must have a
// translated message in both languages. If you add `Code: "new_code"` to a
// handler, add a case to getApiErrorMessage.ts and keys to en.ts / ja.ts.

const backendDir = resolve(__dirname, "../../../backend/internal");

function goFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "gen" || name === "testutil" ? [] : goFiles(full);
    return name.endsWith(".go") && !name.endsWith("_test.go") ? [full] : [];
  });
}

function backendErrorCodes(): string[] {
  const codes = new Set<string>();
  for (const file of goFiles(backendDir)) {
    for (const m of readFileSync(file, "utf8").matchAll(/Code:\s*"([a-z0-9_]+)"/g)) {
      codes.add(m[1]);
    }
  }
  return [...codes].sort();
}

describe("backend error codes", () => {
  const codes = backendErrorCodes();

  it("are discoverable from the Go source", () => {
    // If this drops to zero the regex no longer matches how handlers build errors.
    expect(codes.length).toBeGreaterThan(10);
    expect(codes).toContain("post_not_found");
  });

  it.each(codes)("%s has a translation in en and ja", (code) => {
    expect(getApiErrorMessage(code, en), `en missing ${code}`).toBeTruthy();
    expect(getApiErrorMessage(code, ja), `ja missing ${code}`).toBeTruthy();
  });

  it("unknown codes fall through so callers can use a fallback", () => {
    expect(getApiErrorMessage("definitely_not_a_code", en)).toBeUndefined();
  });
});
