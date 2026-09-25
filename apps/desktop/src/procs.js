// Stopping a process and everything it started. The Airship CLI puts the dev
// server in its own process group, so killing the CLI's group is not enough if
// the CLI itself is stuck: snapshot the whole tree first, then escalate.

const { execFileSync } = require("node:child_process");

const WHITESPACE = /\s+/;

function processTable() {
  try {
    const out = execFileSync("/bin/ps", ["-A", "-o", "pid=,ppid=,pgid="], {
      encoding: "utf8",
      timeout: 5000,
    });
    return out
      .trim()
      .split("\n")
      .map((line) => {
        const [pid, ppid, pgid] = line.trim().split(WHITESPACE).map(Number);
        return { pgid, pid, ppid };
      });
  } catch {
    return [];
  }
}

/** The pid itself plus every descendant, with their process groups. */
function snapshotTree(rootPid) {
  const table = processTable();
  const pids = new Set([rootPid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of table) {
      if (!pids.has(row.pid) && pids.has(row.ppid)) {
        pids.add(row.pid);
        grew = true;
      }
    }
  }
  const ownGroup = table.find((row) => row.pid === process.pid)?.pgid;
  const groups = new Set(
    table
      .filter(
        (row) => pids.has(row.pid) && row.pgid > 1 && row.pgid !== ownGroup
      )
      .map((row) => row.pgid)
  );
  return { groups: [...groups], pids: [...pids] };
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signal(target, sig) {
  try {
    process.kill(target, sig);
  } catch {
    // Already gone.
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * SIGTERM the root and let it shut its children down; after `graceMs`, SIGKILL
 * whatever from the original tree is still around.
 */
async function stopTree(child, graceMs = 6000) {
  if (!child || child.pid === undefined) {
    return;
  }
  const rootPid = child.pid;
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  const tree = snapshotTree(rootPid);
  if (!exited()) {
    signal(rootPid, "SIGTERM");
  }
  for (let waited = 0; waited < graceMs; waited += 200) {
    if (exited() && tree.pids.every((pid) => pid === rootPid || !alive(pid))) {
      return;
    }
    // biome-ignore lint/performance/noAwaitInLoops: polling another process's exit is sequential by nature
    await sleep(200);
  }
  // Only groups this tree owned: the CLI's own group and the dev server's.
  for (const group of tree.groups) {
    signal(-group, "SIGKILL");
  }
  for (const pid of tree.pids) {
    if (alive(pid)) {
      signal(pid, "SIGKILL");
    }
  }
}

module.exports = { stopTree };
