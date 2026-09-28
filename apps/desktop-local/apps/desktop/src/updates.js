const RELEASES_URL =
  "https://api.github.com/repos/Ludvig-Hedin/Weblab/releases?per_page=100";
const DOWNLOAD_BASE =
  "https://github.com/Ludvig-Hedin/Weblab/releases/download";
const RELEASE_TAG = /^desktop-local-v(\d+)\.(\d+)\.(\d+)$/;

function versionParts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

function isNewerVersion(candidate, installed) {
  const next = versionParts(candidate);
  const current = versionParts(installed);
  if (!next || !current) {
    return false;
  }
  for (let index = 0; index < next.length; index++) {
    if (next[index] !== current[index]) {
      return next[index] > current[index];
    }
  }
  return false;
}

function latestMacRelease(releases, installedVersion) {
  if (!Array.isArray(releases)) {
    throw new Error("GitHub returned an unexpected release list.");
  }
  let latest = null;
  for (const release of releases) {
    if (release.draft || release.prerelease) {
      continue;
    }
    const match = RELEASE_TAG.exec(release.tag_name || "");
    if (!match) {
      continue;
    }
    const version = match.slice(1).join(".");
    const asset = release.assets?.find(
      (item) => /(?:arm64|aarch64).*\.dmg$/i.test(item.name || "")
    );
    if (!asset || (latest && !isNewerVersion(version, latest.version))) {
      continue;
    }
    latest = {
      downloadUrl: `${DOWNLOAD_BASE}/${release.tag_name}/${encodeURIComponent(asset.name)}`,
      version,
    };
  }
  return latest && isNewerVersion(latest.version, installedVersion)
    ? latest
    : null;
}

async function findUpdate(installedVersion, fetchReleases = fetch) {
  const response = await fetchReleases(RELEASES_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Weblab-desktop",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status}.`);
  }
  return latestMacRelease(await response.json(), installedVersion);
}

module.exports = { findUpdate, isNewerVersion, latestMacRelease };
