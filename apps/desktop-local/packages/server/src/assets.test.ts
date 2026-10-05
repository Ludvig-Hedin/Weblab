import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ASSETS_API_PATH,
  handleAssetsRequest,
  sanitizeImageName,
  sniffImage,
} from "./assets";
import { createProxyServer } from "./proxy";

const PNG = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  Buffer.alloc(24, 1),
]);
const JPEG = Buffer.concat([Buffer.from("ffd8ffe0", "hex"), Buffer.alloc(16)]);
const GIF = Buffer.from("GIF89a\u0001\u0000\u0001\u0000", "latin1");
const WEBP = Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ", "latin1");
const AVIF = Buffer.concat([
  Buffer.from("0000001c", "hex"),
  Buffer.from("ftypavif", "latin1"),
  Buffer.alloc(4),
  Buffer.from("mif1miaf", "latin1"),
]);
const ICO = Buffer.from("000001000100", "hex");
const SVG = Buffer.from(
  '﻿<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg"/>'
);

let project: string;
let outside: string;
let server: http.Server;
let port: number;

async function listen(target: http.Server): Promise<number> {
  await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
  const { port: bound } = target.address() as AddressInfo;
  return bound;
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "airship-assets-"));
}

beforeEach(async () => {
  project = tmp();
  outside = tmp();
  server = createProxyServer({
    allowedHosts: new Set(),
    defaultMode: "inline",
    onAirshipUpgrade: () => undefined,
    projectRoot: project,
    // Nothing listens here: a request that leaked to the dev server would 502.
    targetHost: "127.0.0.1",
    targetPort: 1,
    wsPath: "/__airship/ws",
  });
  port = await listen(server);
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
  rmSync(project, { force: true, recursive: true });
  rmSync(outside, { force: true, recursive: true });
});

interface Reply {
  json: Record<string, unknown>;
  status: number;
}

function call(
  opts: {
    body?: Buffer;
    headers?: Record<string, string>;
    method?: string;
    path?: string;
    serverPort?: number;
  } = {}
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        headers: opts.headers,
        host: "127.0.0.1",
        method: opts.method ?? "GET",
        path: opts.path ?? ASSETS_API_PATH,
        port: opts.serverPort ?? port,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            json: text ? JSON.parse(text) : {},
            status: res.statusCode ?? 0,
          });
          req.destroy();
        });
      }
    );
    req.on("error", reject);
    req.end(opts.body);
  });
}

const origin = () => `http://127.0.0.1:${port}`;

function upload(
  name: string,
  body: Buffer,
  headers: Record<string, string> = {}
): Promise<Reply> {
  return call({
    body,
    headers: {
      "content-type": "image/png",
      origin: origin(),
      ...headers,
    },
    method: "POST",
    path: `${ASSETS_API_PATH}?name=${encodeURIComponent(name)}`,
  });
}

function put(rel: string, body: Buffer = PNG, mtimeSec?: number): void {
  const abs = join(project, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
  if (mtimeSec !== undefined) {
    utimesSync(abs, mtimeSec, mtimeSec);
  }
}

describe("GET assets", () => {
  it("returns an empty public library when there is no static folder", async () => {
    const res = await call();
    expect(res).toEqual({ json: { images: [], root: "public" }, status: 200 });
  });

  it("lists public/ recursively, images only, newest first", async () => {
    put("public/old.png", PNG, 1000);
    put("public/images/nested/new.JPG", JPEG, 3000);
    put("public/mid.svg", SVG, 2000);
    put("public/readme.txt", Buffer.from("hi"));
    put("public/.hidden/secret.png");
    put("public/node_modules/pkg/x.png");
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.json.root).toBe("public");
    const images = res.json.images as Record<string, unknown>[];
    expect(images.map((i) => i.path)).toEqual([
      "public/images/nested/new.JPG",
      "public/mid.svg",
      "public/old.png",
    ]);
    expect(images[0]).toMatchObject({
      bytes: JPEG.length,
      modified: 3_000_000,
      name: "new.JPG",
      url: "/images/nested/new.JPG",
    });
  });

  it("falls back to static/ when there is no public/", async () => {
    put("static/logo.gif", GIF);
    const res = await call();
    expect(res.json.root).toBe("static");
    expect(res.json.images).toMatchObject([
      { path: "static/logo.gif", url: "/logo.gif" },
    ]);
  });

  it("prefers public/ over static/", async () => {
    put("public/a.png");
    put("static/b.png");
    const res = await call();
    expect(res.json.root).toBe("public");
    expect((res.json.images as unknown[]).length).toBe(1);
  });

  it("encodes each url segment", async () => {
    put("public/my pics/å #1.png");
    const res = await call();
    expect(res.json.images).toMatchObject([
      { path: "public/my pics/å #1.png", url: "/my%20pics/%C3%A5%20%231.png" },
    ]);
  });

  it("does not follow symlinks inside the static folder", async () => {
    put("public/a.png");
    writeFileSync(join(outside, "b.png"), PNG);
    symlinkSync(outside, join(project, "public", "linked"));
    symlinkSync(join(outside, "b.png"), join(project, "public", "c.png"));
    const res = await call();
    expect((res.json.images as { path: string }[]).map((i) => i.path)).toEqual([
      "public/a.png",
    ]);
  });

  it("refuses a symlinked public folder", async () => {
    writeFileSync(join(outside, "b.png"), PNG);
    symlinkSync(outside, join(project, "public"));
    const res = await call();
    expect(res.status).toBe(403);
    expect(typeof res.json.error).toBe("string");
  });

  it("refuses a foreign Origin but allows none", async () => {
    expect(
      (await call({ headers: { origin: "http://evil.test" } })).status
    ).toBe(403);
    expect((await call({ headers: { origin: origin() } })).status).toBe(200);
  });

  it("refuses a Host that is not allowed", async () => {
    const res = await new Promise<number>((resolve, reject) => {
      http
        .request(
          {
            headers: { host: "evil.test" },
            host: "127.0.0.1",
            path: ASSETS_API_PATH,
            port,
          },
          (r) => {
            r.resume();
            resolve(r.statusCode ?? 0);
          }
        )
        .on("error", reject)
        .end();
    });
    expect(res).toBe(403);
  });

  it("answers other methods with 405", async () => {
    const res = await call({ headers: { origin: origin() }, method: "DELETE" });
    expect(res.status).toBe(405);
    expect(typeof res.json.error).toBe("string");
  });
});

