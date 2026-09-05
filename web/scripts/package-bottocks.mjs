import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { deflateRawSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const version = JSON.parse(
  await readFile(join(root, "integrations/bottocks/package.json"), "utf8"),
).version;
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw new Error("Invalid native adapter version");
// Explicit source allowlist. Never glob a native workspace or package private
// state, tests, credentials, environment files, generated results or transcripts.
const allowlist = [
  "integrations/bottocks/package.json",
  "integrations/bottocks/cli.mjs",
  "integrations/bottocks/client.mjs",
  "integrations/bottocks/README.md",
  "integrations/bottocks/public-runner.mjs",
  "integrations/bottocks/PUBLIC-RUNNER.md",
  "integrations/native-grok/client.mjs",
  "integrations/native-grok/device.mjs",
  "LICENSE"
].sort();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
let commit = null,
  workingTreeDirty = null;
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid commit");
  workingTreeDirty =
    execFileSync("git", ["status", "--porcelain", "--", ...allowlist], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().length > 0;
} catch {
  commit = /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "")
    ? process.env.GITHUB_SHA
    : null;
}
const entries = await Promise.all(
  allowlist.map(async (path) => ({
    path,
    bytes: await readFile(join(root, path)),
  })),
);
entries.push({path: "README.md", bytes: await readFile(join(root, "integrations/bottocks/README.md"))});
entries.sort((a, b) => a.path.localeCompare(b.path));
const manifest = {
  schemaVersion: 1,
  adapter: "@bottocks/adapter",
  version,
  source: { commit, workingTreeDirty },
  files: entries.map(({ path, bytes }) => ({
    path,
    size: bytes.length,
    sha256: sha256(bytes),
  })),
};
entries.push({
  path: "MANIFEST.json",
  bytes: Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
});

// Small deterministic ZIP writer: fixed DOS timestamp, DEFLATE and CRC32.
// It accepts only this bounded allowlist and rejects ZIP64-sized content.
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let crc = n;
  for (let bit = 0; bit < 8; bit++)
    crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
};
const locals = [],
  central = [];
let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.path),
    compressed = deflateRawSync(entry.bytes, { level: 9 });
  if (
    entry.bytes.length > 16 * 1024 * 1024 ||
    name.length > 1024 ||
    /(^\/|\\|\.\.\/)/.test(entry.path)
  )
    throw new Error("Unsafe or oversized archive entry");
  const local = Buffer.alloc(30),
    directory = Buffer.alloc(46),
    crc = crc32(entry.bytes);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(0x5821, 12); // 2024-01-01, reproducible across machines.
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(entry.bytes.length, 22);
  local.writeUInt16LE(name.length, 26);
  directory.writeUInt32LE(0x02014b50);
  directory.writeUInt16LE(20, 4);
  directory.writeUInt16LE(20, 6);
  directory.writeUInt16LE(0x800, 8);
  directory.writeUInt16LE(8, 10);
  directory.writeUInt16LE(0x5821, 14);
  directory.writeUInt32LE(crc, 16);
  directory.writeUInt32LE(compressed.length, 20);
  directory.writeUInt32LE(entry.bytes.length, 24);
  directory.writeUInt16LE(name.length, 28);
  directory.writeUInt32LE(offset, 42);
  locals.push(local, name, compressed);
  central.push(directory, name);
  offset += local.length + name.length + compressed.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...locals, directory, end]);
const output = join(root, "web/public/downloads");
const filename = `bottocks-adapter-${version}.zip`;
await mkdir(output, { recursive: true });
await writeFile(join(output, filename), archive);
await writeFile(
  join(output, `bottocks-adapter-${version}.manifest.json`),
  JSON.stringify(
    {
      ...manifest,
      archive: { filename, size: archive.length, sha256: sha256(archive) },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Packaged ${filename}: ${entries.length} allowlisted/documentation entries, ${archive.length} bytes, sha256 ${sha256(archive)}`,
);
