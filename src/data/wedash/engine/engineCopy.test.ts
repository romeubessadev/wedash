import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL(".", import.meta.url));
const copy = fileURLToPath(new URL("../../../../supabase/functions/_shared/engine/", import.meta.url));

describe("supabase/functions/_shared/engine", () => {
  it("is a byte-for-byte copy of the engine (run `npm run sync:engine`)", () => {
    const sources = readdirSync(src).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort();
    expect(sources.length).toBeGreaterThan(0);
    expect(readdirSync(copy).sort()).toEqual(sources);
    for (const f of sources) expect(readFileSync(copy + f).equals(readFileSync(src + f)), f).toBe(true);
  });
});
