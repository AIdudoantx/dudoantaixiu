FROM node:24-slim AS builder

WORKDIR /workspace

RUN npm install -g pnpm@10

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY tsconfig.json tsconfig.base.json ./

COPY lib/db/package.json lib/db/tsconfig.json ./lib/db/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/tsconfig.json ./lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/tsconfig.json ./lib/api-client-react/
COPY artifacts/api-server/package.json artifacts/api-server/tsconfig.json artifacts/api-server/build.mjs ./artifacts/api-server/
COPY artifacts/taixiu-analyzer/package.json ./artifacts/taixiu-analyzer/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY scripts/package.json ./scripts/

RUN pnpm install --frozen-lockfile

COPY lib/ ./lib/
COPY artifacts/api-server/src/ ./artifacts/api-server/src/
COPY artifacts/taixiu-analyzer/src/ ./artifacts/taixiu-analyzer/src/
COPY artifacts/taixiu-analyzer/index.html ./artifacts/taixiu-analyzer/
COPY artifacts/taixiu-analyzer/vite.config.ts ./artifacts/taixiu-analyzer/
COPY artifacts/taixiu-analyzer/tsconfig.json ./artifacts/taixiu-analyzer/
COPY scripts/ ./scripts/

ENV NODE_ENV=production

# Build frontend (output → artifacts/taixiu-analyzer/dist/public)
RUN PORT=3000 BASE_PATH=/ pnpm --filter @workspace/taixiu-analyzer run build

# Build API server (output → artifacts/api-server/dist)
RUN pnpm --filter @workspace/api-server run build

# Copy frontend dist into API server dist/public so Express can serve it
RUN cp -r artifacts/taixiu-analyzer/dist/public artifacts/api-server/dist/public

FROM node:24-slim

WORKDIR /workspace

COPY --from=builder /workspace/artifacts/api-server/dist /workspace/artifacts/api-server/dist

EXPOSE 8080

ENV PORT=8080 NODE_ENV=production

CMD ["node", "--enable-source-maps", "/workspace/artifacts/api-server/dist/index.mjs"]
