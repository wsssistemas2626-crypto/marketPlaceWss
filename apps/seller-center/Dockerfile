# =====================================================================
# Imagem do app Next.js `seller-center` (ADR-014 §3): saída standalone.
# Contexto de build: a RAIZ do monorepo.
# =====================================================================
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2 prune @mkt/seller-center --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# nenhum segredo em ARG/ENV de build: variáveis de runtime vêm da Railway
RUN pnpm turbo build --filter=@mkt/seller-center

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# o servidor standalone do Next lê PORT e HOSTNAME (armadilha #2)
ENV HOSTNAME="::"
USER node
COPY --from=builder --chown=node:node /app/apps/seller-center/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/seller-center/.next/static ./apps/seller-center/.next/static
COPY --from=builder --chown=node:node /app/apps/seller-center/public ./apps/seller-center/public
EXPOSE 3000
CMD ["node", "apps/seller-center/server.js"]
