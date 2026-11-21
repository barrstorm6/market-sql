import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
const [command, ...args] = process.argv.slice(2);
function run(options, input) {
  const result = spawnSync('docker', ['compose', ...options], { cwd: root,
    stdio: [input ? 'pipe' : 'inherit', 'inherit', 'inherit'], input });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const compose = (...options) => run(options);
const psql = ['exec', '-T', 'db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'market'];
const check = ['run', '--rm', '--build', 'check', 'node'];
switch (command) {
  case 'up': compose('up', '-d', '--wait', 'db'); break;
  case 'down': compose('--profile', 'check', 'down'); break;
  case 'sql': compose('exec', 'db', 'psql', '-X', '-U', 'postgres', '-d', 'market'); break;
  case 'seed':
  case 'reset':
    compose('up', '-d', '--wait', 'db');
    compose(...psql, '-f', '/work/database/seed.sql');
    break;
  case 'perf': {
    const [scale = process.env.SCALE ?? '100000', seed = process.env.SEED ?? '17'] = args;
    compose('up', '-d', '--wait', 'db');
    compose(...psql, '-v', 'scale=' + scale, '-v', 'seed=' + seed, '-f', '/work/database/fixtures/performance.sql');
    break;
  }
  case 'test': compose(...check, '--test', 'tests/grader.test.js'); break;
  case 'plan:before':
  case 'plan:after': {
    const after = command === 'plan:after';
    const file = after ? 'solutions/08_optimized_query.sql' : 'database/baseline.sql';
    const indexes = after ? readFileSync(join(root, 'solutions/08_indexes.sql'), 'utf8') : '';
    const query = readFileSync(join(root, file), 'utf8');
    run(psql, 'BEGIN;\n' + indexes + '\n;\nEXPLAIN (ANALYZE, BUFFERS)\n' + query + '\n;\nROLLBACK;\n');
    break;
  }
  case 'grade':
  case 'test-public': compose(...check, 'grader/cli.js', ...args); break;
  case 'report': compose(...check, 'grader/cli.js', '--format', 'markdown', '--output', 'reports/grade.md', ...args); break;
  default: throw new Error('Неизвестная команда: ' + command);
}
