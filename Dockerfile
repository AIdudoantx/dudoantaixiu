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
COPY scripts/ ./scripts/

ENV NODE_ENV=production
RUN pnpm --filter @workspace/api-server run build

FROM node:24-slim

WORKDIR /workspace

COPY --from=builder /workspace/artifacts/api-server/dist /workspace/artifacts/api-server/dist

EXPOSE 8080

ENV PORT=8080 NODE_ENV=production

CMD ["node", "--enable-source-maps", "/workspace/artifacts/api-server/dist/index.mjs"]
