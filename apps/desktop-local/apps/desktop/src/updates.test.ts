import { describe, expect, it } from "vitest";
import updates from "./updates.js";

const { findUpdate, isNewerVersion, latestMacRelease } = updates;

function release(version: string, asset = `Weblab-${version}-arm64.dmg`) {
  return {
    assets: [{ name: asset }],
    draft: false,
    prerelease: false,
    tag_name: `desktop-local-v${version}`,
  };
}

describe("desktop update checks", () => {
  it("compares version parts numerically", () => {
    expect(isNewerVersion("0.2.10", "0.2.9")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.2.0")).toBe(false);
    expect(isNewerVersion("0.1.9", "0.2.0")).toBe(false);
  });

  it("finds the newest published local Mac DMG, ignoring other app releases", () => {
    const result = latestMacRelease(
      [
        release("0.2.1"),
        { ...release("0.3.0"), draft: true },
        { ...release("0.4.0"), prerelease: true },
        { ...release("0.5.0"), tag_name: "desktop-v0.5.0" },
        release("0.2.9", "Weblab-0.2.9-x64.dmg"),
        release("0.2.2", "Weblab-0.2.2-arm64.zip"),
      ],
      "0.2.0"
    );
    expect(result).toEqual({
      downloadUrl:
        "https://github.com/Ludvig-Hedin/Weblab/releases/download/desktop-local-v0.2.1/Weblab-0.2.1-arm64.dmg",
      version: "0.2.1",
    });
  });

  it("does not offer the installed version", () => {
    expect(latestMacRelease([release("0.2.0")], "0.2.0")).toBeNull();
  });

  it("reports network failures instead of claiming the app is current", async () => {
    await expect(
      findUpdate("0.2.0", async () => new Response(null, { status: 403 }))
    ).rejects.toThrow("GitHub answered 403");
  });
});
