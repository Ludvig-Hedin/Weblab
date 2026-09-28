import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addMode,
  createToken,
  deleteToken,
  invalidateTokenCache,
  scanProjectTokens,
  setTokenValue,
  tokenScanRoot,
} from "./tokens";

/** Build a throwaway project tree and return its root. */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "airship-tokens-"));
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents);
  }
  invalidateTokenCache();
  return root;
}

describe("tokenScanRoot", () => {
  it("climbs to the workspace root, not the dev server's cwd", () => {
    // The case this exists for: the app is `apps/web`, and the design tokens
    // are a sibling package. Scanning from the app finds aliases and never
    // finds what they alias to.
    const root = fixture({
      "apps/web/package.json": "{}",
      "apps/web/src/styles.css": ":root { --x: 1px; }",
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    });
    expect(tokenScanRoot(join(root, "apps/web"))).toBe(root);
  });

  it("stops at the nearest marker, not the outermost one", () => {
    // A nested workspace must not escalate to the repo above it and scan a
    // completely unrelated project.
    const root = fixture({
      ".git": "",
      "example/apps/web/package.json": "{}",
      "example/pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    });
    expect(tokenScanRoot(join(root, "example/apps/web"))).toBe(
      join(root, "example")
    );
  });

  it("falls back to cwd when there is no marker anywhere above", () => {
    const root = mkdtempSync(join(tmpdir(), "airship-bare-"));
    mkdirSync(join(root, "a/b/c/d/e/f/g"), { recursive: true });
    const deep = join(root, "a/b/c/d/e/f/g");
    expect(tokenScanRoot(deep)).toBe(deep);
  });
});

describe("scanProjectTokens", () => {
  it("resolves a var() alias chain across packages to its literal", () => {
    const root = fixture({
      "apps/web/src/styles.css":
        '@import "tailwindcss";\n@theme {\n  --radius-md: var(--pk-radius-md);\n  --color-page: var(--pk-color-page);\n}\n',
      // The primitive lives in a sibling package's build output, which is where
      // token packages actually ship it.
      "packages/tokens/dist/tokens.css":
        ":root {\n  --pk-radius-md: 8px;\n  --pk-color-page: #fafaf9;\n}\n",
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n  - packages/*\n",
    });
    const scan = scanProjectTokens(join(root, "apps/web"), { refresh: true });
    const byName = Object.fromEntries(scan.tokens.map((t) => [t.name, t]));

    expect(scan.framework).toBe("tailwind");
    expect(byName["--radius-md"].values[""]).toBe("8px");
    expect(byName["--color-page"].values[""]).toBe("#fafaf9");
    // The alias is recorded so the registry can collapse the duplicate pair.
    expect(byName["--radius-md"].aliasOf).toBe("--pk-radius-md");
    // Categorised from the property it is used on, not from its name alone.
    expect(byName["--color-page"].category).toBe("colors");
  });

  it("records a file and line for every token", () => {
    const root = fixture({
      "pnpm-workspace.yaml": "",
      "src/tokens.css":
        "/* a comment\n   spanning lines */\n:root {\n  --gap: 8px;\n}\n",
    });
    const scan = scanProjectTokens(root, { refresh: true });
    const gap = scan.tokens.find((t) => t.name === "--gap");
    expect(gap?.file).toBe("src/tokens.css");
    // Line 4 — comments are blanked in place so offsets stay truthful.
    expect(gap?.line).toBe(4);
  });

  it("skips bundler output but keeps a token package's dist", () => {
    const root = fixture({
      "packages/tokens/dist/tokens.css": ":root { --keep: 4px; }",
      "pnpm-workspace.yaml": "",
      "web/dist/assets/styles-DSZLOMh8.css": ":root { --dropped: 9px; }",
    });
    const names = scanProjectTokens(root, { refresh: true }).tokens.map(
      (t) => t.name
    );
    expect(names).toContain("--keep");
    expect(names).not.toContain("--dropped");
  });

  it("ignores framework-internal custom properties", () => {
    const root = fixture({
      "a.css": ":root { --tw-ring-offset-width: 0px; --real: 4px; }",
      "pnpm-workspace.yaml": "",
    });
    const names = scanProjectTokens(root, { refresh: true }).tokens.map(
      (t) => t.name
    );
    expect(names).toContain("--real");
    expect(names).not.toContain("--tw-ring-offset-width");
  });

  it("picks up single-declaration utility classes", () => {
    const root = fixture({
      "a.css":
        ".pt-4 { padding-top: 16px; }\n.card { padding: 8px; margin: 4px; }\n",
      "pnpm-workspace.yaml": "",
    });
    const scan = scanProjectTokens(root, { refresh: true });
    const utilities = scan.tokens.filter((t) => t.kind === "utility-class");
    expect(utilities.map((t) => t.name)).toEqual([".pt-4"]);
    // `.card` declares two properties, so it is a component, not a token.
  });

  it("ignores the editor's own chrome palette", () => {
    // The scan climbs to the workspace root by design, which in airship's own
    // repo walks straight into the package that emits the inspector's colours.
    // Those were being offered as the user's design system, and applying one
    // wrote a `var()` the app could not resolve.
    const root = fixture({
      "apps/web/package.json": '{"name":"@acme/web"}',
      "apps/web/src/a.css": ":root { --brand: #0af; }",
      "packages/editor-tokens/dist/tokens.css":
        ".ap-mock { --ap-surface-panel: #313131; }",
      "packages/editor-tokens/package.json":
        '{"name":"@airship/editor-tokens"}',
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n  - packages/*\n",
    });
    const names = scanProjectTokens(join(root, "apps/web"), {
      refresh: true,
    }).tokens.map((t) => t.name);
    expect(names).toContain("--brand");
    expect(names).not.toContain("--ap-surface-panel");
  });

  it("keeps the app's own tokens even though it shares our scope", () => {
    /*
     * The regression the exact-name list exists to prevent. Excluding
     * "anything scoped `@airship/`" also excluded `@airship/web` — the app being
     * edited — and the scan returned nothing at all. Being scope-mates does not
     * make a package the editor's chrome.
     */
    const root = fixture({
      "apps/web/package.json": '{"name":"@airship/web"}',
      "apps/web/src/a.css": ":root { --brand: #0af; }",
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    });
    const names = scanProjectTokens(join(root, "apps/web"), {
      refresh: true,
    }).tokens.map((t) => t.name);
    expect(names).toContain("--brand");
  });

  it("keeps a design-token package that is a sibling of the app", () => {
    // The whole reason the scan climbs. This must survive the exclusions.
    const root = fixture({
      "apps/web/package.json": '{"name":"@acme/web"}',
      "apps/web/src/a.css": ":root { --radius-md: var(--pk-radius-md); }",
      "packages/tokens/dist/tokens.css": ":root { --pk-radius-md: 8px; }",
      "packages/tokens/package.json": '{"name":"@acme/tokens"}',
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n  - packages/*\n",
    });
    const names = scanProjectTokens(join(root, "apps/web"), {
      refresh: true,
    }).tokens.map((t) => t.name);
    expect(names).toContain("--pk-radius-md");
  });
});

describe("setTokenValue", () => {
  it("rewrites only the scanned declaration", () => {
    const root = fixture({
      ".git/HEAD": "",
      "src/app.css":
        ":root {\n  --brand: #111;\n  --brand-2: #222;\n}\n.dark {\n  --brand: #000;\n}\n",
    });
    const result = setTokenValue(root, {
      file: "src/app.css",
      line: 2,
      name: "--brand",
      value: "#ff0000",
    });
    expect(result).toEqual({ file: "src/app.css", ok: true });
    expect(readFileSync(join(root, "src/app.css"), "utf8")).toBe(
      ":root {\n  --brand: #ff0000;\n  --brand-2: #222;\n}\n.dark {\n  --brand: #000;\n}\n"
    );
  });

  it("refuses values that would break the stylesheet", () => {
    const root = fixture({ ".git/HEAD": "", "a.css": ":root { --x: 1px; }" });
    const result = setTokenValue(root, {
      file: "a.css",
      name: "--x",
      value: "2px; color: red",
    });
    expect(result.ok).toBe(false);
  });

  it("stays inside the project", () => {
    const root = fixture({ ".git/HEAD": "", "a.css": ":root { --x: 1px; }" });
    const result = setTokenValue(root, {
      file: "../outside.css",
      name: "--x",
      value: "2px",
    });
    expect(result.ok).toBe(false);
  });
});

describe("createToken", () => {
  it("adds to the first @theme block with its indentation", () => {
    const root = fixture({
      ".git/HEAD": "",
      "src/app.css":
        '@import "tailwindcss";\n@theme {\n    --color-brand: #111;\n}\n',
    });
    const result = createToken(root, { name: "--color-ink", value: "#222" });
    expect(result).toEqual({ file: "src/app.css", ok: true });
    expect(readFileSync(join(root, "src/app.css"), "utf8")).toBe(
      '@import "tailwindcss";\n@theme {\n    --color-ink: #222;\n    --color-brand: #111;\n}\n'
    );
  });

  it("refuses a name that already exists", () => {
    const root = fixture({ ".git/HEAD": "", "a.css": ":root { --x: 1px; }" });
    expect(createToken(root, { name: "--x", value: "2px" }).ok).toBe(false);
  });
});

describe("modes", () => {
  it("reads themes and breakpoints as modes, not new variables", () => {
    const root = fixture({
      ".git/HEAD": "",
      "src/app.css": [
        ":root {",
        "  --bg: #ffffff;",
        "  --gap: 24px;",
        "}",
        ".dark {",
        "  --bg: #000000;",
        "}",
        "@media (max-width: 767px) {",
        "  :root {",
        "    --gap: 12px;",
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const { tokens } = scanProjectTokens(root, { refresh: true });
    const bg = tokens.find((t) => t.name === "--bg");
    const gap = tokens.find((t) => t.name === "--gap");
    expect(tokens.filter((t) => t.name === "--bg")).toHaveLength(1);
    expect(bg?.values[""]).toBe("#ffffff");
    expect(bg?.modes?.dark).toMatchObject({
      label: "Dark",
      line: 6,
      value: "#000000",
    });
    expect(gap?.modes?.["max-767px"]).toMatchObject({
      kind: "breakpoint",
      label: "≤ 767px",
      value: "12px",
    });
  });

  it("edits, adds and removes a mode's value in its own block", () => {
    const root = fixture({
      ".git/HEAD": "",
      "a.css":
        ":root {\n  --bg: #fff;\n  --fg: #111;\n}\n.dark {\n  --bg: #000;\n}\n",
    });
    expect(
      setTokenValue(root, {
        file: "a.css",
        line: 6,
        name: "--bg",
        value: "#222",
      }).ok
    ).toBe(true);
    expect(
      createToken(root, {
        afterLine: 6,
        file: "a.css",
        name: "--fg",
        value: "#eee",
      }).ok
    ).toBe(true);
    expect(readFileSync(join(root, "a.css"), "utf8")).toBe(
      ":root {\n  --bg: #fff;\n  --fg: #111;\n}\n.dark {\n  --bg: #222;\n  --fg: #eee;\n}\n"
    );
    expect(deleteToken(root, { file: "a.css", line: 7, name: "--fg" }).ok).toBe(
      true
    );
    expect(readFileSync(join(root, "a.css"), "utf8")).toBe(
      ":root {\n  --bg: #fff;\n  --fg: #111;\n}\n.dark {\n  --bg: #222;\n}\n"
    );
  });

  it("starts a custom-named theme", () => {
    const root = fixture({
      ".git/HEAD": "",
      "a.css": ":root {\n  --bg: #fff;\n}\n",
    });
    expect(
      addMode(root, {
        mode: "custom",
        modeName: "Brand Blue",
        name: "--bg",
        value: "#00f",
      }).ok
    ).toBe(true);
    expect(readFileSync(join(root, "a.css"), "utf8")).toContain(
      '[data-theme="brand-blue"] {'
    );
    const bg = scanProjectTokens(root, { refresh: true }).tokens.find(
      (t) => t.name === "--bg"
    );
    expect(bg?.modes?.["brand-blue"]).toMatchObject({
      label: "Brand blue",
      value: "#00f",
    });
  });

  it("starts a new mode with one seeded value", () => {
    const root = fixture({
      ".git/HEAD": "",
      "a.css": ":root {\n  --bg: #fff;\n}\n",
    });
    expect(
      addMode(root, { mode: "dark", name: "--bg", value: "#fff" }).ok
    ).toBe(true);
    const bg = scanProjectTokens(root, { refresh: true }).tokens.find(
      (t) => t.name === "--bg"
    );
    expect(bg?.modes?.dark?.value).toBe("#fff");
  });
});
