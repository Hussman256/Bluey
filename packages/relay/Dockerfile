# 1btc clubs relay (NIP-29)
FROM node:24-slim AS base
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/relay/package.json packages/relay/
RUN npm install --omit=dev --workspace @1btc/relay --include-workspace-root

COPY packages/shared packages/shared
COPY packages/relay packages/relay

ENV NODE_ENV=production
ENV PORT=8788
ENV DB_PATH=/data/relay.db
ENV KEY_PATH=/data/relay.key
VOLUME /data
EXPOSE 8788

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8788/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "--workspace", "@1btc/relay"]
