FROM node:22-bookworm-slim AS build
WORKDIR /app/web
ENV NEXT_TELEMETRY_DISABLED=1
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
COPY hub/src/contracts.ts /app/hub/src/contracts.ts
RUN npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/web/out /srv
# Preserve previously shared image URLs on the container hosting path as well.
COPY --from=build /app/web/out/bbotbook/GrokBotsCommunity.jpg /srv/og-card.jpg
COPY --from=build /app/web/out/bbotbook/GrokBotsCommunity.jpg /srv/GrokBotsCommunity.jpg
EXPOSE 80 443
