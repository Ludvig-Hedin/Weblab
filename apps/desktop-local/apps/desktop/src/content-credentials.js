// The website and its source files never receive the publish credential.
const { app, safeStorage } = require("electron");
const fs = require("node:fs");
const { join } = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const PROJECT_ID = /^[a-z0-9]{1,64}$/;
const DATASET = /^[a-zA-Z0-9_-]{1,64}$/;
function location({ projectId, dataset }, create = false) {
  if (
    typeof projectId !== "string" ||
    !PROJECT_ID.test(projectId) ||
    typeof dataset !== "string" ||
    !DATASET.test(dataset)
  ) {
    throw new Error("Invalid content connection identity.");
  }
  const directory = join(app.getPath("userData"), "content-connections");
  if (!fs.existsSync(directory) && create) {
    fs.mkdirSync(directory, { mode: 0o700, recursive: true });
  }
  if (
    fs.existsSync(directory) &&
    (fs.lstatSync(directory).isSymbolicLink() ||
      !fs.lstatSync(directory).isDirectory())
  ) {
    throw new Error("The content connection folder must not be a link.");
  }
  return join(
    directory,
    `${createHash("sha256").update(`${projectId}/${dataset}`).digest("hex")}.json`
  );
}
function encrypted(connection) {
  const file = location(connection);
  if (!fs.existsSync(file)) {
    return null;
  }
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.size > 32_000
  ) {
    throw new Error("Invalid content connection file.");
  }
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).join() !== "encrypted" ||
    typeof value.encrypted !== "string" ||
    !value.encrypted ||
    Buffer.from(value.encrypted, "base64").toString("base64") !==
      value.encrypted
  ) {
    throw new Error("Invalid content connection file.");
  }
  return value.encrypted;
}
function has(connection) {
  return encrypted(connection) !== null;
}
function token(connection) {
  const value = encrypted(connection);
  if (value === null) {
    return null;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Unlock your Mac keychain to publish text.");
  }
  return safeStorage.decryptString(Buffer.from(value, "base64"));
}
const TOKEN = /^[A-Za-z0-9_-]{20,4096}$/;
function encodeToken(value) {
  if (typeof value !== "string" || !TOKEN.test(value)) {
    throw new Error("Enter a valid Sanity write token.");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Unlock your Mac keychain before connecting.");
  }
  return JSON.stringify({
    encrypted: safeStorage.encryptString(value).toString("base64"),
  });
}
function connect(connection, value) {
  const encoded = encodeToken(value);
  const file = location(connection, true);
  if (fs.existsSync(file)) {
    throw new Error("This content project is already connected.");
  }
  fs.writeFileSync(file, encoded, { flag: "wx", mode: 0o600 });
  return { ok: true };
}
/** Only the explicit native Replace connection action may call this. */
function replace(connection, value) {
  const encoded = encodeToken(value);
  if (encrypted(connection) === null) {
    throw new Error("Connect this content project first.");
  }
  const file = location(connection);
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, encoded, { flag: "wx", mode: 0o600 });
  try {
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) {
      fs.unlinkSync(temporary);
    }
  }
  return { ok: true };
}
module.exports = { connect, has, replace, token };
