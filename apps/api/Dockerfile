# =====================================================================
# Imagem do serviço `api` (ADR-014 §3).
# Contexto de build: a RAIZ do monorepo.
# =====================================================================
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# --- recorta o monorepo só com o que este app precisa ---
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2 prune @mkt/api --docker

# --- instala e compila ---
FROM base AS builder
WORKDIR /app
# primeiro os manifests: camada de dependências só muda quando eles mudam
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@mkt/api

# --- imagem final ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# nunca root (ADR-014 §3)
USER node
COPY --from=builder --chown=node:node /app .
WORKDIR /app/apps/api
# PORT vem da Railway; o processo escuta em `::` (armadilha #2)
EXPOSE 3000
CMD ["node", "dist/main.js"]
