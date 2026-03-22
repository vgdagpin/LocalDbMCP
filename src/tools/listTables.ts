import { getPool } from "../database/client.js";
import { filterAllowedTables } from "../database/tableFilter.js";

export interface ListTablesResult {
  tables: Array<{
    schema: string;
    name: string;
    fullName: string;
  }>;
  totalCount: number;
}

export async function listTables(): Promise<ListTablesResult> {
  const pool = await getPool();

  // Fixed, parameterless query — no user input involved
  const result = await pool.request().query(
    `SELECT TABLE_SCHEMA, TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_SCHEMA, TABLE_NAME`
  );

  const allTables = (
    result.recordset as Array<{ TABLE_SCHEMA: string; TABLE_NAME: string }>
  ).map((row) => ({
    schemaName: row.TABLE_SCHEMA,
    tableName: row.TABLE_NAME,
  }));

  const allowed = filterAllowedTables(allTables);

  return {
    tables: allowed.map((t) => ({
      schema: t.schemaName,
      name: t.tableName,
      fullName: `${t.schemaName}.${t.tableName}`,
    })),
    totalCount: allowed.length,
  };
}
