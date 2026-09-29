import { describe, expect, it } from "vitest";
import { buildNoticeUserPrompt, NOTICE_MODEL, NOTICE_SYSTEM_PROMPT } from "./noticePrompt";

describe("buildNoticeUserPrompt", () => {
  it("includes the record count formatted with es-MX thousands separators", () => {
    expect(buildNoticeUserPrompt(["CURP"], 500000)).toContain("500,000");
  });

  it("joins multiple data types", () => {
    const prompt = buildNoticeUserPrompt(["CURP", "Teléfono"], 100);
    expect(prompt).toContain("CURP, Teléfono");
  });

  it("falls back to a placeholder when given no data types", () => {
    // draftNotice() refuses to call the model in this case (see actions.ts),
    // but the prompt builder itself stays defensive rather than emitting
    // an empty "Tipos de datos expuestos: ." line.
    expect(buildNoticeUserPrompt([], 100)).toContain("no especificados");
  });
});

describe("NOTICE_MODEL", () => {
  it("is the model the user specified", () => {
    expect(NOTICE_MODEL).toBe("claude-haiku-4-5");
  });
});

describe("NOTICE_SYSTEM_PROMPT — anti-fabrication rules", () => {
  // Regression guard for the live bug: the model asserted facts never
  // given as input ("la vulnerabilidad ya fue cerrada", "hemos
  // notificado a las autoridades", "bloqueo de CURP ante RENAPO"). This
  // can't test the model's actual output (non-deterministic, needs a
  // live API call - verified manually, see docs/TESTLOG.md), but it can
  // guard the prompt text itself from regressing back to permissive.

  it("forbids asserting the cause of the breach", () => {
    expect(NOTICE_SYSTEM_PROMPT).toMatch(/causa de la brecha/i);
  });

  it("forbids claiming the issue was already fixed or closed", () => {
    expect(NOTICE_SYSTEM_PROMPT).toMatch(/vulnerabilidad ya fue cerrada/i);
  });

  it("forbids claiming authorities were already notified", () => {
    expect(NOTICE_SYSTEM_PROMPT).toMatch(/notificado a las autoridades/i);
  });

  it("forbids inventing specific government procedures (the RENAPO example)", () => {
    expect(NOTICE_SYSTEM_PROMPT).toMatch(/RENAPO/);
  });

  it("instructs bracketed placeholders instead of guessing", () => {
    expect(NOTICE_SYSTEM_PROMPT).toContain("[CAUSA — por confirmar]");
    expect(NOTICE_SYSTEM_PROMPT).toContain("por confirmar");
  });

  it("still forbids mentioning INAI", () => {
    expect(NOTICE_SYSTEM_PROMPT).toMatch(/nunca menciones al INAI/i);
  });

  it("still forbids Markdown formatting", () => {
    expect(NOTICE_SYSTEM_PROMPT).toMatch(/NUNCA uses Markdown/i);
  });
});