describe("POST assets", () => {
  it("creates public/images and writes the file", async () => {
    const res = await upload("Hero Shot.png", PNG);
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({
      bytes: PNG.length,
      name: "hero-shot.png",
      path: "public/images/hero-shot.png",
      url: "/images/hero-shot.png",
    });
    expect(readFileSync(join(project, "public/images/hero-shot.png"))).toEqual(
      PNG
    );
  });

  it("writes into static/images when static/ is the folder", async () => {
    mkdirSync(join(project, "static"));
    const res = await upload("a.gif", GIF, { "content-type": "image/gif" });
    expect(res.json.path).toBe("static/images/a.gif");
    expect(existsSync(join(project, "static/images/a.gif"))).toBe(true);
  });

  it("never overwrites: numbers the copies", async () => {
    const first = await upload("logo.png", PNG);
    const second = await upload("logo.png", PNG);
    const third = await upload("LOGO.png", PNG);
    expect([first.json.name, second.json.name, third.json.name]).toEqual([
      "logo.png",
      "logo-2.png",
      "logo-3.png",
    ]);
  });

  it("accepts every supported format with a matching extension", async () => {
    const cases: [string, Buffer][] = [
      ["a.jpeg", JPEG],
      ["b.jpg", JPEG],
      ["c.webp", WEBP],
      ["d.avif", AVIF],
      ["e.ico", ICO],
      ["f.svg", SVG],
    ];
    const replies = await Promise.all(
      cases.map(([name, body]) =>
        upload(name, body, { "content-type": "application/octet-stream" })
      )
    );
    expect(replies.map((r) => r.status)).toEqual(cases.map(() => 201));
  });

  it("rejects bytes that do not match the extension with 415", async () => {
    const res = await upload("photo.png", JPEG);
    expect(res.status).toBe(415);
    expect(existsSync(join(project, "public/images/photo.png"))).toBe(false);
  });

  it("rejects an SVG that can run code, wherever it hides", async () => {
    const pad = " ".repeat(4096);
    const cases = [
      '<svg xmlns="http://www.w3.org/2000/svg"><SCRIPT>alert(1)</SCRIPT></svg>',
      `<svg xmlns="http://www.w3.org/2000/svg">${pad}<foreignObject/></svg>`,
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect ONCLICK = "x()"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="JavaScript:x()"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><iframe/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><embed/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><object/></svg>',
    ];
    const replies = await Promise.all(
      cases.map((svg, i) =>
        upload(`bad-${i}.svg`, Buffer.from(svg), {
          "content-type": "image/svg+xml",
        })
      )
    );
    for (const [i, res] of replies.entries()) {
      expect(res.status).toBe(415);
      expect(res.json.error).toBe(
        "This SVG contains scripts, so it can't be added."
      );
      expect(existsSync(join(project, `public/images/bad-${i}.svg`))).toBe(
        false
      );
    }
  });

  it("still accepts a plain SVG whose words merely contain 'on'", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><text font-weight="bold">icon one</text><polygon points="0,0 1,1"/></svg>'
    );
    const res = await upload("fine.svg", svg, {
      "content-type": "image/svg+xml",
    });
    expect(res.status).toBe(201);
  });

  it("rejects a non-image content type with 415", async () => {
    const res = await upload("a.png", PNG, { "content-type": "text/html" });
    expect(res.status).toBe(415);
  });

  it("rejects an unsupported extension and an empty body with 400", async () => {
    expect((await upload("a.exe", PNG)).status).toBe(400);
    expect((await upload("a.png", Buffer.alloc(0))).status).toBe(400);
  });

  it("rejects a missing or foreign Origin with 403", async () => {
    const none = await call({
      body: PNG,
      headers: { "content-type": "image/png" },
      method: "POST",
      path: `${ASSETS_API_PATH}?name=a.png`,
    });
    expect(none.status).toBe(403);
    const foreign = await upload("a.png", PNG, {
      origin: "http://localhost:9999",
    });
    expect(foreign.status).toBe(403);
    expect(existsSync(join(project, "public"))).toBe(false);
  });

  it("rejects a declared body over 25 MB with 413", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          headers: {
            "content-length": String(25 * 1024 * 1024 + 1),
            "content-type": "image/png",
            origin: origin(),
          },
          host: "127.0.0.1",
          method: "POST",
          path: `${ASSETS_API_PATH}?name=big.png`,
          port,
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
          req.destroy();
        }
      );
      req.on("error", reject);
      req.write(PNG);
    });
    expect(status).toBe(413);
    expect(existsSync(join(project, "public/images/big.png"))).toBe(false);
  });

  it("stops reading a streamed body once it passes the limit", async () => {
    const small = http.createServer((request, response) => {
      handleAssetsRequest(request, response, {
        maxBytes: 1024,
        projectRoot: project,
      });
    });
    const smallPort = await listen(small);
    const res = await call({
      body: Buffer.concat([PNG, Buffer.alloc(4096)]),
      headers: {
        "content-type": "image/png",
        host: `127.0.0.1:${smallPort}`,
        origin: `http://127.0.0.1:${smallPort}`,
        "transfer-encoding": "chunked",
      },
      method: "POST",
      path: `${ASSETS_API_PATH}?name=big.png`,
      serverPort: smallPort,
    });
    await new Promise((r) => small.close(r));
    expect(res.status).toBe(413);
    expect(existsSync(join(project, "public/images"))).toBe(false);
  });

  it("keeps a traversal name inside images/", async () => {
    const res = await upload("../../x.png", PNG);
    expect(res.status).toBe(201);
    expect(res.json.path).toBe("public/images/x.png");
    expect(existsSync(join(project, "x.png"))).toBe(false);
    expect(readdirSync(join(project, "public/images"))).toEqual(["x.png"]);
  });

  it("refuses to write through a symlinked public folder", async () => {
    symlinkSync(outside, join(project, "public"));
    const res = await upload("a.png", PNG);
    expect(res.status).toBe(403);
    expect(readdirSync(outside)).toEqual([]);
  });

  it("refuses to write through a symlinked images folder", async () => {
    mkdirSync(join(project, "public"));
    symlinkSync(outside, join(project, "public", "images"));
    const res = await upload("a.png", PNG);
    expect(res.status).toBe(403);
    expect(readdirSync(outside)).toEqual([]);
  });

  it("works when the project root is reached through a symlink", async () => {
    await new Promise((r) => server.close(r));
    const alias = join(outside, "alias");
    symlinkSync(project, alias);
    server = createProxyServer({
      allowedHosts: new Set(),
      defaultMode: "inline",
      onAirshipUpgrade: () => undefined,
      projectRoot: alias,
      targetHost: "127.0.0.1",
      targetPort: 1,
      wsPath: "/__airship/ws",
    });
    port = await listen(server);
    const res = await upload("ok.png", PNG);
    expect(res.status).toBe(201);
  });
});

