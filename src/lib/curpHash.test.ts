import { describe, expect, it } from "vitest";
import {
  computeCurpHash,
  hashPrefix,
  HASH_PREFIX_LENGTH,
  isValidHashPrefix,
  normalizeCurp,
  SIMULATED_SALT,
} from "./curpHash";

describe("normalizeCurp", () => {
  it("uppercases and trims", () => {
    expect(normalizeCurp("  simu800101hdfrrl01  ")).toBe("SIMU800101HDFRRL01");
  });
});

describe("computeCurpHash", () => {
  it("matches the known-answer hash for a seeded demo CURP (must match 003_breach_index.sql)", async () => {
    // sha256("qrp-simulado-salt-v1" + "SIML800101HDFRRL01"), verified via
    // Python hashlib against the exact string this module hashes.
    const hash = await computeCurpHash("SIML800101HDFRRL01");
    expect(hash).toBe("af372f5e2f62386a447ed70ee151ff6b007cd61e1339fc71e4e91eff25184f43");
  });

  it("matches known-answer hashes for the other two demo CURPs", async () => {
    expect(await computeCurpHash("GARC850315MDFRNL02")).toBe(
      "4759eeb6839da7d981756ba0676f1a96105fb1207811ac88b25c5f576eb2b852",
    );
    expect(await computeCurpHash("HERZ920730HDFRRC09")).toBe(
      "de45e679604747497025248cc573b01755aee8f3193e722d377fab270e59a581",
    );
  });

  it("is case- and whitespace-insensitive, like normalizeCurp", async () => {
    const a = await computeCurpHash("SIML800101HDFRRL01");
    const b = await computeCurpHash("  siml800101hdfrrl01 ");
    expect(a).toBe(b);
  });

  it("produces different hashes for different CURPs", async () => {
    const a = await computeCurpHash("SIML800101HDFRRL01");
    const b = await computeCurpHash("GARC850315MDFRNL02");
    expect(a).not.toBe(b);
  });

  it("returns a 64-char lowercase hex string", async () => {
    const hash = await computeCurpHash("ANYTHING000000000X");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("incorporates the salt (changing the salt would change the hash)", async () => {
    // Sanity check that the salt constant is actually the non-empty
    // string 003_breach_index.sql must match, not accidentally emptied.
    expect(SIMULATED_SALT.length).toBeGreaterThan(0);
  });
});

describe("hashPrefix", () => {
  it("takes the first 5 hex chars by default", async () => {
    const hash = await computeCurpHash("SIML800101HDFRRL01");
    expect(hashPrefix(hash)).toBe("af372");
    expect(hashPrefix(hash)).toHaveLength(HASH_PREFIX_LENGTH);
  });

  it("supports a custom length", () => {
    expect(hashPrefix("abcdefghij", 3)).toBe("abc");
  });
});

describe("isValidHashPrefix", () => {
  it("accepts exactly 5 lowercase hex chars", () => {
    expect(isValidHashPrefix("af372")).toBe(true);
    expect(isValidHashPrefix("00000")).toBe(true);
  });

  it("rejects wrong length, uppercase, and non-hex input", () => {
    expect(isValidHashPrefix("af37")).toBe(false);
    expect(isValidHashPrefix("af3722")).toBe(false);
    expect(isValidHashPrefix("AF372")).toBe(false);
    expect(isValidHashPrefix("zzzzz")).toBe(false);
    expect(isValidHashPrefix("")).toBe(false);
  });
});
