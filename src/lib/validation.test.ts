import { describe, it, expect } from "vitest";
import {
  LENGTH_BOUNDS,
  validateEmail,
  validatePassword,
  validateModelName,
  validateBio,
  validateNotificationText,
  validateProfileField,
  isValidUrl,
} from "./validation";

/** Postaví formátově platný e-mail `local@domain` přesné délky `len`. */
function emailOfLength(len: number): string {
  const suffix = "@b.c"; // 4 znaky, doména s tečkou
  const local = "a".repeat(len - suffix.length);
  return local + suffix;
}

describe("validateEmail — délka 5/254 + formát local@domain", () => {
  it("přijme minimální délku 5 (a@b.c)", () => {
    const email = emailOfLength(LENGTH_BOUNDS.email.min); // "a@b.c"
    expect(email.length).toBe(5);
    expect(validateEmail(email)).toBe(true);
  });

  it("přijme maximální délku 254", () => {
    const email = emailOfLength(LENGTH_BOUNDS.email.max);
    expect(email.length).toBe(254);
    expect(validateEmail(email)).toBe(true);
  });

  it("odmítne délku 4 (pod minimem)", () => {
    expect(validateEmail("a@b")).toBe(false); // 3 znaky, navíc bez tečky
    expect("ab.c".length).toBe(4);
    expect(validateEmail("ab.c")).toBe(false); // 4 znaky, chybí @
  });

  it("odmítne délku 255 (nad maximem)", () => {
    const email = emailOfLength(LENGTH_BOUNDS.email.max + 1);
    expect(email.length).toBe(255);
    expect(validateEmail(email)).toBe(false);
  });

  it("odmítne neplatný formát i při platné délce", () => {
    expect(validateEmail("no-at-sign.com")).toBe(false); // chybí @
    expect(validateEmail("a@@b.c")).toBe(false); // dvojité @
    expect(validateEmail("a@bcd")).toBe(false); // doména bez tečky
    expect(validateEmail("a b@c.d")).toBe(false); // bílý znak
    expect(validateEmail("a@b .c")).toBe(false); // bílý znak v doméně
  });
});

describe("validatePassword — délka 8/128", () => {
  it("odmítne délku 7 (pod minimem)", () => {
    expect(validatePassword("x".repeat(7))).toBe(false);
  });

  it("přijme minimální délku 8", () => {
    expect(validatePassword("x".repeat(LENGTH_BOUNDS.password.min))).toBe(true);
  });

  it("přijme maximální délku 128", () => {
    expect(validatePassword("x".repeat(LENGTH_BOUNDS.password.max))).toBe(true);
  });

  it("odmítne délku 129 (nad maximem)", () => {
    expect(validatePassword("x".repeat(LENGTH_BOUNDS.password.max + 1))).toBe(
      false,
    );
  });
});

describe("validateModelName — délka 0/1/100/101", () => {
  it("odmítne prázdné (délka 0)", () => {
    expect(validateModelName("")).toBe(false);
  });

  it("přijme minimální délku 1", () => {
    expect(validateModelName("x")).toBe(true);
  });

  it("přijme maximální délku 100", () => {
    expect(validateModelName("x".repeat(LENGTH_BOUNDS.modelName.max))).toBe(
      true,
    );
  });

  it("odmítne délku 101 (nad maximem)", () => {
    expect(
      validateModelName("x".repeat(LENGTH_BOUNDS.modelName.max + 1)),
    ).toBe(false);
  });
});

describe("validateBio — délka 0/1000/1001 (prázdné povoleno)", () => {
  it("přijme prázdné (délka 0)", () => {
    expect(validateBio("")).toBe(true);
  });

  it("přijme maximální délku 1000", () => {
    expect(validateBio("x".repeat(LENGTH_BOUNDS.bio.max))).toBe(true);
  });

  it("odmítne délku 1001 (nad maximem)", () => {
    expect(validateBio("x".repeat(LENGTH_BOUNDS.bio.max + 1))).toBe(false);
  });
});

describe("validateNotificationText — délka 0/1/500/501", () => {
  it("odmítne prázdné (délka 0)", () => {
    expect(validateNotificationText("")).toBe(false);
  });

  it("přijme minimální délku 1", () => {
    expect(validateNotificationText("x")).toBe(true);
  });

  it("přijme maximální délku 500", () => {
    expect(
      validateNotificationText("x".repeat(LENGTH_BOUNDS.notificationText.max)),
    ).toBe(true);
  });

  it("odmítne délku 501 (nad maximem)", () => {
    expect(
      validateNotificationText(
        "x".repeat(LENGTH_BOUNDS.notificationText.max + 1),
      ),
    ).toBe(false);
  });
});

describe("validateProfileField — délka 1/255/256", () => {
  it("odmítne prázdné (délka 0)", () => {
    expect(validateProfileField("")).toBe(false);
  });

  it("přijme minimální délku 1", () => {
    expect(validateProfileField("x")).toBe(true);
  });

  it("přijme maximální délku 255", () => {
    expect(
      validateProfileField("x".repeat(LENGTH_BOUNDS.profileField.max)),
    ).toBe(true);
  });

  it("odmítne délku 256 (nad maximem)", () => {
    expect(
      validateProfileField("x".repeat(LENGTH_BOUNDS.profileField.max + 1)),
    ).toBe(false);
  });
});

describe("isValidUrl", () => {
  it("odmítne prázdný řetězec", () => {
    expect(isValidUrl("")).toBe(false);
  });

  it("přijme platnou https URL", () => {
    expect(isValidUrl("https://t.me/mmmred")).toBe(true);
  });

  it("odmítne holý řetězec bez schématu", () => {
    expect(isValidUrl("t.me/mmmred")).toBe(false);
    expect(isValidUrl("not a url")).toBe(false);
  });
});
