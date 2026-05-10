import { getPool } from "../database/client.js";
import { isTableAllowed } from "../database/tableFilter.js";
import { validateIdentifier } from "../utils/validation.js";

export interface ColumnInfo {
  columnName: string;
  dataType: string;
  maxLength: number | null;
  isNullable: boolean;
  columnDefault: string | null;
  ordinalPosition: number;
}

export interface GetSchemaResult {
  tableName: string;
  schemaName: string;
  columns: ColumnInfo[];
}

export async function getTableSchema(tableName: string): Promise<GetSchemaResult> {
  // Layer 1: validate tableName is a safe identifier
  validateIdentifier(tableName);

  // Layer 2: check against allowlist before touching the database
  if (!isTableAllowed(tableName)) {
    throw new Error(
      `Table "${tableName}" is not accessible. ` +
        `Check allowedTablePatterns and excludedTablePatterns in config.json.`
    );
  }

  const pool = await getPool();

  // Layer 3: parameterized query — @tableName is bound via .input(), never concatenated
  const result = await pool
    .request()
    .input("tableName", tableName)
    .query(
      `SELECT
         COLUMN_NAME,
         DATA_TYPE,
         CHARACTER_MAXIMUM_LENGTH,
         IS_NULLABLE,
         COLUMN_DEFAULT,
         ORDINAL_POSITION,
         TABLE_SCHEMA
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = @tableName
       ORDER BY ORDINAL_POSITION`
    );

  if (result.recordset.length === 0) {
    throw new Error(
      `Table "${tableName}" was not found in the database, ` +
        `or you do not have permission to view it.`
    );
  }

  const schemaName = result.recordset[0].TABLE_SCHEMA as string;

  const columns: ColumnInfo[] = (
    result.recordset as Array<{
      COLUMN_NAME: string;
      DATA_TYPE: string;
      CHARACTER_MAXIMUM_LENGTH: number | null;
      IS_NULLABLE: string;
      COLUMN_DEFAULT: string | null;
      ORDINAL_POSITION: number;
    }>
  ).map((row) => ({
    columnName: row.COLUMN_NAME,
    dataType: row.DATA_TYPE,
    maxLength: row.CHARACTER_MAXIMUM_LENGTH,
    isNullable: row.IS_NULLABLE === "YES",
    columnDefault: row.COLUMN_DEFAULT,
    ordinalPosition: row.ORDINAL_POSITION,
  }));

  return { tableName, schemaName, columns };
}
