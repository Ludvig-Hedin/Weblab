import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const requireNative = createRequire(import.meta.url);
const settings = requireNative("./env-settings.js");
const roots: string[] = [];

function setup(example: string, local?: string, env?: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weblab-settings-"));
  roots.push(root);
  fs.writeFileSync(path.join(root, ".env.example"), example);
  if (local !== undefined) {
    fs.writeFileSync(path.join(root, ".env.local"), local);
  }
  if (env !== undefined) {
    fs.writeFileSync(path.join(root, ".env"), env);
  }
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

test("prepared site settings do not prompt for default flags or blank optional examples", () => {
  const local =
    "SANITY_API_READ_TOKEN=prepared\nSANITY_IMAGE_SIGNING_SECRET=prepared\n";
  const root = setup(
    `NEXT_PUBLIC_SITE_URL=https://example.com
# Launch switch. Requires VERCEL_ENV=production.
PUBLIC_SITE_ENABLED=false
PUBLIC_DEMO_ENABLED=false
# Missing values keep access closed.
SITE_PASSWORD=

# Server-only, read-only CMS token and image signing secret. Required locally.
SANITY_API_READ_TOKEN=
SANITY_IMAGE_SIGNING_SECRET=

# Optional build tier.
SITE_REVIEW_TIER=
# System value supplied by Vercel.
NEXT_PUBLIC_VERCEL_ENV=development
# Leave disabled until the client service is ready.
DEMO_DELIVERY_ENABLED=false
DEMO_DELIVERY_PROVIDER=generic
DEMO_WEBHOOK_URL=
DEMO_WEBHOOK_TOKEN=
`,
    local
  );
  expect(settings.missingKeys(root)).toEqual([]);
  expect(
    settings
      .describe(root)
      .find((field: { key: string }) => field.key === "PUBLIC_SITE_ENABLED")
  ).toMatchObject({
    missing: false,
    placeholder: "false",
    required: false,
    value: "",
  });
  expect(fs.readFileSync(path.join(root, ".env.local"), "utf8")).toBe(local);
});

test("required local comments apply to both keys in a block", () => {
  const root = setup(
    "# Required locally.\nREAD_TOKEN=\nSIGNING_SECRET=\n\nOPTIONAL_BLANK=\n",
    "READ_TOKEN=already-set\n"
  );
  expect(settings.missingKeys(root)).toEqual(["SIGNING_SECRET"]);
  settings.save(root, { SIGNING_SECRET: "new-secret" });
  expect(settings.missingKeys(root)).toEqual([]);
});

test("new comments and blank lines end required blocks", () => {
  const root = setup(
    "# Required.\nFIRST=\n# Optional.\nSECOND=\n# Required.\nTHIRD=\n\nFOURTH=\n"
  );
  expect(settings.missingKeys(root)).toEqual(["FIRST", "THIRD"]);
});

test("production-only and explicitly optional requirements do not block local use", () => {
  const root = setup(
    "# Required for production.\nLIVE_KEY=\n# Not required locally.\nEXTRA_KEY=\n# Optional: required only for deployment.\nDEPLOY_KEY=\n"
  );
  expect(settings.missingKeys(root)).toEqual([]);
  expect(fs.existsSync(path.join(root, ".env.local"))).toBe(false);
});

test("existing local values take priority and .env can satisfy a requirement", () => {
  const root = setup(
    "# Required locally.\nFIRST=\nSECOND=\n",
    "FIRST=local\n",
    "FIRST=fallback\nSECOND=fallback\n"
  );
  expect(settings.missingKeys(root)).toEqual([]);
  expect(
    settings.describe(root).map((field: { value: string }) => field.value)
  ).toEqual(["local", "fallback"]);
});

test("saving supplied fields preserves unrelated values and never writes example defaults", () => {
  const root = setup(
    "PUBLIC_SITE_ENABLED=false\n# Required locally.\nREAD_TOKEN=\n",
    "# Keep this\nEXISTING=value\n"
  );
  settings.save(root, {
    PUBLIC_SITE_ENABLED: "",
    READ_TOKEN: "a b",
    UNKNOWN: "ignore",
  });
  expect(fs.readFileSync(path.join(root, ".env.local"), "utf8")).toBe(
    '# Keep this\nEXISTING=value\nREAD_TOKEN="a b"\n'
  );
});

function temporaryFiles(root: string) {
  return fs.readdirSync(root).filter((name) => name.endsWith(".tmp"));
}

test("settings merge saves a complete private file and removes its temporary file", () => {
  const root = setup(
    "CLIENT_KEY=example\n",
    "# existing\nOTHER=keep\nCLIENT_KEY=old\n"
  );
  settings.save(root, { CLIENT_KEY: "test-value", UNLISTED: "ignored" });
  expect(fs.readFileSync(path.join(root, ".env.local"), "utf8")).toBe(
    "# existing\nOTHER=keep\nCLIENT_KEY=test-value\n"
  );
  // biome-ignore lint/suspicious/noBitwiseOperators: Inspect POSIX permission bits without the file-type bits.
  expect(fs.statSync(path.join(root, ".env.local")).mode & 0o777).toBe(0o600);
  expect(temporaryFiles(root)).toEqual([]);
});

test.each([true, false])(
  "settings refuse external symlinks, existing target: %s",
  (exists) => {
    const root = setup("CLIENT_KEY=example\n");
    const outside = setup("");
    const target = path.join(outside, "outside.txt");
    if (exists) {
      fs.writeFileSync(target, "keep outside\n");
    }
    fs.symlinkSync(target, path.join(root, ".env.local"));
    expect(() => settings.save(root, { CLIENT_KEY: "test-value" })).toThrow();
    expect(fs.existsSync(target)).toBe(exists);
    if (exists) {
      expect(fs.readFileSync(target, "utf8")).toBe("keep outside\n");
    }
    expect(temporaryFiles(root)).toEqual([]);
  }
);

test("settings refuse a directory instead of replacing it", () => {
  const root = setup("CLIENT_KEY=example\n");
  fs.mkdirSync(path.join(root, ".env.local"));
  expect(() => settings.save(root, { CLIENT_KEY: "test-value" })).toThrow();
  expect(fs.statSync(path.join(root, ".env.local")).isDirectory()).toBe(true);
  expect(temporaryFiles(root)).toEqual([]);
});

test("new settings can be saved without a previous file", () => {
  const root = setup("CLIENT_KEY=example\n");
  settings.save(root, { CLIENT_KEY: "test-value" });
  expect(fs.readFileSync(path.join(root, ".env.local"), "utf8")).toBe(
    "CLIENT_KEY=test-value\n"
  );
  expect(temporaryFiles(root)).toEqual([]);
});

test("settings refuse a named pipe without waiting for its writer", () => {
  if (process.platform === "win32") {
    return;
  }
  const root = setup("CLIENT_KEY=example\n");
  execFileSync("mkfifo", [path.join(root, ".env.local")]);
  expect(() => settings.save(root, { CLIENT_KEY: "test-value" })).toThrow(
    "regular file"
  );
});

test("invalid UTF-8 settings remain untouched", () => {
  const root = setup("CLIENT_KEY=example\n");
  const invalid = Buffer.from([0xff, 0xfe, 0x43]);
  fs.writeFileSync(path.join(root, ".env.local"), invalid);
  expect(() => settings.save(root, { CLIENT_KEY: "test-value" })).toThrow(
    "UTF-8"
  );
  expect(fs.readFileSync(path.join(root, ".env.local"))).toEqual(invalid);
  expect(temporaryFiles(root)).toEqual([]);
});

test("a failed temporary write keeps previous settings and removes the private temp file", () => {
  const root = setup("CLIENT_KEY=example\n", "CLIENT_KEY=keep\n");
  vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => {
    throw new Error("disk full");
  });
  expect(() => settings.save(root, { CLIENT_KEY: "test-value" })).toThrow(
    "disk full"
  );
  expect(fs.readFileSync(path.join(root, ".env.local"), "utf8")).toBe(
    "CLIENT_KEY=keep\n"
  );
  expect(temporaryFiles(root)).toEqual([]);
});

test.each([true, false])(
  "changed settings are kept while saving, existing original: %s",
  (exists) => {
    const root = setup(
      "CLIENT_KEY=example\n",
      exists ? "CLIENT_KEY=original\n" : undefined
    );
    const write = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementationOnce((...args) => {
      write(...args);
      write(path.join(root, ".env.local"), "CLIENT_KEY=newer\n");
    });
    expect(() => settings.save(root, { CLIENT_KEY: "test-value" })).toThrow(
      "changed while saving"
    );
    expect(fs.readFileSync(path.join(root, ".env.local"), "utf8")).toBe(
      "CLIENT_KEY=newer\n"
    );
    expect(temporaryFiles(root)).toEqual([]);
  }
);
