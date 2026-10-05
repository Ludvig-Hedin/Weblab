// The short note that goes with an upload, written by Claude from the changes.
// Runs the bundled Claude Code binary once, in a scratch folder with no tools,
// settings or MCP servers, so the site's own setup never slows it down. If
// Claude is slow or unavailable, a plain sentence stands in.

const { spawn } = require("node:child_process");
const { tmpdir } = require("node:os");
const { childEnv, claudeBinary } = require("./runtime");
const auth = require("./auth");

const MODEL = "claude-sonnet-5";
const EFFORT = "medium";
const TIMEOUT_MS = 15_000;
const MAX_LENGTH = 72;

const PROMPT = `You write the one-line note saved with a website change.
Read the changes below and reply with ONE plain sentence, under ${MAX_LENGTH} characters,
saying what changed for a visitor of the site. Start with a verb, like
"Update", "Add" or "Remove". No quotes, no file extensions, no full stop.

`;

/** "Update hero.tsx, pricing.css and 1 more" */
function fallback(paths) {
  const names = paths.map((path) => path.split("/").pop());
  if (names.length === 0) {
    return "Update site";
  }
  if (names.length <= 2) {
    return `Update ${names.join(" and ")}`;
  }
  return `Update ${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

function clean(text) {
  const line = String(text || "")
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) {
    return "";
  }
  return line
    .replace(/^["'`]+|["'`.]+$/g, "")
    .slice(0, MAX_LENGTH + 20)
    .trim();
}

function askClaude(summary) {
  return new Promise((resolve) => {
    const env = childEnv();
    const key = auth.readApiKey();
    if (key) {
      env.ANTHROPIC_API_KEY = key;
    }
    let out = "";
    let child;
    try {
      child = spawn(
        claudeBinary(),
        [
          "-p",
          "--model",
          MODEL,
          "--effort",
          EFFORT,
          "--tools",
          "",
          "--strict-mcp-config",
          "--setting-sources",
          "",
          "--no-session-persistence",
          "--disable-slash-commands",
        ],
        { cwd: tmpdir(), env, stdio: ["pipe", "pipe", "ignore"] }
      );
    } catch {
      resolve("");
      return;
    }
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", () => resolve(""));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? clean(out) : "");
    });
    child.stdin.end(`${PROMPT}${summary}`);
  });
}

/** { text, byAi } for the picked files. */
async function write(summary, paths) {
  if (!summary.trim()) {
    return { byAi: false, text: fallback(paths) };
  }
  const text = await askClaude(summary);
  return text ? { byAi: true, text } : { byAi: false, text: fallback(paths) };
}

module.exports = { fallback, write };
