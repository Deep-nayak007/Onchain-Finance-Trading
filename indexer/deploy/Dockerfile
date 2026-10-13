# Deploy file (added by Brain). Based on Envio's official example (github.com/enviodev/local-docker-example/Dockerfile),
# adapted to this monorepo: config.yaml references ../packages/shared/abis, so the repo layout is preserved.
FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client ca-certificates && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN npm install -g pnpm@10.32.0
WORKDIR /app
COPY packages/shared/abis ./packages/shared/abis
COPY indexer/package.json ./indexer/package.json
WORKDIR /app/indexer
# Standalone install (the indexer is not part of the pnpm workspace lockfile here).
RUN pnpm install --no-frozen-lockfile
COPY indexer/config.yaml indexer/schema.graphql indexer/envio-env.d.ts ./
COPY indexer/src ./src
RUN pnpm envio codegen
COPY indexer/deploy/start.sh /usr/local/bin/leash-envio-start
RUN chmod +x /usr/local/bin/leash-envio-start
CMD ["leash-envio-start"]