describe("sanitizeImageName", () => {
  it.each([
    ["Hero Shot.PNG", "hero-shot", "png"],
    ["Café  déjà vu!!.jpg", "cafe-deja-vu", "jpg"],
    ["../../etc/passwd.png", "passwd", "png"],
    ["..\\..\\win.gif", "win", "gif"],
    [".hidden.svg", "hidden", "svg"],
    ["---.webp", "image", "webp"],
    ["a__b--c.d.avif", "a__b-c.d", "avif"],
  ])("%s -> %s.%s", (raw, stem, ext) => {
    expect(sanitizeImageName(raw)).toMatchObject({ ext, stem });
  });

  it("caps the name at 80 characters, extension included", () => {
    const out = sanitizeImageName(`${"a".repeat(200)}.jpeg`);
    expect(out && `${out.stem}.${out.ext}`.length).toBe(80);
  });

  it("rejects names without an allowed extension", () => {
    expect(sanitizeImageName("a.exe")).toBeNull();
    expect(sanitizeImageName("noext")).toBeNull();
    expect(sanitizeImageName("")).toBeNull();
  });
});

describe("sniffImage", () => {
  it("recognizes each format", () => {
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(JPEG)).toBe("jpeg");
    expect(sniffImage(GIF)).toBe("gif");
    expect(sniffImage(WEBP)).toBe("webp");
    expect(sniffImage(AVIF)).toBe("avif");
    expect(sniffImage(ICO)).toBe("ico");
    expect(sniffImage(SVG)).toBe("svg");
  });

  it("rejects html and xml that is not svg", () => {
    expect(sniffImage(Buffer.from("<html><svg/></html>"))).toBeNull();
    expect(sniffImage(Buffer.from('<?xml version="1.0"?><root/>'))).toBeNull();
  });
});
