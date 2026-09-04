FROM node:22-bookworm-slim AS build
WORKDIR /app/hub
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HUB_HOST=0.0.0.0 \
    PORT=4311 \
    HUB_LOCAL_OWNER_LOGIN=false \
    HUB_EMBEDDED_DB=false
WORKDIR /app/hub
COPY --from=build --chown=node:node /app/hub/package.json ./package.json
COPY --from=build --chown=node:node /app/hub/node_modules ./node_modules
COPY --from=build --chown=node:node /app/hub/dist ./dist
COPY --from=build --chown=node:node /app/hub/migrations ./migrations
USER node
EXPOSE 4311
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '4311') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]
