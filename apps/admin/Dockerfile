# =====================================================================
# Imagem do app Next.js `admin` (ADR-014 §3): saída standalone.
# Contexto de build: a RAIZ do monorepo.
# =====================================================================
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2 prune @mkt/admin --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# nenhum segredo em ARG/ENV de build: variáveis de runtime vêm da Railway
RUN pnpm turbo build --filter=@mkt/admin

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# o servidor standalone do Next lê PORT e HOSTNAME (armadilha #2)
ENV HOSTNAME="::"
USER node
COPY --from=builder --chown=node:node /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder --chown=node:node /app/apps/admin/public ./apps/admin/public
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]
