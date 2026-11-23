"""Carga sobre o banco local montado por scripts/carga/preparar.sh. Nunca rode no Supabase.

Uso (precisa de psycopg 3; PYTHONPATH pode apontar para uma cópia):
  GRAMA_CARGA_DSN="host=127.0.0.1 port=55440 dbname=grama_carga user=grama_owner"     python scripts/carga/carga.py --sequencial          # medianas em sequência
  python scripts/carga/carga.py --saida resultado.json  # cenários concorrentes (pool de 24)
"""
import argparse
import os
import statistics
import concurrent.futures
import json
import math
import queue
import random
import sys
import threading
import time
from collections import Counter, defaultdict
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).with_name('vendor')))
import psycopg

DSN = os.environ.get('GRAMA_CARGA_DSN', 'host=127.0.0.1 port=55440 dbname=grama_carga user=grama_owner') +     ' connect_timeout=5 application_name=grama_carga'
if not any(f'host={h}' in DSN for h in ('127.0.0.1', 'localhost', '::1')):
    raise SystemExit('Só roda em PostgreSQL local.')
READS = {
    'Minha semana': 'select * from public.minha_semana(null,%s,50,0)',
    'Visão da equipe': 'select * from public.listar_prazos(%s)',
    'Contadores de prazos': 'select * from public.contar_prazos(%s)',
    'Calendário': 'select * from public.listar_calendario(%s,%s,%s)',
    'Empreendimentos': 'select * from public.listar_empreendimentos(%s)',
    'Clientes em risco': 'select * from public.painel_clientes_em_risco(%s)',
    'Carga da equipe': 'select * from public.painel_carga(%s)',
    'Detalhe de ocorrência': 'select * from public.obter_ocorrencia(%s)',
}
WRITE = 'Criar etapa'
WRITE_SQL = "select public.criar_etapa(%s,%s,'Etapa sintética de carga','trabalho',%s,null,null,null)"
ACTIVITY = [
    ('Minha semana', 23), ('Visão da equipe', 22), ('Contadores de prazos', 11),
    ('Calendário', 14), ('Empreendimentos', 10), ('Detalhe de ocorrência', 15), (WRITE, 5),
]


def load_users():
    with psycopg.connect(DSN) as conn:
        today = conn.execute('select current_date').fetchone()[0]
        version = conn.execute('show server_version').fetchone()[0]
        rows = conn.execute('''
            select m.usuario_id, m.id, m.consultoria_id, m.papel::text, u.email,
                   array(select o.id from public.ocorrencia o
                     where o.consultoria_id=m.consultoria_id and o.responsavel_id=m.id
                     order by o.prazo_oficial_atual desc, o.id limit 32)
            from public.membro m join auth.users u on u.id=m.usuario_id
            order by m.consultoria_id,m.papel::text desc,m.id
        ''').fetchall()
        counts = conn.execute('''select (select count(*) from public.consultoria),
          (select count(*) from auth.users), (select count(*) from public.membro),
          (select count(*) from public.empreendimento), (select count(*) from public.instrumento),
          (select count(*) from public.condicionante), (select count(*) from public.ocorrencia)''').fetchone()
    assert counts[:3] == (20, 200, 200) and len(rows) == 200 and all(row[5] for row in rows), counts
    tenants = defaultdict(list)
    for row in rows:
        tenants[row[2]].append(row)
    groups = list(tenants.values())
    assert all(len(group) == 10 for group in groups)
    # The first 20 users cover all tenants, with a mixture of management and staff.
    interleaved = [group[(round_id + group_id) % len(group)]
                   for round_id in range(10) for group_id, group in enumerate(groups)]
    return today, version, interleaved, counts


def connect():
    return psycopg.connect(DSN, autocommit=True, options='-c statement_timeout=8000')


def impersonate(conn, person):
    user, _, _, _, email, _ = person
    claims = json.dumps({'sub': str(user), 'email': email, 'role': 'authenticated', 'aal': 'aal1'})
    conn.execute("select set_config('role','authenticated',true), set_config('request.jwt.claims',%s,true)", (claims,))


def run_op(conn, name, person, today, rng):
    _, member, tenant, _, _, occurrences = person
    if name == 'Minha semana':
        args = (today + timedelta(days=6),)
    elif name == 'Calendário':
        args = (tenant, today - timedelta(days=6), today + timedelta(days=21))
    elif name == 'Detalhe de ocorrência':
        args = (rng.choice(occurrences),)
    elif name == WRITE:
        args = (uuid4(), rng.choice(occurrences), member)
    else:
        args = (tenant,)
    with conn.transaction():
        impersonate(conn, person)
        result = conn.execute(WRITE_SQL if name == WRITE else READS[name], args).fetchall()
    if not result:
        raise ValueError('operação válida retornou zero linhas')
    if name == 'Minha semana' and any(row[0] != tenant for row in result):
        raise ValueError('linha de consultoria fora da massa atribuída')


def isolation(users, today):
    with connect() as conn:
        checked = 0
        for idx, person in enumerate(users):
            _, _, tenant, _, _, _ = person
            neighbor = users[(idx + 1) % len(users)][2]
            if neighbor == tenant:
                neighbor = next(user[2] for user in users if user[2] != tenant)
            with conn.transaction():
                impersonate(conn, person)
                rows = conn.execute('select consultoria_id from public.minha_semana(null,%s)', (today + timedelta(days=6),)).fetchall()
                if not rows or any(row[0] != tenant for row in rows):
                    raise ValueError(f'divergência de escopo em Minha semana para a persona {idx}')
                cross = conn.execute('select count(*) from public.empreendimento where consultoria_id=%s', (neighbor,)).fetchone()[0]
                if cross:
                    raise ValueError(f'RLS retornou empreendimento fora do escopo para a persona {idx}')
                checked += 2
        return checked


