import Cursor from 'pg-cursor';
import { oids } from './contracts.js';
import { textTypes, transaction } from './database.js';

const typeNames = new Map(Object.entries(oids).map(([name, oid]) => [oid, name]));
function describe(columns) {
  return columns.map(([name, oid]) => name + ' ' + (typeNames.get(oid) ?? 'OID ' + oid)).join(', ');
}

export function compare(actual, expected) {
  const counts = new Map();
  for (const row of expected) {
    const key = JSON.stringify(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const row of actual) {
    const key = JSON.stringify(row);
    if (!counts.get(key)) throw new Error('Лишняя строка: ' + key);
    counts.set(key, counts.get(key) - 1);
  }
  for (const [key, n] of counts) if (n) throw new Error('Отсутствует строка: ' + key);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Проверьте сортировку строк');
}

// PostgreSQL canonicalizes both sides without a conversion to JavaScript Date or Number.
async function normalize(client, columns, rows) {
  const fields = columns.map(([, type], i) => {
    const value = `(r->>${i})::${type}`;
    if (type === 'numeric') return `trim_scale(${value})::text`;
    if (type === 'interval') return `trim_scale(extract(epoch from ${value}))::text`;
    return value + '::text';
  });
  const sql = 'SELECT ' + fields.join(', ') + ' FROM jsonb_array_elements($1) WITH ORDINALITY AS t(r,n) ORDER BY n';
  return (await client.query({ text: sql, values: [JSON.stringify(rows)], rowMode: 'array' })).rows;
}

export async function evaluate(client, sql, task, expected) {
  await transaction(client, 'READ ONLY', async () => {
    const cursor = client.query(new Cursor(sql, [], { rowMode: 'array', types: textTypes }));
    let batch;
    try {
      batch = await new Promise((resolve, reject) => cursor.read(expected.length + 1,
        (error, rows, result) => error ? reject(error) : resolve({ rows, fields: result.fields })));
    } finally { await cursor.close(); }
    const actualSchema = batch.fields.map(f => [f.name, f.dataTypeID]);
    const expectedSchema = task.columns.map(([name, type]) => [name, oids[type]]);
    if (JSON.stringify(actualSchema) !== JSON.stringify(expectedSchema)) {
      throw new Error('Колонки или типы: ' + describe(actualSchema) + '. Ожидается ' + describe(expectedSchema));
    }
    const all = await normalize(client, task.columns, [...batch.rows, ...expected]);
    compare(all.slice(0, batch.rows.length), all.slice(batch.rows.length));
  });
}
