import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  realpath,
} from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fail, hash } from "./security.js";

export interface ClosureIntent {
  schemaVersion: 1;
  eventId: string;
  action: "account-close" | "bot-revoke";
  ownerId: string;
  botId?: string;
  requestedAt: string;
}
const closedOwners = new Set<string>();
const revokedBots = new Set<string>();
export function journalBlocksOwner(ownerId: unknown): boolean {
  return typeof ownerId === "string" && closedOwners.has(ownerId);
}
export function journalBlocksBot(botId: unknown): boolean {
  return typeof botId === "string" && revokedBots.has(botId);
}
function remember(intent: ClosureIntent) {
  if (intent.action === "account-close") closedOwners.add(intent.ownerId);
  else revokedBots.add(intent.botId!);
}
function validate(value: unknown): ClosureIntent {
  const record = value as Record<string, unknown>;
  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record) ||
    Object.keys(record).some(
      (key) =>
        ![
          "schemaVersion",
          "eventId",
          "action",
          "ownerId",
          "botId",
          "requestedAt",
        ].includes(key),
    ) ||
    record.schemaVersion !== 1 ||
    !/^[a-f0-9-]{36}$/.test(String(record.eventId)) ||
    !["account-close", "bot-revoke"].includes(String(record.action)) ||
    typeof record.ownerId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(record.ownerId) ||
    typeof record.requestedAt !== "string" ||
    !Number.isFinite(Date.parse(record.requestedAt)) ||
    (record.action === "bot-revoke" &&
      (typeof record.botId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(record.botId))) ||
    (record.action === "account-close" && record.botId !== undefined)
  )
    throw new Error("Invalid closure journal record");
  return record as unknown as ClosureIntent;
}

/** Independent durable volume, never included in a database restore. Entries
 * are exclusive-create, fsynced, then read-only; the application never updates
 * or deletes them. Directory permissions protect it from other local users.
 */
export class ClosureJournal {
  private actualRoot?: string;
  private pendingIntents = new Map<string, ClosureIntent>();
  constructor(
    private directory: string,
    private strictDirectorySync = process.platform !== "win32",
  ) {
    if (!isAbsolute(directory))
      throw new Error(
        "Closure journal must use an absolute persistent directory",
      );
  }
  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Closure journal directory is invalid");
    this.actualRoot = await realpath(this.directory);
    if (process.platform !== "win32") await chmod(this.actualRoot, 0o700);
  }
  private async syncDirectory(): Promise<void> {
    try {
      const fd = await open(this.actualRoot!, "r");
      try {
        await fd.sync();
      } finally {
        await fd.close();
      }
    } catch (error) {
      if (this.strictDirectorySync) throw error;
    }
  }
  async append(
    action: ClosureIntent["action"],
    ownerId: string,
    botId?: string,
  ): Promise<ClosureIntent> {
    const intent = validate({
      schemaVersion: 1,
      eventId: randomUUID(),
      action,
      ownerId,
      ...(botId ? { botId } : {}),
      requestedAt: new Date().toISOString(),
    });
    const payload = JSON.stringify(intent),
      bytes = JSON.stringify({ intent, sha256: hash(payload) }) + "\n";
    try {
      if (!this.actualRoot) await this.initialize();
      const handle = await open(
        join(this.actualRoot!, `${intent.eventId}.json`),
        "wx",
        0o600,
      );
      try {
        await handle.writeFile(bytes, "utf8");
        if (process.platform !== "win32") await handle.chmod(0o400);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.syncDirectory();
      // An explicit durable intent blocks access even if its DB transaction
      // subsequently fails or the HTTP response is lost. Startup replays it.
      remember(intent);
      this.pendingIntents.set(intent.eventId, intent);
      return intent;
    } catch {
      return fail(
        503,
        "Protected revocation storage failed. Completion is unconfirmed; retry after service recovery.",
      );
    }
  }
  pending(): ClosureIntent[] {
    return [...this.pendingIntents.values()];
  }
  markApplied(eventId: string): void {
    this.pendingIntents.delete(eventId);
  }
  async *records(): AsyncGenerator<ClosureIntent> {
    if (!this.actualRoot) await this.initialize();
    const directory = await opendir(this.actualRoot!);
    for await (const entry of directory) {
      if (
        !/^[a-f0-9-]{36}\.json$/.test(entry.name) ||
        !entry.isFile() ||
        entry.isSymbolicLink()
      )
        throw new Error(
          "Unexpected closure journal entry; refusing service startup",
        );
      const path = join(this.actualRoot!, entry.name),
        stat = await lstat(path);
      if (stat.size > 4096 || stat.isSymbolicLink())
        throw new Error("Invalid closure journal file");
      const record = JSON.parse(await readFile(path, "utf8"));
      if (!record || Object.keys(record).sort().join(",") !== "intent,sha256")
        throw new Error("Invalid closure journal envelope");
      const intent = validate(record.intent);
      if (
        `${intent.eventId}.json` !== entry.name ||
        hash(JSON.stringify(intent)) !== record.sha256
      )
        throw new Error("Closure journal integrity check failed");
      remember(intent);
      this.pendingIntents.set(intent.eventId, intent);
      yield intent;
    }
  }
}
