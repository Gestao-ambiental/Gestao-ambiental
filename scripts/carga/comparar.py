"""Compara, pessoa por pessoa, o resultado das leituras de prazo em dois bancos locais de carga
(antes e depois de uma migration). Nunca rode no Supabase.

Uso:
  GRAMA_CARGA_ANTES="host=127.0.0.1 port=55440 dbname=grama_antes user=grama_owner" \\
  GRAMA_CARGA_DEPOIS="host=127.0.0.1 port=55440 dbname=grama_depois user=grama_owner" \\
    python scripts/carga/comparar.py
"""
import json
import os
import sys
from datetime import timedelta

import psycopg

ANTES = os.environ['GRAMA_CARGA_ANTES']
DEPOIS = os.environ['GRAMA_CARGA_DEPOIS']
for dsn in (ANTES, DEPOIS):
    if not any(f'host={h}' in dsn for h in ('127.0.0.1', 'localhost', '::1')):
        raise SystemExit('Só roda em PostgreSQL local.')


def chamadas(cid, membro, hoje):
    """Leituras e combinações de filtros comparadas para cada pessoa."""
    yield 'select * from public.minha_semana(null, %s, 100, 0)', (hoje + timedelta(days=6),)
    yield 'select * from public.minha_semana(%s, %s, 100, 0)', (hoje - timedelta(days=20), hoje + timedelta(days=30))
    yield 'select * from public.minha_semana(null, %s, 100, 100)', (hoje + timedelta(days=60),)
    for de, ate in ((hoje - timedelta(days=6), hoje + timedelta(days=21)), (hoje, hoje), (hoje + timedelta(days=40), hoje + timedelta(days=90))):
        yield 'select * from public.listar_calendario(%s, %s, %s)', (cid, de, ate)
        yield 'select * from public.listar_calendario(%s, %s, %s, %s)', (cid, de, ate, membro)
        yield 'select * from public.listar_calendario(%s, %s, %s, null, null, true)', (cid, de, ate)
    for faixa in (None, 'atrasadas', 'hoje', 'proximos_7', 'sem_responsavel'):
        for aba in ('todos', 'minhas'):
            for ordem in ('prazo', '-prazo', 'responsavel'):
                yield ('select * from public.listar_prazos(%s, %s, null, false, null, null, %s, %s, 100, 0)',
                       (cid, aba, faixa, ordem))
        yield 'select * from public.listar_prazos(%s, %s, %s, false, null, null, %s)', (cid, 'todos', membro, faixa)
    yield 'select * from public.listar_prazos(%s, %s, null, false, null, null, null, %s, 25, 50)', (cid, 'todos', 'prazo')
    for aba in ('todos', 'minhas'):
        yield 'select * from public.contar_prazos(%s, %s)', (cid, aba)
    yield 'select * from public.contar_prazos(%s, %s, %s)', (cid, 'todos', membro)
    yield 'select * from public.contar_prazos(%s, %s, null, true)', (cid, 'todos')


def executar(conn, pessoa, sql, args):
    usuario, email = pessoa
    claims = json.dumps({'sub': str(usuario), 'email': email, 'role': 'authenticated', 'aal': 'aal1'})
    with conn.transaction():
        conn.execute("select set_config('role','authenticated',true), set_config('request.jwt.claims',%s,true)", (claims,))
        return conn.execute(sql, args).fetchall()


def main():
    with psycopg.connect(ANTES, autocommit=True) as antes, psycopg.connect(DEPOIS, autocommit=True) as depois:
        hoje = antes.execute('select current_date').fetchone()[0]
        pessoas = antes.execute('''
            select m.usuario_id, u.email, m.consultoria_id, m.id
            from public.membro m join auth.users u on u.id = m.usuario_id
            order by m.consultoria_id, m.id''').fetchall()
        comparadas = linhas = 0
        divergencias = []
        for usuario, email, cid, membro in pessoas:
            for sql, args in chamadas(cid, membro, hoje):
                a = executar(antes, (usuario, email), sql, args)
                b = executar(depois, (usuario, email), sql, args)
                comparadas += 1
                linhas += len(a)
                if a != b:
                    divergencias.append({'pessoa': email, 'sql': sql, 'args': [str(x) for x in args],
                                         'antes': len(a), 'depois': len(b)})
        print(json.dumps({'chamadas_comparadas': comparadas, 'linhas_comparadas': linhas,
                          'divergencias': len(divergencias), 'exemplos': divergencias[:5]},
                         ensure_ascii=False, indent=2))
        sys.exit(1 if divergencias else 0)


if __name__ == '__main__':
    main()
