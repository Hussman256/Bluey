# 1btc index service
FROM node:24-slim AS base
WORKDIR /app

# workspace manifests first (better layer caching)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN npm install --omit=dev --workspace @1btc/server --include-workspace-root

COPY packages/shared packages/shared
COPY packages/server packages/server

ENV NODE_ENV=production
ENV PORT=8787
ENV DB_PATH=/data/index.db
VOLUME /data
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "--workspace", "@1btc/server"]
