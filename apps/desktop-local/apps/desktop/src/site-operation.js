// One native write operation per site, including across separate windows.
const { realpathSync } = require("node:fs");
const busy = new Set();
async function exclusive(root, action) {
  const key = realpathSync(root);
  if (busy.has(key)) {
    throw new Error(
      "This site is saving or publishing. Wait for it to finish."
    );
  }
  busy.add(key);
  try {
    return await action();
  } finally {
    busy.delete(key);
  }
}
module.exports = { exclusive };
