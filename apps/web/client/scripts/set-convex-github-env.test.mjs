import { describe, expect, it } from "bun:test";

import { parseEnv } from "./set-convex-github-env.mjs";

describe("parseEnv", () => {
  it("parses simple KEY=value pairs", () => {
    expect(
      parseEnv("GITHUB_APP_ID=3588674\nGITHUB_APP_SLUG=weblab-github-app"),
    ).toEqual({
      GITHUB_APP_ID: "3588674",
      GITHUB_APP_SLUG: "weblab-github-app",
    });
  });

  it("reassembles a multi-line quoted PEM with newlines preserved", () => {
    const pem = [
      'GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----',
      "MIIEvQIBADANBgkq",
      "M3V/V4W88/d+JdQ=",
      '-----END PRIVATE KEY-----"',
    ].join("\n");
    const out = parseEnv(pem);
    expect(out.GITHUB_APP_PRIVATE_KEY).toBe(
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq\nM3V/V4W88/d+JdQ=\n-----END PRIVATE KEY-----",
    );
  });

  it("unescapes literal \\n inside a single-line quoted value", () => {
    expect(parseEnv('KEY="line1\\nline2"')).toEqual({ KEY: "line1\nline2" });
  });

  it("ignores comments and lowercase / invalid keys", () => {
    const text = [
      "# a comment",
      "lower_case=skip",
      "GITHUB_APP_ID=1",
      "  # indented",
    ].join("\n");
    expect(parseEnv(text)).toEqual({ GITHUB_APP_ID: "1" });
  });

  it("keeps the last value when a key is duplicated", () => {
    expect(parseEnv("GITHUB_APP_ID=1\nGITHUB_APP_ID=2").GITHUB_APP_ID).toBe(
      "2",
    );
  });

  it("handles values containing = signs", () => {
    expect(
      parseEnv("GITHUB_INSTALL_STATE_SECRET=abc=def==")
        .GITHUB_INSTALL_STATE_SECRET,
    ).toBe("abc=def==");
  });
});
