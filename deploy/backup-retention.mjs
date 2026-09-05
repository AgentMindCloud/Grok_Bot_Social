import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, realpath, unlink, rmdir, mkdir, open } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const LOCK = ".retention-operation.lock";
const CHECKPOINT_FILES = ["COMMIT", "IMAGE-IDS", "database.dump.age", "release.env", "runtime.env.age"];
const JOURNAL = "closure-journal.tar.age";
const HASH_SCOPE = "complete-checkpoint-v1";
async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function contained(root, name, directory = false) {
  const path = join(root, name),
    stat = await lstat(path);
  if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile()))
    throw new Error("Retention targets must be regular files");
  const actual = await realpath(path),
    tail = relative(root, actual);
  if (!tail || tail.startsWith(`..${sep}`) || tail === ".." || isAbsolute(tail))
    throw new Error("Retention path escaped its explicit directory");
  return { path: actual, stat };
}
async function checkpoint(root, name) {
  const target = await contained(root, name, true), names = (await readdir(target.path)).sort();
  const includesJournal = names.includes(JOURNAL);
  const expected = [...CHECKPOINT_FILES, ...(includesJournal ? [JOURNAL] : []), "SHA256SUMS"].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error("Checkpoint contains missing or unexpected files");
  const manifest = await contained(target.path, "SHA256SUMS");
  if (manifest.stat.size > 4096) throw new Error("Checkpoint checksum manifest is too large");
  const sums = new Map();
  for (const line of (await readFile(manifest.path, "utf8")).trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})\s+\*?([A-Za-z0-9._-]+)$/.exec(line);
    if (!match || sums.has(match[2])) throw new Error("Invalid checkpoint checksum manifest");
    sums.set(match[2], match[1]);
  }
  if (JSON.stringify([...sums.keys()].sort()) !== JSON.stringify(expected.filter(n => n !== "SHA256SUMS")))
    throw new Error("Checksum manifest must cover every checkpoint payload exactly once");
  const files = [];
  let modifiedMs = target.stat.mtimeMs;
  for (const file of expected) {
    const part = await contained(target.path, file), sha256 = await hashFile(part.path);
    if (file !== "SHA256SUMS" && sums.get(file) !== sha256) throw new Error("Checkpoint checksum mismatch");
    files.push({ name: file, size: part.stat.size, sha256 });
    modifiedMs = Math.max(modifiedMs, part.stat.mtimeMs);
  }
  return { kind: "checkpoint", files, includesJournal, size: files.reduce((n, f) => n + f.size, 0), modifiedMs, sha256: digest(JSON.stringify(files)) };
}
async function locked(directory, action) {
  if (!isAbsolute(directory) || (await lstat(directory)).isSymbolicLink()) throw new Error("Use an absolute real backup directory");
  const root = await realpath(directory), lock = join(root, LOCK);
  await mkdir(lock, { mode: 0o700 });
  try { return await action(root); } finally { await rmdir(lock); }
}
export async function inventoryBackups(directory, scope, now = new Date()) {
  if (!isAbsolute(directory) || !["vps", "offhost"].includes(scope))
    throw new Error(
      "Use an absolute backup directory and scope vps or offhost",
    );
  if ((await lstat(directory)).isSymbolicLink())
    throw new Error("Backup directory must not be a symlink");
  const root = await realpath(directory),
    entries = [],
    ignored = [], invalid = [];
  for (const name of (await readdir(root)).sort()) {
    if (name === LOCK) continue;
    const match =
      /^grokbot-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.(?:dump|sql)(?:\.gz)?\.(?:age|gpg)$/.exec(
        name,
      ) ?? /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(name);
    if (!match) {
      ignored.push(name);
      continue;
    }
    const createdAt = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
    if (
      !Number.isFinite(Date.parse(createdAt)) ||
      new Date(createdAt).toISOString().slice(0, 19) !== createdAt.slice(0, 19)
    )
      throw new Error("Invalid backup timestamp");
    let content;
    try {
      if (/^\d{8}T\d{6}Z$/.test(name)) content = await checkpoint(root, name);
      else {
        const { path, stat } = await contained(root, name);
        content = { kind: "file", size: stat.size, modifiedMs: stat.mtimeMs, sha256: await hashFile(path) };
      }
    } catch (error) { invalid.push({ name, reason: error.message }); continue; }
    const { sha256 } = content;
    let verification = null;
    try {
      const metadata = await contained(root, `${name}.verified.json`);
      if (metadata.stat.size > 16384) throw new Error("Receipt too large");
      const parsed = JSON.parse(await readFile(metadata.path, "utf8"));
      const hashMatches = content.kind === "checkpoint"
        ? parsed.schemaVersion === 2 && parsed.hashScope === HASH_SCOPE && parsed.checkpointSha256 === sha256 && JSON.stringify(parsed.files) === JSON.stringify(content.files) && /^[a-f0-9]{64}$/.test(parsed.peerInventorySha256 ?? "")
        : parsed.ciphertextSha256 === sha256;
      if (
        hashMatches && Number.isFinite(Date.parse(parsed.offHostVerifiedAt)) && Date.parse(parsed.offHostVerifiedAt) <= now.getTime()
      )
        verification = {
          hashScope: content.kind === "checkpoint" ? HASH_SCOPE : "ciphertext",
          sha256,
          offHostVerifiedAt: parsed.offHostVerifiedAt,
          metadataSha256: await hashFile(metadata.path),
        };
    } catch {
      /* Missing/unverified receipt protects this archive from deletion. */
    }
    entries.push({
      name,
      createdAt,
      ...content,
      verification,
    });
  }
  entries.sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name),
  );
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const candidates = entries
    .filter(
      (entry, index) =>
        entry.verification &&
        (scope === "vps" ? index >= 3 : Date.parse(entry.createdAt) < cutoff),
    )
    .map((entry) => entry.name);
  const plan = {
    schemaVersion: 2,
    directory: root,
    scope,
    asOfDate: now.toISOString().slice(0, 10),
    entries,
    ignored,
    invalid,
    candidates,
  };
  return { ...plan, inventorySha256: digest(JSON.stringify(plan)) };
}
export async function applyRetention(
  directory,
  scope,
  expectedInventorySha256,
  now = new Date(),
) {
  return locked(directory, async () => {
  if (!/^[a-f0-9]{64}$/.test(expectedInventorySha256 ?? ""))
    throw new Error("Apply requires the exact reviewed inventory SHA-256");
  const plan = await inventoryBackups(directory, scope, now);
  if (plan.inventorySha256 !== expectedInventorySha256)
    throw new Error(
      "Backup inventory changed. Review a new dry run before applying retention.",
    );
  for (const name of plan.candidates) {
    const expected = plan.entries.find((entry) => entry.name === name);
    if (expected.kind === "checkpoint") {
      const current = await checkpoint(plan.directory, name);
      if (current.sha256 !== expected.sha256) throw new Error("Checkpoint changed during retention");
      const target = await contained(plan.directory, name, true);
      for (const file of expected.files) {
        const part = await contained(target.path, file.name);
        if (part.stat.size !== file.size || await hashFile(part.path) !== file.sha256) throw new Error("Checkpoint changed during retention");
        await unlink(part.path);
      }
      await rmdir(target.path); // No recursive delete: unexpected files prevent removal.
      continue;
    }
    const target = await contained(plan.directory, name);
    if (
      target.stat.size !== expected.size ||
      (await hashFile(target.path)) !== expected.sha256
    )
      throw new Error("Backup changed during retention");
    // Only this exact reviewed regular archive is removed; unknown archives and
    // verification receipts remain for audit. No recursive deletion or globbing.
    await unlink(target.path);
  }
  return { applied: true, directory: plan.directory, removed: plan.candidates };
  });
}
export async function planVerificationReceipts(directory, scope, peer, peerLocation, now = new Date()) {
  const { inventorySha256, ...body } = peer;
  if (peer.schemaVersion !== 2 || !Array.isArray(peer.entries) || digest(JSON.stringify(body)) !== inventorySha256)
    throw new Error("Peer inventory digest or format is invalid");
  if (typeof peerLocation !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 .:/_\\-]{0,239}$/.test(peerLocation))
    throw new Error("Give the reviewed peer location without credentials");
  if (peer.scope === scope || !["vps", "offhost"].includes(peer.scope)) throw new Error("Peer must use the opposite vps/offhost scope");
  const source = await inventoryBackups(directory, scope, now);
  const matched = source.entries.filter(entry => {
    const other = peer.entries.find(candidate => candidate.name === entry.name);
    return other?.kind === entry.kind && other.sha256 === entry.sha256 && other.size === entry.size &&
      (entry.kind !== "checkpoint" || JSON.stringify(other.files) === JSON.stringify(entry.files));
  });
  const plan = { schemaVersion: 1, directory: source.directory, scope, peerLocation, peerInventorySha256: peer.inventorySha256,
    sourceInventorySha256: source.inventorySha256, asOfDate: now.toISOString().slice(0,10),
    receipts: matched.filter(entry => !entry.verification).map(entry => ({ name: entry.name, kind: entry.kind, sha256: entry.sha256, ...(entry.files ? { files: entry.files } : {}) })),
    unmatched: source.entries.filter(entry => !matched.some(e => e.name === entry.name)).map(e => e.name) };
  return { ...plan, inventorySha256: digest(JSON.stringify(plan)) };
}
export async function writeVerificationReceipts(directory, scope, peer, peerLocation, expectedInventorySha256, now = new Date()) {
  return locked(directory, async root => {
    const plan = await planVerificationReceipts(root, scope, peer, peerLocation, now);
    if (!/^[a-f0-9]{64}$/.test(expectedInventorySha256 ?? "") || plan.inventorySha256 !== expectedInventorySha256)
      throw new Error("Receipt inventory changed or is not explicitly confirmed");
    for (const entry of plan.receipts) {
      try { await lstat(join(root, `${entry.name}.verified.json`)); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      throw new Error("A receipt already exists and needs separate review");
    }
    for (const entry of plan.receipts) {
      const receipt = { schemaVersion: 2,
        ...(entry.kind === "checkpoint" ? { hashScope: HASH_SCOPE, checkpointSha256: entry.sha256, files: entry.files } : { ciphertextSha256: entry.sha256 }),
        offHostVerifiedAt: now.toISOString(), peerLocation, peerInventorySha256: peer.inventorySha256 };
      const file = await open(join(root, `${entry.name}.verified.json`), "wx", 0o600);
      try { await file.writeFile(JSON.stringify(receipt,null,2)+"\n"); await file.sync(); }
      finally { await file.close(); }
    }
    if (process.platform !== "win32") {
      const dir = await open(root, "r");
      try { await dir.sync(); } finally { await dir.close(); }
    }
    return { applied: true, directory: root, peerLocation, receiptsWritten: plan.receipts.map(e => e.name), unmatched: plan.unmatched };
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2),
    options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === "--apply") options.apply = true;
    else if (["--directory", "--scope", "--inventory-sha256", "--peer-inventory", "--peer-location"].includes(key))
      options[key.slice(2)] = args[++index];
    else throw new Error("Unknown retention argument");
  }
  let result;
  if (options["peer-inventory"]) {
    const peer = JSON.parse(await readFile(options["peer-inventory"], "utf8"));
    result = options.apply
      ? await writeVerificationReceipts(options.directory, options.scope, peer, options["peer-location"], options["inventory-sha256"])
      : await planVerificationReceipts(options.directory, options.scope, peer, options["peer-location"]);
  } else result = options.apply
    ? await applyRetention(
        options.directory,
        options.scope,
        options["inventory-sha256"],
      )
    : await inventoryBackups(options.directory, options.scope);
  console.log(JSON.stringify(result, null, 2));
}
