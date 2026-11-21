import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root, tables } from './contracts.js';

// Keep all database values in PostgreSQL text format, including int8, numeric and microseconds.
export const textTypes = { getTypeParser: () => value => value };
const routines = `sum min max avg count round trunc floor ceil ceiling abs sign mod power
  rank dense_rank row_number lead lag first_value last_value nth_value bool_and bool_or every
  array_agg string_agg array_length cardinality unnest array_position generate_series
  timezone date_part extract date_trunc date_bin age to_char to_date make_date make_interval
  justify_interval concat concat_ws lower upper length substring left right split_part btrim
  format numeric int2 int4 int8 text date timestamp timestamptz interval grouping width_bucket
  percent_rank cume_dist ntile trim_scale jsonb_array_elements`.split(/\s+/);

async function connect(options = {}) {
  const client = new pg.Client({ types: textTypes, connectionTimeoutMillis: 5000, ...options });
  await client.connect();
  return client;
}

export async function transaction(client, mode, run) {
  await client.query('BEGIN ' + mode);
  try {
    const result = await run();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function withScenario(name, indexes, run) {
  const suffix = randomBytes(10).toString('hex');
  const database = 'case_' + suffix, user = 'reader_' + suffix, password = randomBytes(24).toString('hex');
  const admin = await connect();
  try {
    await admin.query('CREATE DATABASE ' + database + ' TEMPLATE template0');
    try {
      await admin.query(`CREATE ROLE ${user} LOGIN PASSWORD '${password}' CONNECTION LIMIT 2`);
      const setup = await connect({ database });
      try {
        await transaction(setup, '', async () => {
          await setup.query(`REVOKE ALL ON SCHEMA public FROM PUBLIC;
            REVOKE ALL ON DATABASE ${database} FROM PUBLIC; GRANT CONNECT ON DATABASE ${database} TO ${user}`);
          for (const path of ['schema.sql', 'indexes.sql', 'fixtures/cases/' + name + '.sql']) {
            await setup.query(await readFile(join(root, 'database', path), 'utf8'));
          }
          await setup.query(`REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA pg_catalog FROM PUBLIC;
            REVOKE SELECT ON ALL TABLES IN SCHEMA pg_catalog FROM PUBLIC;
            REVOKE ALL ON SCHEMA information_schema FROM PUBLIC`);
          const { rows } = await setup.query(`SELECT oid::regprocedure::text AS signature FROM pg_proc
            WHERE pronamespace='pg_catalog'::regnamespace AND prokind <> 'p' AND
            (proname=ANY($1) OR oid IN (SELECT oprcode FROM pg_operator) OR oid IN (SELECT castfunc FROM pg_cast))`, [routines]);
          await setup.query('GRANT EXECUTE ON FUNCTION ' + rows.map(r => r.signature).join(', ') + ' TO ' + user);
          await setup.query(`GRANT USAGE ON SCHEMA market TO ${user}; GRANT SELECT ON ALL TABLES IN SCHEMA market TO ${user}`);
          if (indexes) {
            await setup.query('GRANT CREATE ON SCHEMA market TO ' + user);
            for (const table of tables) await setup.query(`ALTER TABLE market.${table} OWNER TO ${user}`);
          }
        });
      } finally { await setup.end(); }
      const reader = await connect({ database, user, password,
        options: '-c search_path=market,pg_catalog -c timezone=UTC -c statement_timeout=4000 -c lock_timeout=1000 -c work_mem=4MB' });
      try { return await run(reader); }
      finally { await reader.end(); }
    } finally {
      await admin.query('DROP DATABASE ' + database + ' WITH (FORCE)');
      await admin.query('DROP ROLE IF EXISTS ' + user);
    }
  } finally { await admin.end(); }
}