def choose(person, rng, burst):
    if burst:
        return 'Minha semana'
    if person[3] == 'gestao' and rng.random() < 0.25:
        return rng.choice(('Clientes em risco', 'Carga da equipe'))
    return rng.choices([name for name, _ in ACTIVITY], [weight for _, weight in ACTIVITY])[0]


def scenario(label, users, pool, today, duration, pause, burst=False):
    barrier = threading.Barrier(len(users) + 1)
    timing = {}

    def worker(index, person):
        rng = random.Random(index + 4193)
        samples = []
        barrier.wait(timeout=30)
        if not burst:
            time.sleep(rng.uniform(0.0, 0.35))
        while burst or time.perf_counter() < timing['stop']:
            name = choose(person, rng, burst)
            started = time.perf_counter()
            delay = None
            error = None
            try:
                conn = pool.get(timeout=15)
                delay = (time.perf_counter() - started) * 1000
                try:
                    run_op(conn, name, person, today, rng)
                finally:
                    pool.put(conn)
            except Exception as exc:
                error = f'{getattr(exc, "sqlstate", None) or type(exc).__name__}: {str(exc).splitlines()[0]}'
            samples.append((name, (time.perf_counter() - started) * 1000, delay, error))
            if burst:
                break
            time.sleep(rng.uniform(*pause))
        return samples

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(users)) as executor:
        jobs = [executor.submit(worker, index, person) for index, person in enumerate(users)]
        start = time.perf_counter()
        timing['stop'] = start + duration
        barrier.wait(timeout=30)
        samples = [sample for job in concurrent.futures.as_completed(jobs) for sample in job.result()]
        elapsed = max(0.001, time.perf_counter() - start)
    by_op = defaultdict(list)
    for sample in samples:
        by_op[sample[0]].append(sample)
    report = {
        'cenario': label, 'usuarios': len(users), 'segundos': round(elapsed, 2),
        'operacoes_por_segundo': round(len(samples) / elapsed, 1), 'geral': summarize(samples),
        'operacoes': {name: summarize(items) for name, items in sorted(by_op.items())},
    }
    print(json.dumps(report, ensure_ascii=True), flush=True)
    return report


def pctl(values, percentile):
    return round(sorted(values)[max(0, math.ceil(len(values) * percentile) - 1)], 2) if values else None


def summarize(items):
    successes = [(latency, delay) for _, latency, delay, error in items if not error]
    failures = Counter(error for _, _, _, error in items if error)
    return {
        'n': len(items), 'erros': sum(failures.values()), 'detalhe_erros': dict(failures),
        'p50_ms': pctl([latency for latency, _ in successes], 0.50),
        'p95_ms': pctl([latency for latency, _ in successes], 0.95),
        'p99_ms': pctl([latency for latency, _ in successes], 0.99),
        'fila_p95_ms': pctl([delay for _, delay in successes], 0.95),
        'bd_p95_ms': pctl([latency - delay for latency, delay in successes], 0.95),
    }


def sequencial(users, today, repeticoes=9):
    """Mediana de cada leitura em sequência (2 aquecimentos), com uma pessoa da Equipe e uma da Gestão."""
    manager = next(person for person in users if person[3] == 'gestao')
    staff = next(person for person in users if person[3] == 'equipe')
    medianas = {}
    with connect() as conn:
        for name in READS:
            person = manager if name in ('Clientes em risco', 'Carga da equipe') else staff
            tempos = []
            for i in range(repeticoes + 2):
                inicio = time.perf_counter()
                run_op(conn, name, person, today, random.Random(i))
                if i >= 2:
                    tempos.append((time.perf_counter() - inicio) * 1000)
            medianas[name] = round(statistics.median(tempos), 1)
    print(json.dumps({'sequencial_mediana_ms': medianas}, ensure_ascii=False), flush=True)
    return medianas


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--smoke', action='store_true')
    parser.add_argument('--read-only', action='store_true')
    parser.add_argument('--sequencial', action='store_true')
    parser.add_argument('--saida', default='resultados-carga.json')
    args = parser.parse_args()
    if args.read_only:
        ACTIVITY[:] = [(name, weight) for name, weight in ACTIVITY if name != WRITE]
    today, version, users, counts = load_users()
    print(json.dumps({'banco': version, 'data': str(today), 'massa': counts}), flush=True)
    manager = next(person for person in users if person[3] == 'gestao')
    staff = next(person for person in users if person[3] == 'equipe')
    with connect() as conn:
        for name in READS:
            person = manager if name in ('Clientes em risco', 'Carga da equipe') else staff
            run_op(conn, name, person, today, random.Random(5))
        if not args.read_only:
            run_op(conn, WRITE, staff, today, random.Random(5))
    if args.smoke:
        return
    if args.sequencial:
        sequencial(users, today)
        return
    checks = isolation(users, today)
    print(json.dumps({'verificacoes_isolamento': checks, 'divergencias': 0}), flush=True)
    pool = queue.Queue()
    connections = [connect() for _ in range(24)]
    for conn in connections:
        pool.put(conn)
    try:
        results = [scenario('20 usuários ativos', users[:20], pool, today, 20, (0.8, 1.5)),
                   scenario('50 usuários ativos', users[:50], pool, today, 25, (0.8, 1.5)),
                   scenario('200 usuários ativos', users, pool, today, 30, (1.5, 2.5)),
                   scenario('Pico: 200 abrem Minha semana', users, pool, today, 0, (0, 0), burst=True)]
    finally:
        for conn in connections:
            conn.close()
    Path(args.saida).write_text(json.dumps({'version': version, 'counts': counts, 'isolation_checks': checks, 'pool': 24, 'scenarios': results}, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
