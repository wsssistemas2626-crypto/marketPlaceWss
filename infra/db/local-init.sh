#!/bin/sh
# Executado automaticamente pelo container postgres do docker-compose (docker-entrypoint-initdb.d).
# Cria as mesmas roles da Railway, garantindo paridade local ↔ nuvem.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v migrator_password="${DB_MIGRATOR_PASSWORD:-migrator}" \
  -v app_password="${DB_APP_PASSWORD:-app}" \
  -v platform_password="${DB_PLATFORM_PASSWORD:-platform}" \
  -f /bootstrap/bootstrap-roles.sql
