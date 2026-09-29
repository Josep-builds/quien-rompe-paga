import { describe, expect, it } from "vitest";
import { DataTypesValidationError, DATA_TYPE_OPTIONS, validateDataTypes } from "./dataTypes";

describe("validateDataTypes", () => {
  it("accepts a single valid data type", () => {
    expect(validateDataTypes(["CURP"])).toEqual(["CURP"]);
  });

  it("accepts multiple valid data types", () => {
    expect(validateDataTypes(["CURP", "Teléfono"])).toEqual(["CURP", "Teléfono"]);
  });

  it("accepts every known option at once", () => {
    expect(validateDataTypes([...DATA_TYPE_OPTIONS])).toEqual([...DATA_TYPE_OPTIONS]);
  });

  it("dedupes repeated values", () => {
    expect(validateDataTypes(["CURP", "CURP", "INE"])).toEqual(["CURP", "INE"]);
  });

  it("rejects an empty array — the live bug: a quote saved with zero data types", () => {
    expect(() => validateDataTypes([])).toThrow(DataTypesValidationError);
  });

  it("rejects a non-array value", () => {
    expect(() => validateDataTypes(undefined)).toThrow(DataTypesValidationError);
    expect(() => validateDataTypes(null)).toThrow(DataTypesValidationError);
    expect(() => validateDataTypes("CURP")).toThrow(DataTypesValidationError);
  });

  it("drops unknown values rather than keeping them", () => {
    expect(validateDataTypes(["CURP", "Correo"])).toEqual(["CURP"]);
  });

  it("rejects when every value is unknown, leaving nothing after filtering", () => {
    expect(() => validateDataTypes(["Correo", "Dirección"])).toThrow(DataTypesValidationError);
  });

  it("rejects non-string entries", () => {
    expect(() => validateDataTypes([1, 2, 3])).toThrow(DataTypesValidationError);
  });
});
