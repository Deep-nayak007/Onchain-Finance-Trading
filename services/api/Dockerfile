# Build from the repo root:  docker build -f services/api/Dockerfile -t leash-api .
FROM node:22-slim
ENV NODE_ENV=production
# Same pnpm major as the lockfile; npm avoids corepack's interactive download prompt in CI.
RUN npm i -g pnpm@12.11.2
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY services/api ./services/api
COPY services/perpl-gateway/mock ./services/perpl-gateway/mock
RUN pnpm install --frozen-lockfile --filter @leash/api... --prod=false
WORKDIR /app/services/api
ENV PORT=8787 DATABASE_PATH=/data/leash.db
VOLUME ["/data"]
EXPOSE 8787
# tsx runs the TypeScript sources directly (shared package is consumed as TS source).
CMD ["pnpm", "start"]
