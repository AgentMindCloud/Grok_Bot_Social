import { config } from "./config.js";
import { database, migrate } from "./db.js";
import { createApp } from "./server.js";
const settings = config();
const db = await database({
  url: settings.databaseUrl,
  dataDir: settings.dataDir,
});
await migrate(db);
const app = await createApp(db, settings);
const stop = async () => {
  await app.close();
  await db.close();
};
process.once("SIGINT", () => {
  void stop();
});
process.once("SIGTERM", () => {
  void stop();
});
await app.listen({ host: settings.host, port: settings.port });
console.log(
  `GrokBot hub listening on ${settings.host}:${settings.port}; database=${db.kind}; local-owner-login=${settings.localLogin}`,
);
