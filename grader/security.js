import { readFile, stat } from 'node:fs/promises';
import { parse } from 'libpg-query';
import { tables } from './contracts.js';

export async function source(file) {
  if ((await stat(file)).size > 131072) throw new Error('SQL-файл превышает 128 КиБ');
  return (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
}

export async function validateSelect(sql) {
  const { stmts } = await parse(sql);
  if (stmts.length !== 1 || !stmts[0].stmt.SelectStmt) throw new Error('Ожидается один SELECT');
  const pending = [stmts[0].stmt];
  while (pending.length) {
    const node = pending.pop();
    if (node.SelectStmt?.intoClause || node.SelectStmt?.lockingClause ||
        (node.CommonTableExpr && !node.CommonTableExpr.ctequery.SelectStmt)) {
      throw new Error('Разрешён только запрос чтения');
    }
    for (const child of Object.values(node)) {
      if (child && typeof child === 'object') pending.push(child);
    }
  }
  return sql;
}

export async function validateIndexes(sql) {
  const { stmts } = await parse(sql);
  if (!stmts.length || stmts.length > 8) throw new Error('Ожидается от 1 до 8 CREATE INDEX');
  const bytes = Buffer.from(sql);
  return stmts.map(({stmt, stmt_location = 0, stmt_len}) => {
    const n = stmt.IndexStmt;
    if (!n || !tables.includes(n.relation.relname) || n.relation.catalogname ||
        (n.relation.schemaname && n.relation.schemaname !== 'market') || n.accessMethod !== 'btree' ||
        n.tableSpace || n.concurrent || n.unique || n.options || n.whereClause || n.if_not_exists) {
      throw new Error('Нужен обычный CREATE INDEX по колонкам таблицы market');
    }
    for (const {IndexElem: key} of [...n.indexParams, ...(n.indexIncludingParams ?? [])]) {
      if (!key.name || key.expr || key.opclass || key.collation || key.opclassopts) {
        throw new Error('Используйте имена колонок в индексе');
      }
    }
    return bytes.subarray(stmt_location, stmt_len ? stmt_location + stmt_len : undefined).toString();
  });
}
