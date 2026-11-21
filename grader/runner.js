import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { evaluate } from './comparator.js';
import { expectedRows, root, scenarios, tasks } from './contracts.js';
import { transaction, withScenario } from './database.js';
import { source, validateIndexes, validateSelect } from './security.js';

export function verifyExplain(content) {
  const section = content.match(/<!-- explain-start -->([\s\S]*?)<!-- explain-end -->/)?.[1];
  const plans = section?.split('### После оптимизации');
  if (plans?.length !== 2 || plans.some(plan => !['Buffers:', 'Execution Time:', 'actual time='].every(s => plan.includes(s)))) {
    throw new Error('Вставьте оба фактических плана EXPLAIN (ANALYZE, BUFFERS) в раздел отчёта README');
  }
}

export async function grade({ selected = tasks, solutions = join(root, 'solutions'), readme = join(root, 'README.md') } = {}) {
  const checks = [];
  async function check(task, name, weight, action) {
    try {
      await action();
      checks.push({ task, name, weight, earned: weight });
    } catch (error) {
      checks.push({ task, name, weight, earned: 0, error: error.message.slice(0, 1200) });
    }
  }
  for (const [i, name] of scenarios.entries()) {
    for (const indexes of [false, true]) {
      const group = selected.filter(t => (t.id === 8) === indexes);
      if (!group.length) continue;
      await withScenario(name, indexes, async client => {
        if (indexes && i === 0) {
          await check(8, 'indexes', 2, async () => {
            const statements = await validateIndexes(await source(join(solutions, '08_indexes.sql')));
            await transaction(client, '', async () => {
              for (const text of statements) await client.query({ text, queryMode: 'extended' });
            });
          });
        }
        for (const task of group) {
          await check(task.id, name, task.weights[i], async () => {
            const sql = await validateSelect(await source(join(solutions, task.file)));
            await evaluate(client, sql, task, await expectedRows(name, task));
          });
        }
      });
    }
  }
  if (selected.some(t => t.id === 8)) await check(8, 'explain', 1, async () => verifyExplain(await readFile(readme, 'utf8')));
  return checks;
}
