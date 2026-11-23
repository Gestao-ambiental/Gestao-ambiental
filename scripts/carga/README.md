# Carga local das leituras de prazo

Scripts para medir as leituras de prazo (Minha semana, Visão da equipe, contadores, calendário) num
PostgreSQL local descartável. **Nunca rode contra o Supabase do beta nem de produção**: os scripts
recusam host que não seja local.

| Arquivo          | O que faz                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `preparar.sh`    | Cria o banco: stubs mínimos do Supabase (`bootstrap.sql`), todas as migrations e a massa (`seed-carga.sql`).                                           |
| `seed-carga.sql` | 20 consultorias × 10 pessoas, 500 empreendimentos, 1.000 licenças, 2.000 condicionantes mensais, ~26.000 ocorrências.                                  |
| `carga.py`       | `--sequencial`: mediana de 9 chamadas por leitura. Sem a opção: cenários concorrentes (20, 50 e 200 pessoas, pico de 200 na Minha semana), pool de 24. |
| `comparar.py`    | Compara, pessoa por pessoa, o resultado das leituras em dois bancos (antes e depois de uma migration).                                                 |

## Uso

Precisa de PostgreSQL 17 (`psql`) e Python com `psycopg` 3.

```sh
PSQL=/caminho/psql PGPORT=55440 scripts/carga/preparar.sh grama_antes
# aplique a migration nova numa cópia: create database grama_depois template grama_antes
GRAMA_CARGA_DSN="host=127.0.0.1 port=55440 dbname=grama_depois user=grama_owner" \
  python scripts/carga/carga.py --sequencial --read-only
GRAMA_CARGA_ANTES="host=127.0.0.1 port=55440 dbname=grama_antes user=grama_owner" \
GRAMA_CARGA_DEPOIS="host=127.0.0.1 port=55440 dbname=grama_depois user=grama_owner" \
  python scripts/carga/comparar.py
```
