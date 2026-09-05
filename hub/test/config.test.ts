import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "../src/config.js";

test("an empty deployment moderator list grants nobody and malformed IDs fail closed", () => {
  const base = { HUB_EMBEDDED_DB: "true" };
  for (const value of [undefined, "", "  ", ", ,"]) {
    assert.deepEqual(
      config({ ...base, HUB_POOL_MODERATOR_OWNER_IDS: value })
        .poolModeratorOwnerIds,
      [],
    );
  }
  const id = "11111111-2222-4333-8444-555555555555";
  assert.deepEqual(
    config({ ...base, HUB_POOL_MODERATOR_OWNER_IDS: ` ${id} ` })
      .poolModeratorOwnerIds,
    [id],
  );
  assert.throws(
    () => config({ ...base, HUB_POOL_MODERATOR_OWNER_IDS: `${id},someone` }),
    /immutable owner UUIDs/,
  );
});
