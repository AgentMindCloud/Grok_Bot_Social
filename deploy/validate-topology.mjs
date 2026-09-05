import assert from "node:assert/strict";
import { isIP } from "node:net";
const role = process.argv[2];
assert.ok(
  ["production", "staging", "edge"].includes(role),
  "Pass production, staging or edge",
);
let input = "";
for await (const chunk of process.stdin) input += chunk;
const model = JSON.parse(input),
  services = model.services;
if (role === "edge") {
  assert.deepEqual(Object.keys(services), ["edge"]);
  assert.equal(services.edge.ports.length, 3);
  for (const environment of ["production", "staging"]) {
    assert.equal(model.networks[environment].internal, true);
    assert.equal(isIP(services.edge.networks[environment].ipv4_address), 4);
  }
  assert.equal(model.volumes["tls-data"].external, true);
} else {
  for (const service of Object.values(services))
    assert.equal(service.ports?.length ?? 0, 0, "Only edge may publish ports");
  assert.deepEqual(Object.keys(services.database.networks), ["private"]);
  assert.equal(model.networks.private.internal, true);
  assert.equal(model.networks.ingress.external, true);
  assert.equal(services.web.environment.PUBLIC_HOST, ":8080");
  assert.deepEqual(Object.keys(services.web.networks), ["ingress"]);
  assert.equal(services.hub.environment.HUB_LOCAL_OWNER_LOGIN, "false");
  assert.equal(services.hub.environment.HUB_WORKSPACE_ENABLED, "true");
  assert.equal(
    services.hub.environment.HUB_CLOSURE_JOURNAL_DIR,
    "/var/lib/grokbot-journal/records",
  );
  assert.equal(services["journal-init"].network_mode, "none");
  assert.equal(
    services.hub.depends_on["journal-init"].condition,
    "service_completed_successfully",
  );
  assert.equal(
    isIP(services.hub.environment.HUB_TRUSTED_PROXY_IPS),
    4,
    "Trust one exact edge IP only",
  );
  assert.equal(services.hub.environment.HUB_X_AUTO_RECHARGE, "false");
  assert.equal(services.hub.environment.HUB_X_MONTHLY_BUDGET_USD, "10");
  if (role === "production") {
    assert.equal(model.volumes.database.external, true);
    assert.equal(model.volumes["closure-journal"].external, true);
  } else {
    assert.equal(model.volumes.database.external ?? false, false);
    assert.equal(
      model.volumes.database.name,
      "grokbot-social-staging_database",
    );
  }
}
console.log(
  `${role}: topology and launch safety invariants passed (resolved credentials not printed).`,
);
