import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database, Row } from "./db.js";
import { assertActiveOwner, lockAdmission } from "./limits.js";
import { choice, fail, hash, integer, object } from "./security.js";

export function validateAvatar(value: unknown) {
  const input = object(value, [
    "version",
    "color",
    "expression",
    "accessory",
    "badge",
  ]);
  if (input.version !== 1) fail(400, "Unsupported avatar version");
  return {
    version: 1 as const,
    color: choice(
      input.color,
      ["#74DFEE", "#FF5792", "#F8FF45", "#B3A4FF", "#FFFBEF"] as const,
      "avatar color",
    ),
    expression: choice(
      input.expression,
      ["happy", "wink", "sleepy"] as const,
      "avatar expression",
    ),
    accessory: choice(
      input.accessory,
      ["antenna", "sprout", "crown"] as const,
      "avatar accessory",
    ),
    badge: choice(
      input.badge,
      [
        "Certified overthinker",
        "Emotionally cached",
        "Runs on questionable ideas",
        "Here for the floating points",
      ] as const,
      "decorative badge",
    ),
  };
}
export const avatarView = (row: Row) => ({
  botId: row.id,
  config: row.avatar_config ?? null,
  revision: row.avatar_revision ?? 0,
  updatedAt: row.avatar_updated_at
    ? new Date(row.avatar_updated_at).toISOString()
    : null,
});
export function registerAvatars(
  app: FastifyInstance,
  db: Database,
  owner: (request: FastifyRequest, mutation?: boolean) => Promise<Row>,
) {
  app.get("/api/bots/:id/avatar", async (request) => {
    const own = await owner(request);
    const row = (
      await db.query(
        "SELECT * FROM bots WHERE id=$1 AND owner_id=$2 AND status<>'revoked'",
        [(request.params as Row).id, own.id],
      )
    ).rows[0];
    if (!row) return fail(404, "Owned bot is unavailable");
    return avatarView(row);
  });
  for (const method of ["PUT", "DELETE"] as const)
    app.route({
      method,
      url: "/api/bots/:id/avatar",
      handler: async (request) => {
        const own = await owner(request, true);
        const input = object(
          request.body,
          method === "PUT"
            ? ["config", "expectedRevision"]
            : ["expectedRevision"],
        );
        const revision = integer(
          input.expectedRevision,
          0,
          2147483646,
          "expectedRevision",
        );
        const config = method === "PUT" ? validateAvatar(input.config) : null;
        return db.transaction(async (tx) => {
          await lockAdmission(tx);
          await assertActiveOwner(tx, own.id);
          let row = (
            await tx.query(
              "SELECT * FROM bots WHERE id=$1 AND owner_id=$2 AND status<>'revoked' FOR UPDATE",
              [(request.params as Row).id, own.id],
            )
          ).rows[0];
          if (!row) return fail(404, "Owned bot is unavailable");
          const same =
            hash(
              JSON.stringify(
                row.avatar_config ? validateAvatar(row.avatar_config) : null,
              ),
            ) === hash(JSON.stringify(config));
          // An identical retry may confirm a lost response; a stale different draft cannot overwrite a newer assignment.
          if (
            row.avatar_revision !== revision &&
            !(same && row.avatar_revision === revision + 1)
          )
            fail(
              409,
              "Avatar changed; read the current assignment before retrying",
            );
          if (!same) {
            row = (
              await tx.query(
                "UPDATE bots SET avatar_config=$2,avatar_revision=avatar_revision+1,avatar_updated_at=now() WHERE id=$1 RETURNING *",
                [row.id, config === null ? null : JSON.stringify(config)],
              )
            ).rows[0];
            await tx.query(
              "INSERT INTO events(id,owner_id,type,message) VALUES($1,$2,'bot.avatar',$3)",
              [
                randomUUID(),
                own.id,
                `Updated avatar assignment for bot ${row.id}`,
              ],
            );
          }
          return {
            ...avatarView(row),
            replayed: same,
            receipt: {
              botId: row.id,
              revision: row.avatar_revision,
              configurationHash: hash(JSON.stringify(config)),
            },
          };
        });
      },
    });
}
