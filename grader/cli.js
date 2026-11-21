import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { grade } from './runner.js';
import { render } from './report.js';
import { tasks } from './contracts.js';

const { values } = parseArgs({ options: { task: { type: 'string' },
  format: { type: 'string', default: 'console' }, output: { type: 'string' } } });
if (!['console', 'json', 'markdown'].includes(values.format)) throw new Error('Формат: console, json или markdown');
const selected = values.task === undefined ? tasks : tasks.filter(t => t.id === Number(values.task));
if (!selected.length) throw new Error('Укажите номер от 1 до 8');
const checks = await grade({ selected });
const report = render(checks, values.format);
if (values.output) {
  await mkdir(dirname(values.output), { recursive: true });
  await writeFile(values.output, report + '\n');
}
console.log(report);
if (checks.some(c => c.error)) process.exitCode = 1;
