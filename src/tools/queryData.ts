import { z } from "zod";
import { getPool } from "../database/client.js";
import { isTableAllowed } from "../database/tableFilter.js";
import { validateIdentifier } from "../utils/validation.js";

const FilterSchema = z.object({
  column: z.string().min(1),
  operator: z.enum(["=", "!=", ">", ">=", "<", "<=", "LIKE", "NOT LIKE"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

const OrderBySchema = z.object({
  column: z.string().min(1),
  direction: z.enum(["ASC", "DESC"]).default("ASC"),
});

const QueryTableInputSchema = z.object({
  tableName: z.string().min(1),
  filters: z.array(FilterSchema).optional().default([]),
  orderBy: z.array(OrderBySchema).optional().default([]),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});

export type QueryTableInput = z.infer<typeof QueryTableInputSchema>;

export interface QueryTableResult {
  tableName: string;
  rowCount: number;
  rows: Record<string, unknown>[];
  offset: number;
  limit: number;
  hasMore: boolean;
}

export async function queryTable(rawInput: unknown): Promise<QueryTableResult> {
  // Layer 1: Zod schema validation — rejects wrong types, out-of-range values,
  // invalid operators/directions before any SQL is constructed
  const input = QueryTableInputSchema.parse(rawInput);

  // Layer 2: Identifier validation on table name
  validateIdentifier(input.tableName);

  // Layer 3: Allowlist check
  if (!isTableAllowed(input.tableName)) {
    throw new Error(
      `Table "${input.tableName}" is not accessible. ` +
        `Check allowedTablePatterns and excludedTablePatterns in config.json.`
    );
  }

  // Layer 4: Validate all column names in filters and orderBy
  for (const filter of input.filters) {
    validateIdentifier(filter.column);
  }
  for (const order of input.orderBy) {
    validateIdentifier(order.column);
  }

  const pool = await getPool();
  const request = pool.request();

  // Layer 5: Build WHERE clause — values go through parameterized bindings only
  const whereClauses: string[] = [];
  input.filters.forEach((filter, idx) => {
    const paramName = `filter_val_${idx}`;
    request.input(paramName, filter.value);
    // Column name is identifier-validated and bracket-quoted — safe to embed
    whereClauses.push(`[${filter.column}] ${filter.operator} @${paramName}`);
  });

  const whereClause =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Build ORDER BY clause — column names are identifier-validated and bracket-quoted
  // direction is constrained to "ASC" | "DESC" by Zod enum
  const orderClause =
    input.orderBy.length > 0
      ? `ORDER BY ${input.orderBy
          .map((o) => `[${o.column}] ${o.direction}`)
          .join(", ")}`
      : "ORDER BY (SELECT NULL)"; // Required by SQL Server for OFFSET-FETCH

  // limit and offset are Zod-validated integers with hard bounds — safe to embed
  // Table name is identifier-validated and bracket-quoted
  const sql = `
    SELECT *
    FROM [${input.tableName}]
    ${whereClause}
    ${orderClause}
    OFFSET ${input.offset} ROWS
    FETCH NEXT ${input.limit} ROWS ONLY
  `;

  const result = await request.query(sql);
  const rows = result.recordset as Record<string, unknown>[];

  return {
    tableName: input.tableName,
    rowCount: rows.length,
    rows,
    offset: input.offset,
    limit: input.limit,
    hasMore: rows.length === input.limit,
  };
}
