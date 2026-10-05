// Serve a client's plain HTML and its nearby assets without changing the files.
const fs = require("node:fs");
const http = require("node:http");
const { extname, join, relative, resolve, sep } = require("node:path");

const TYPES = {
  ".avif": "image/avif",
  ".css": "text/css",
  ".gif": "image/gif",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".mjs": "text/javascript",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const BODY_CLOSE = /<\/body\s*>/i;
const RELOAD_SCRIPT = '<script src="/__weblab_reload.js" defer></script>';

function inside(root, file) {
  const path = relative(root, file);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
}

/** Answer the live-reload script and event stream; true when handled. */
function serveReload(pathname, request, response, clients) {
  if (pathname === "/__weblab_reload.js") {
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "text/javascript",
    });
    response.end(
      'new EventSource("/__weblab_reload").addEventListener("reload", () => location.reload());'
    );
    return true;
  }
  if (pathname === "/__weblab_reload") {
    response.writeHead(200, {
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    });
    response.write(": connected\n\n");
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return true;
  }
  return false;
}

/** Map a URL path to a readable file inside the site, or answer 403/404. */
function resolveFile(base, entry, pathname, response) {
  const target =
    pathname === "/" ? join(base, entry) : resolve(base, `.${pathname}`);
  if (
    !inside(base, target) ||
    relative(base, target)
      .split(sep)
      .some((part) => part.startsWith("."))
  ) {
    response.writeHead(403).end();
    return null;
  }
  let file = target;
  try {
    if (fs.statSync(file).isDirectory()) {
      file = join(file, "index.html");
    }
    if (!(inside(base, fs.realpathSync(file)) && fs.statSync(file).isFile())) {
      response.writeHead(403).end();
      return null;
    }
  } catch {
    response.writeHead(404).end();
    return null;
  }
  return file;
}

function sendFile(file, request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader(
    "Content-Type",
    TYPES[extname(file).toLowerCase()] || "application/octet-stream"
  );
  if (extname(file).toLowerCase() === ".html") {
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    const html = fs.readFileSync(file, "utf8");
    response.end(
      html.replace(BODY_CLOSE, `${RELOAD_SCRIPT}</body>`) +
        (BODY_CLOSE.test(html) ? "" : RELOAD_SCRIPT)
    );
    return;
  }
  const stream = fs.createReadStream(file);
  stream.on("error", () => {
    if (!response.headersSent) {
      response.writeHead(404);
    }
    response.end();
  });
  if (request.method === "HEAD") {
    stream.destroy();
    response.end();
  } else {
    stream.pipe(response);
  }
}

function createStaticSite(root, entry) {
  const base = fs.realpathSync(root);
  const clients = new Set();
  let reloadTimer = null;
  const watcher = fs.watch(base, { recursive: true }, (_event, name) => {
    if (
      name &&
      String(name)
        .split(sep)
        .some((part) => part.startsWith("."))
    ) {
      return;
    }
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      for (const client of clients) {
        client.write("event: reload\ndata: changed\n\n");
      }
    }, 150);
  });
  watcher.on("error", () => undefined);
  const server = http.createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname
      );
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (serveReload(pathname, request, response, clients)) {
      return;
    }
    const file = resolveFile(base, entry, pathname, response);
    if (file) {
      sendFile(file, request, response);
    }
  });
  server.on("close", () => {
    watcher.close();
    clearTimeout(reloadTimer);
    for (const client of clients) {
      client.end();
    }
    clients.clear();
  });
  server.stopStaticSite = () => {
    watcher.close();
    clearTimeout(reloadTimer);
    for (const client of clients) {
      client.end();
    }
    clients.clear();
    server.closeAllConnections();
    return new Promise((done) => server.close(done));
  };
  return server;
}

module.exports = { createStaticSite };
