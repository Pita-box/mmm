import { describe, it, expect } from "vitest";
import {
  ok,
  err,
  isOk,
  isErr,
  unwrapOr,
  mapResult,
  type Result,
} from "./result";

describe("Result", () => {
  it("ok() builds a void success", () => {
    const r = ok();
    expect(r).toEqual({ ok: true, value: undefined });
    expect(isOk(r)).toBe(true);
  });

  it("ok(value) carries the value", () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(42);
  });

  it("err(error) carries the error", () => {
    const r = err("boom");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toBe("boom");
  });

  it("isOk and isErr are mutually exclusive", () => {
    const good: Result<number, string> = ok(1);
    const bad: Result<number, string> = err("x");
    expect(isOk(good)).toBe(true);
    expect(isErr(good)).toBe(false);
    expect(isOk(bad)).toBe(false);
    expect(isErr(bad)).toBe(true);
  });

  it("unwrapOr returns value on success, fallback on error", () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
    expect(unwrapOr(err<string>("e") as Result<number, string>, 0)).toBe(0);
  });

  it("mapResult transforms success and leaves error untouched", () => {
    expect(mapResult(ok(2), (n) => n * 10)).toEqual(ok(20));
    const e: Result<number, string> = err("e");
    expect(mapResult(e, (n: number) => n * 10)).toBe(e);
  });
});
