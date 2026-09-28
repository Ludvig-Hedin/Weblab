/**
 * The components API's gate and wire shape. Resolution itself is covered in
 * `@airship/source`; here it only has to be reachable, and only from the
 * proxy's own origin.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AIRSHIP_COMPONENT_DETAIL_PATH,
  AIRSHIP_COMPONENTS_PATH,
} from "@airship/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleComponentsRequest, isComponentsRequest } from "./components-api";

let project: string;
let server: http.Server;
let base: string;
let host: string;

beforeAll(async () => {
  project = mkdtempSync(join(tmpdir(), "airship-components-api-"));
  mkdirSync(join(project, "src/app"), { recursive: true });
  mkdirSync(join(project, "src/components"), { recursive: true });
  writeFileSync(
    join(project, "src/components/card.tsx"),
    "export function Card({ title }: { title: string }) {\n  return <div>{title}</div>;\n}\n"
  );
  writeFileSync(
    join(project, "src/app/page.tsx"),
    'import { Card } from "../components/card";\n\nexport default function Page() {\n  return <Card title="Hi" />;\n}\n'
  );
  server = http.createServer((req, res) => {
    handleComponentsRequest(req, res, { projectRoot: project }).catch(() => {
      // Answers every failure itself.
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  host = `127.0.0.1:${port}`;
  base = `http://${host}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(project, { force: true, recursive: true });
});

const REF = {
  frames: [{ column: 10, file: "/src/app/page.tsx", line: 4 }],
  key: "k1",
  name: "Card",
};

function post(path: string, body: unknown, origin: string | null = base) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (origin !== null) {
    headers.origin = origin;
  }
  return fetch(`${base}${path}`, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
}

describe("isComponentsRequest", () => {
  it("matches both paths, ignoring a query", () => {
    expect(isComponentsRequest(AIRSHIP_COMPONENTS_PATH)).toBe(true);
    expect(isComponentsRequest(`${AIRSHIP_COMPONENT_DETAIL_PATH}?x=1`)).toBe(
      true
    );
    expect(isComponentsRequest("/__airship/api/assets")).toBe(false);
    expect(isComponentsRequest(undefined)).toBe(false);
  });
});

describe("components API", () => {
  it("rejects a missing Origin", async () => {
    const res = await post(AIRSHIP_COMPONENTS_PATH, { refs: [REF] }, null);
    expect(res.status).toBe(403);
  });

  it("rejects a foreign Origin", async () => {
    const res = await post(
      AIRSHIP_COMPONENTS_PATH,
      { refs: [REF] },
      "http://evil.example"
    );
    expect(res.status).toBe(403);
  });

  it("rejects GET", async () => {
    const res = await fetch(`${base}${AIRSHIP_COMPONENTS_PATH}`, {
      headers: { origin: base },
    });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  it("rejects malformed bodies", async () => {
    const tooMany = Array.from({ length: 501 }, () => REF);
    expect(
      (await post(AIRSHIP_COMPONENTS_PATH, { refs: tooMany })).status
    ).toBe(400);
    expect((await post(AIRSHIP_COMPONENTS_PATH, { refs: "nope" })).status).toBe(
      400
    );
    const manyFrames = {
      ...REF,
      frames: Array.from({ length: 9 }, () => REF.frames[0]),
    };
    expect(
      (await post(AIRSHIP_COMPONENTS_PATH, { refs: [manyFrames] })).status
    ).toBe(400);
  });

  it("answers component info for a valid POST", async () => {
    const res = await post(AIRSHIP_COMPONENTS_PATH, { refs: [REF] });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as {
      components: Record<string, unknown>[];
    };
    expect(body.components).toHaveLength(1);
    expect(body.components[0]).toMatchObject({
      callSite: { file: "src/app/page.tsx", line: 4 },
      definition: { exportName: "Card", file: "src/components/card.tsx" },
      instances: 1,
      key: "k1",
      pages: ["/"],
      shared: false,
    });
  });

  it("answers detail, and 404 when the component cannot be found", async () => {
    const res = await post(AIRSHIP_COMPONENT_DETAIL_PATH, { ref: REF });
    expect(res.status).toBe(200);
    const detail = (await res.json()) as {
      origins: Record<string, unknown>;
      props: { name: string }[];
    };
    expect(detail.props.map((p) => p.name)).toEqual(["title"]);
    expect(detail.origins.title).toEqual({ kind: "literal" });

    const missing = await post(AIRSHIP_COMPONENT_DETAIL_PATH, {
      ref: { frames: [], key: "k", name: "Nope" },
    });
    expect(missing.status).toBe(404);
  });
});
