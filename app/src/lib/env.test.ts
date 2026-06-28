import { describe, it, expect } from "vitest";
import { assertProductionSecrets } from "./env";

const STRONG = "x".repeat(40);
const prod = (over: Record<string, string>) =>
  ({ NODE_ENV: "production", ...over }) as unknown as NodeJS.ProcessEnv;

describe("assertProductionSecrets", () => {
  it("je no-op mimo produkci", () => {
    expect(() =>
      assertProductionSecrets({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("v produkci projde se silnými klíči", () => {
    expect(() =>
      assertProductionSecrets(
        prod({ SESSION_COOKIE_SECRET: STRONG, STREAMING_TOKEN_SECRET: STRONG }),
      ),
    ).not.toThrow();
  });

  it("v produkci selže na chybějící/slabý/placeholder klíč", () => {
    // chybějící STREAMING_TOKEN_SECRET
    expect(() =>
      assertProductionSecrets(prod({ SESSION_COOKIE_SECRET: STRONG })),
    ).toThrow();
    // placeholder
    expect(() =>
      assertProductionSecrets(
        prod({
          SESSION_COOKIE_SECRET: "dev-only-change-me-xxxxxxxxxxxxxxxxxxxxxx",
          STREAMING_TOKEN_SECRET: STRONG,
        }),
      ),
    ).toThrow();
    // příliš krátký
    expect(() =>
      assertProductionSecrets(
        prod({ SESSION_COOKIE_SECRET: STRONG, STREAMING_TOKEN_SECRET: "short" }),
      ),
    ).toThrow();
  });
});
