#!/usr/bin/env bash
# Monta um banco de carga num PostgreSQL local descartável: stubs mínimos do Supabase
# (bootstrap.sql), todas as migrations em ordem e a massa sintética (seed-carga.sql: 20
# consultorias × 10 pessoas, 500 empreendimentos, 1.000 licenças, ~26.000 ocorrências).
# Nunca aponte para o Supabase do beta nem de produção.
#
# Uso: PSQL=/caminho/psql PGPORT=55440 scripts/carga/preparar.sh grama_carga
set -euo pipefail

BANCO="${1:-grama_carga}"
PSQL="${PSQL:-psql}"
export PGCLIENTENCODING=UTF8
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-55440}" PGUSER="${PGUSER:-grama_owner}"
case "$PGHOST" in
  127.0.0.1 | localhost | ::1) ;;
  *) echo "Só roda em PostgreSQL local (PGHOST=$PGHOST)." >&2; exit 1 ;;
esac

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
"$PSQL" -d postgres -v ON_ERROR_STOP=1 -qc "drop database if exists $BANCO" -c "create database $BANCO"
"$PSQL" -d "$BANCO" -v ON_ERROR_STOP=1 -q -f "$RAIZ/scripts/carga/bootstrap.sql"
for migration in "$RAIZ"/supabase/migrations/*.sql; do
  "$PSQL" -d "$BANCO" -v ON_ERROR_STOP=1 -q -f "$migration" > /dev/null
done
"$PSQL" -d "$BANCO" -v ON_ERROR_STOP=1 -q -f "$RAIZ/scripts/carga/seed-carga.sql"
