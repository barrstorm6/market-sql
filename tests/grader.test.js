import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compare, evaluate } from '../grader/comparator.js';
import { expectedRows, root, scenarios, tasks } from '../grader/contracts.js';
import { withScenario, transaction } from '../grader/database.js';
import { validateSelect, validateIndexes } from '../grader/security.js';
import { verifyExplain } from '../grader/runner.js';
import { summary, render } from '../grader/report.js';

for (const [name, sql] of Object.entries({
  empty: '-- TODO', multiple: 'select 1; select 2', ddl: 'create table notes(i int)',
  into: 'select 1 into notes', lock: 'select * from orders for update',
  writable_cte: 'with x as (delete from orders returning id) select * from x',
})) {
  test('SELECT filter / ' + name, () => assert.rejects(validateSelect(sql)));
}
test('Разделители внутри строки и комментария', async () => {
  const sql = "/* ; */ with x as (select ';' as v) select * from x;";
  assert.equal(await validateSelect(sql), sql);
});
for (const sql of ['select 1', 'create index x on public.orders(id)',
  'create index x on orders ((id+1))', 'create index if not exists x on orders(id)']) {
  test('DDL filter / ' + sql, () => assert.rejects(validateIndexes(sql)));
}
test('Позиции двух индексов с UTF-8-комментарием', async () => {
  const statements = await validateIndexes('-- первый\ncreate index a on orders(id); create index b on orders(created_at) include(id);');
  assert.equal(statements.length, 2);
  assert.match(statements[1], /^\s*create index b/i);
});
test('Сравнение учитывает повторы, порядок и NULL', () => {
  assert.throws(() => compare([[1], [1]], [[1]]), /Лишняя/);
  assert.throws(() => compare([[1]], [[1], [1]]), /Отсутствует/);
  assert.throws(() => compare([[2], [1]], [[1], [2]]), /сортировку/);
  assert.throws(() => compare([[null]], [['null']]), /Лишняя/);
});
test('Максимум и частичный балл в трёх форматах', () => {
  const checks = tasks.flatMap(t => t.weights.map((weight, i) => ({
    task: t.id, name: scenarios[i], weight, earned: weight })));
  checks.push({ task: 8, name: 'indexes', weight: 2, earned: 2 }, { task: 8, name: 'explain', weight: 1, earned: 1 });
  assert.equal(summary(checks).automated, 90);
  for (const task of tasks) assert.equal(task.weights.length, scenarios.length);
  checks[0].earned = 0;
  checks[0].error = 'ошибка';
  assert.equal(JSON.parse(render(checks, 'json')).automated, 88);
  assert.match(render(checks, 'markdown'), /## Задание 01 — 13\/15/);
  assert.match(render(checks, 'console'), /88\/90.*10 баллов/);
});
test('Для отчёта нужны оба плана', () => {
  assert.throws(() => verifyExplain(''), /плана/);
  assert.throws(() => verifyExplain('<!-- explain-start -->actual time= Buffers: Execution Time:<!-- explain-end -->'));
});

const baseline = await readFile(join(root, 'database/baseline.sql'), 'utf8');
for (const scenario of scenarios) {
  test('Исходный запрос 08 / ' + scenario, () => withScenario(scenario, false, async db => {
    await evaluate(db, baseline, tasks[7], await expectedRows(scenario, tasks[7]));
  }));
}
test('Роль, тайм-аут, запрет изменений и опасных функций', () => withScenario('checkout', false, async db => {
  assert.match((await db.query('select current_user')).rows[0].current_user, /^reader_/);
  assert.equal((await db.query('show statement_timeout')).rows[0].statement_timeout, '4s');
  await assert.rejects(db.query('create table market.notes(id int)'), { code: '42501' });
  await assert.rejects(db.query('create temp table notes(id int)'), { code: '42501' });
  await assert.rejects(db.query('select pg_sleep(0)'), { code: '42501' });
  await assert.rejects(transaction(db, 'READ ONLY', () => db.query('update orders set id=id')), { code: '25006' });
  assert.equal((await db.query('select count(*) as n from orders')).rows[0].n, '6');
}));
test('Отдельная база 08: откат группы индексов и повторный запуск', () => withScenario('catalogue', true, async db => {
  await assert.rejects(transaction(db, '', async () => {
    await db.query('create index by_date on market.orders(created_at)');
    await db.query('create index by_date on market.orders(id)');
  }), { code: '42P07' });
  await db.query('create index by_date on market.orders(created_at)');
  await assert.rejects(db.query('create table public.notes(id int)'), { code: '42501' });
}));
test('Схема отклоняет неверные ссылки, дубли SKU и отрицательные суммы', () => withScenario('checkout', true, async db => {
  await assert.rejects(db.query("insert into orders values (700,99999,'2024-03-01')"), { code: '23503' });
  await assert.rejects(db.query("insert into products values (700,'TEA',30)"), { code: '23505' });
  await assert.rejects(db.query("insert into refunds values (700,1,-1,'2024-03-01')"), { code: '23514' });
  // Operational duplicates and a refund above the paid amount remain representable.
  assert.equal((await db.query("select count(*) as n from payments where order_id=1 and status='SUCCESS' and external_transaction_id='card'")).rows[0].n, '2');
  assert.equal((await db.query('select amount from refunds where order_id=4')).rows[0].amount, '60.00');
}));
test('Проверка типа, порядка и имени колонок даже при пустом результате', () => withScenario('catalogue', false, async db => {
  for (const sql of ["select 1::int order_id, 'x'::text anomaly_type where false",
    "select 'x'::text anomaly_type, 1::bigint order_id where false",
    "select 1::bigint id, 'x'::text anomaly_type where false"]) {
    await assert.rejects(evaluate(db, sql, tasks[1], []), /Колонки или типы/);
  }
  await assert.rejects(evaluate(db, 'select missing_column from orders', tasks[0], []), { code: '42703' });
  await evaluate(db, "select 1::bigint order_id, 'x'::text anomaly_type where false", tasks[1], []);
}));
test('Точность NUMERIC, абсолютное время и микросекунды', () => withScenario('timeline', false, async db => {
  const task = {columns: [['n','numeric'], ['ts','timestamptz'], ['d','interval']]};
  const sql = "select 9007199254740993.10::numeric n, timestamptz '2024-01-01 02:00:00.000001+02' ts, interval '1 microsecond' d";
  const expected = [['9007199254740993.1','2024-01-01 00:00:00.000001+00','1 microsecond']];
  await evaluate(db, sql, task, expected);
  await assert.rejects(evaluate(db, sql, task, [['9007199254740993.11', ...expected[0].slice(1)]]), /Лишняя/);
}));

// Each SQL mutant computes a deliberately wrong metric. Compare that projection with
// the identical column of the public scenario used for grading, including the key.
const mutations = [
  ['dedup_by_id_before_time', 'settlement', 1, 2, `
    with chosen as (
      select distinct on (order_id, external_transaction_id, case when external_transaction_id is null then id end)
             order_id, amount from payments where status='SUCCESS'
      order by order_id, external_transaction_id, case when external_transaction_id is null then id end, id
    )
    select o.id, coalesce(sum(p.amount), 0) from orders o left join chosen p on p.order_id=o.id
    group by o.id order by o.id`],
  ['last_cancellation', 'late_refunds', 2, 1, `
    select distinct p.order_id, 'AFTER_CANCEL'::text from payments p
    where p.status='SUCCESS' and p.paid_at > (select max(changed_at) from order_status_history
      where order_id=p.order_id and status='CANCELLED') order by 1`],
  ['count_midnights', 'utc_edges', 3, 5, `
    select customer_id, max(created_at)::date-min(created_at)::date from orders group by customer_id order by 1`],
  ['exclude_price_at_purchase', 'utc_edges', 4, 2, `
    select i.id, (select h.price from product_price_history h where h.product_id=i.product_id
      and h.valid_from < o.created_at order by h.valid_from desc, h.id desc limit 1)
    from order_items i join orders o on o.id=i.order_id order by i.id`],
  ['discard_delivery_microseconds', 'utc_edges', 5, 8, `
    select o.id, date_trunc('second', min(h.changed_at) filter (where h.status='DELIVERED')
      - min(h.changed_at) filter (where h.status='SHIPPED')) > interval '72 hours'
    from orders o left join order_status_history h on h.order_id=o.id group by o.id order by o.id`],
  ['round_retention_to_percent', 'late_refunds', 6, 3, `
    select date '2024-01-01', round(count(distinct customer_id)::numeric /
      (select count(distinct customer_id) from orders where created_at >= '2024-01-01' and created_at < '2024-02-01'), 2)
    from orders o where created_at >= '2024-02-01' and created_at < '2024-03-01'
      and not exists (select 1 from order_status_history h where h.order_id=o.id and h.status='CANCELLED')`],
  ['classify_rounded_share', 'rounding', 7, 4, `
    with sales as (select product_id, sum(quantity*unit_price) revenue from order_items group by product_id),
    shares as (select *, round(sum(revenue) over(order by revenue desc, product_id) / sum(revenue) over(), 6) share from sales)
    select product_id, case when share <= 0.80 then 'A' when share <= 0.95 then 'B' else 'C' end
    from shares order by revenue desc, product_id`],
  ['report_in_local_time', 'utc_edges', 8, 2, `
    select i.product_id, sum(i.quantity*i.unit_price) from orders o join order_items i on i.order_id=o.id
    where date_trunc('month', o.created_at at time zone 'America/New_York') = timestamp '2024-03-01'
    group by i.product_id order by i.product_id`],
  ['inner_join', 'checkout', 1, 0, 'select distinct o.id from orders o join payments p on p.order_id=o.id order by 1'],
  ['fanout', 'checkout', 1, 2, "select o.id,coalesce(sum(p.amount),0) from orders o left join order_items i on i.order_id=o.id left join payments p on p.order_id=o.id and p.status='SUCCESS' left join refunds r on r.order_id=o.id group by o.id order by o.id"],
  ['ignore_refunds', 'checkout', 1, 3, 'select id,0::numeric from orders order by id'],
  ['count_duplicates', 'checkout', 1, 2, "select o.id,coalesce(sum(p.amount),0) from orders o left join payments p on p.order_id=o.id and p.status='SUCCESS' group by o.id order by o.id"],
  ['cancel_inclusive', 'catalogue', 2, 1, "select distinct p.order_id,'AFTER_CANCEL'::text from payments p join order_status_history h on h.order_id=p.order_id where p.status='SUCCESS' and h.status='CANCELLED' and p.paid_at>=h.changed_at order by 1"],
  ['strict_30', 'timeline', 3, 6, "select customer_id,max(created_at)-min(created_at)<interval '30 days' from orders group by customer_id order by 1"],
  ['current_price', 'checkout', 4, 2, 'select i.id,p.current_price from order_items i join products p on i.product_id=p.id order by 1'],
  ['unordered_events', 'timeline', 5, 4, "select o.id,min(h.changed_at) from orders o left join order_status_history h on h.order_id=o.id and h.status='DELIVERED' group by o.id order by 1"],
  ['count_orders', 'calendar', 6, 3, "select date '2024-01-01',count(*)::numeric/2 from orders where customer_id in (201,202) and created_at>='2024-02-01' and created_at<'2024-03-01'"],
  ['wrong_denominator', 'calendar', 6, 3, "select date '2024-01-01',count(distinct customer_id)::numeric/(select count(*) from customers) from orders where customer_id in (201,202) and created_at>='2024-02-01' and created_at<'2024-03-01'"],
  ['strict_abc', 'catalogue', 7, 4, "select id,case when sum(current_price) over(order by current_price desc,id)<80 then 'A' when sum(current_price) over(order by current_price desc,id)<95 then 'B' else 'C' end from products order by current_price desc,id"],
  ['omit_unsold', 'calendar', 8, 0, "select distinct i.product_id from order_items i join orders o on i.order_id=o.id where o.created_at>='2024-03-01' and o.created_at<'2024-04-01' order by 1"],
];
for (const [name, scenario, id, column, sql] of mutations) {
  test('Мутация / ' + name, () => withScenario(scenario, false, async db => {
    const original = tasks[id-1];
    const indices = column === 0 ? [0] : [0, column];
    const task = { columns: indices.map(i => original.columns[i]) };
    let rows = await expectedRows(scenario, original);
    if (id === 6) rows = rows.filter(row => row[0] === '2024-01-01');
    const expected = rows.map(row => indices.map(i => row[i]));
    const aliases = task.columns.map(([n]) => n).join(',');
    await assert.rejects(evaluate(db, 'select * from (' + sql + ') as m(' + aliases + ')', task, expected),
      /Лишняя строка|Отсутствует строка/);
  }));
}
