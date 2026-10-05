/**
 * Component resolution against a tiny Next.js-shaped project on disk: call
 * sites from frames, definitions through a barrel, sharing via layouts, props
 * from TypeScript, and where each prop's value comes from at a call site.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ComponentFrameRef } from "@airship/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  mapBuildFrame,
  resolveComponentDetail,
  resolveComponents,
} from "./components";
import { resolveServerSource } from "./server";

const FILES: Record<string, string> = {
  "src/app/(marketing)/team/page.tsx": `import { Hero } from "../../../components/sections";
import { aboutHero } from "../../../content/about";

export default function TeamPage() {
  return <Hero tone="brand" {...aboutHero} />;
}
`,
  "src/app/about/page.tsx": `import { Hero } from "@/components/sections";
import { aboutHero } from "@/content/about";

const subtitle = "Who we are";

export default function AboutPage() {
  return (
    <div>
      <Hero {...aboutHero} title={subtitle} tone="dark" />
    </div>
  );
}
`,
  "src/app/layout.tsx": `import { Footer } from "@/components/footer";

export default function RootLayout({ children }: { children: unknown }) {
  return (
    <html>
      <body>
        {children}
        <Footer />
      </body>
    </html>
  );
}
`,
  "src/app/page.tsx": `import Link from "next/link";
import { Cta, Hero } from "@/components/sections";

export default function HomePage() {
  return (
    <main>
      <Hero title="Home" compact imageSrc="/home.png" heading={<b>Home</b>} tone="light" />
      <Link href="/about">About</Link>
      <Cta label="Go" />
    </main>
  );
}
`,
  "src/components/footer.tsx": `export function Footer() {
  return <footer>Footer</footer>;
}
`,
  "src/components/sections/cta.tsx": `export const Cta = ({ label }: { label: string }) => <a>{label}</a>;
`,
  "src/components/sections/hero.tsx": `import type { ReactNode } from "react";

type Tone = "dark" | "light" | "brand";

export interface HeroProps {
  tone?: Tone;
  compact: boolean;
  imageSrc: string;
  heading: ReactNode;
  title: string;
  ctaHref?: string;
  accentColor?: string;
  count?: number;
  onClick?: () => void;
  className?: string;
}

export function Hero({ tone = "dark", compact = false, title }: HeroProps) {
  return <section data-tone={tone} data-compact={compact}>{title}</section>;
}
`,
  "src/components/sections/index.ts": `export { Hero } from "./hero";
export * from "./cta";
`,
  "src/content/about.ts": `export const aboutHero = {
  compact: false,
  heading: "About us",
  imageSrc: "/about.png",
  title: "About",
};
`,
  "tsconfig.json": `{
  // comments and trailing commas, as real configs have
  "compilerOptions": {
    "jsx": "preserve",
    "strict": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] },
  },
}`,
};

let cwd: string;

beforeAll(() => {
  cwd = mkdtempSync(join(tmpdir(), "airship-components-"));
  for (const [rel, content] of Object.entries(FILES)) {
    const abs = join(cwd, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
});

afterAll(() => {
  rmSync(cwd, { force: true, recursive: true });
});

const abs = (rel: string): string => join(cwd, rel);
const fileUrl = (rel: string): string => pathToFileURL(abs(rel)).href;

function ref(
  name: string,
  frames: ComponentFrameRef["frames"],
  key = name
): ComponentFrameRef {
  return { frames, key, name };
}

describe("resolveComponents", () => {
  it("resolves a file:// frame to a call site and follows the barrel", () => {
    const [hero] = resolveComponents(cwd, [
      ref("Hero", [
        { column: 7, file: fileUrl("src/app/about/page.tsx"), line: 9 },
      ]),
    ]);
    expect(hero?.callSite).toEqual({
      column: 7,
      file: "src/app/about/page.tsx",
      line: 9,
    });
    expect(hero?.definition).toEqual({
      exportName: "Hero",
      file: "src/components/sections/hero.tsx",
    });
    expect(hero?.external).toBe(false);
    expect(hero?.instances).toBe(3);
    expect(hero?.pages).toEqual(["/", "/about", "/team"]);
    expect(hero?.shared).toBe(true);
    expect(hero?.isRoute).toBe(false);
  });

  it("resolves a dev-server /src/ frame and skips node_modules frames", () => {
    const [cta] = resolveComponents(cwd, [
      ref("Cta", [
        { file: "/node_modules/react/index.js", line: 1 },
        { file: "/src/app/page.tsx", line: 9 },
      ]),
    ]);
    expect(cta?.callSite?.file).toBe("src/app/page.tsx");
    expect(cta?.definition).toEqual({
      exportName: "Cta",
      file: "src/components/sections/cta.tsx",
    });
    expect(cta?.instances).toBe(1);
    expect(cta?.pages).toEqual(["/"]);
    expect(cta?.shared).toBe(false);
  });

  it("marks a component used once in a layout as shared across every page", () => {
    const [footer] = resolveComponents(cwd, [
      ref("Footer", [{ file: "src/app/layout.tsx", line: 8 }]),
    ]);
    expect(footer?.instances).toBe(1);
    expect(footer?.pages).toEqual(["/", "/about", "/team"]);
    expect(footer?.shared).toBe(true);
  });

  it("marks package imports as external and never shared", () => {
    const [link] = resolveComponents(cwd, [
      ref("Link", [{ file: "/src/app/page.tsx", line: 8 }]),
    ]);
    expect(link?.external).toBe(true);
    expect(link?.definition).toBeNull();
    expect(link?.shared).toBe(false);
  });

  it("flags routes, with and without a call site", () => {
    const [page, orphan] = resolveComponents(cwd, [
      ref("HomePage", [{ file: "node_modules/next/dist/server.js", line: 1 }]),
      ref("Mystery", []),
    ]);
    expect(page?.callSite).toBeNull();
    expect(page?.isRoute).toBe(true);
    expect(page?.shared).toBe(false);
    expect(orphan?.isRoute).toBe(false);
    expect(orphan?.callSite).toBeNull();
  });

  it("echoes keys and never throws on garbage input", () => {
    const out = resolveComponents(join(cwd, "missing"), [
      ref("X", [{ file: "%%%", line: 1 }], "k1"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.key).toBe("k1");
  });
});

describe("resolveComponentDetail", () => {
  it("reads declared props with controls, options and defaults", () => {
    const detail = resolveComponentDetail(
      cwd,
      ref("Hero", [{ file: "/src/app/about/page.tsx", line: 9 }])
    );
    const props = detail?.props ?? [];
    expect(props.map((p) => p.name)).toEqual([
      "tone",
      "compact",
      "imageSrc",
      "heading",
      "title",
      "ctaHref",
      "accentColor",
      "count",
    ]);
    const by = Object.fromEntries(props.map((p) => [p.name, p]));
    expect(by.tone).toMatchObject({
      control: "enum",
      defaultValue: '"dark"',
      optional: true,
      options: ["dark", "light", "brand"],
      typeText: "Tone",
    });
    expect(by.compact).toMatchObject({
      control: "boolean",
      defaultValue: "false",
      optional: false,
    });
    expect(by.imageSrc?.control).toBe("image");
    expect(by.heading?.control).toBe("node");
    expect(by.title?.control).toBe("text");
    expect(by.ctaHref?.control).toBe("link");
    expect(by.accentColor?.control).toBe("color");
    expect(by.count?.control).toBe("number");
  });

  it("traces origins: spread, later attributes overriding it, and sharedData", () => {
    const detail = resolveComponentDetail(
      cwd,
      ref("Hero", [{ file: "/src/app/about/page.tsx", line: 9 }])
    );
    const spread = {
      exportName: "aboutHero",
      file: "src/content/about.ts",
      kind: "spread",
      text: "aboutHero",
    };
    expect(detail?.origins.title).toEqual({
      kind: "expression",
      text: "subtitle",
    });
    expect(detail?.origins.tone).toEqual({ kind: "literal" });
    expect(detail?.origins.imageSrc).toEqual(spread);
    expect(detail?.origins.count).toEqual(spread);
    expect(detail?.sharedData).toEqual({ aboutHero: ["/team"] });
  });

  it("lets a spread override attributes written before it", () => {
    const detail = resolveComponentDetail(
      cwd,
      ref("Hero", [{ file: "src/app/(marketing)/team/page.tsx", line: 5 }])
    );
    expect(detail?.origins.tone?.kind).toBe("spread");
    expect(detail?.sharedData).toEqual({ aboutHero: ["/about"] });
  });

  it("reports literal, expression and default origins", () => {
    const detail = resolveComponentDetail(
      cwd,
      ref("Hero", [{ file: "/src/app/page.tsx", line: 7 }])
    );
    expect(detail?.origins.title).toEqual({ kind: "literal" });
    expect(detail?.origins.compact).toEqual({ kind: "literal" });
    expect(detail?.origins.heading).toEqual({
      kind: "expression",
      text: "<b>Home</b>",
    });
    expect(detail?.origins.ctaHref).toEqual({ kind: "default" });
    expect(detail?.sharedData).toEqual({});
  });

  it("returns null when nothing can be found", () => {
    expect(resolveComponentDetail(cwd, ref("Nope", []))).toBeNull();
  });
});

describe("mapBuildFrame", () => {
  /** One segment: generated 1:0 → source line 9 (0-based 8), column 6. */
  const MAPPING = "AAQM";

  it("maps a .next chunk through its sectioned source map", () => {
    const chunk = abs(".next/server/chunks/ssr/[root-of-the-server]__abc._.js");
    mkdirSync(dirname(chunk), { recursive: true });
    writeFileSync(chunk, "module.exports = {};\n");
    writeFileSync(
      `${chunk}.map`,
      JSON.stringify({
        sections: [
          {
            map: {
              mappings: MAPPING,
              names: [],
              sources: [fileUrl("src/app/about/page.tsx")],
              version: 3,
            },
            offset: { column: 0, line: 0 },
          },
        ],
        version: 3,
      })
    );
    const url = `${pathToFileURL(chunk).href}?11`;
    expect(mapBuildFrame(cwd, { column: 3, file: url, line: 1 })).toEqual({
      column: 7,
      file: "src/app/about/page.tsx",
      line: 9,
    });

    const [hero] = resolveComponents(cwd, [
      ref("Hero", [{ column: 3, file: url, line: 1 }]),
    ]);
    expect(hero?.callSite?.file).toBe("src/app/about/page.tsx");
    expect(hero?.definition?.file).toBe("src/components/sections/hero.tsx");

    const resolved = resolveServerSource(cwd, {
      source: { column: 3, file: `about://React/Server/${url}`, line: 1 },
    });
    expect(resolved?.file).toBe("src/app/about/page.tsx");
    expect(resolved?.line).toBe(9);
    expect(resolved?.context).toContain("<Hero");
  });

  it("normalises bundler URL schemes", () => {
    expect(
      mapBuildFrame(cwd, {
        file: "turbopack:///[project]/src/app/page.tsx",
        line: 2,
      })?.file
    ).toBe("src/app/page.tsx");
    expect(
      mapBuildFrame(cwd, {
        file: "webpack-internal:///(app-pages-browser)/./src/app/page.tsx",
        line: 2,
      })?.file
    ).toBe("src/app/page.tsx");
    expect(
      mapBuildFrame(cwd, { file: "webpack://_N_E/./src/app/page.tsx", line: 2 })
        ?.file
    ).toBe("src/app/page.tsx");
    expect(mapBuildFrame(cwd, { file: "/src/nope.tsx", line: 1 })).toBeNull();
  });
});
