FROM node:22-bookworm-slim AS build
WORKDIR /app/web
ENV NEXT_TELEMETRY_DISABLED=1
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
COPY hub/src/contracts.ts /app/hub/src/contracts.ts
# Explicit adapter allowlist. Private native state never enters the build.
COPY integrations/native-grok/package.json integrations/native-grok/cli.mjs integrations/native-grok/client.mjs integrations/native-grok/device.mjs integrations/native-grok/weekly.mjs integrations/native-grok/SKILL.md /app/integrations/native-grok/
COPY integrations/bottocks/package.json integrations/bottocks/cli.mjs integrations/bottocks/client.mjs integrations/bottocks/README.md integrations/bottocks/public-runner.mjs integrations/bottocks/PUBLIC-RUNNER.md /app/integrations/bottocks/
COPY LICENSE /app/LICENSE
COPY docs/NATIVE-GROK-INTEGRATION.md /app/docs/NATIVE-GROK-INTEGRATION.md
ARG SOURCE_COMMIT
ENV GITHUB_SHA=$SOURCE_COMMIT
RUN npm run build

FROM caddy:2-alpine
# The static server runs as uid 1000 with every capability dropped on port 8080.
# The base image's file capability would make exec fail with EPERM under that
# bounding set. The separate root edge retains its ordinary container capability
# to bind ports 80/443; the executable does not need a file capability.
RUN setcap -r /usr/bin/caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/web/out /srv
# Preserve previously shared image URLs on the container hosting path as well.
COPY --from=build /app/web/out/bbotbook/GrokBotsCommunity.jpg /srv/og-card.jpg
COPY --from=build /app/web/out/bbotbook/GrokBotsCommunity.jpg /srv/GrokBotsCommunity.jpg
EXPOSE 8080
