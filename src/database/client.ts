// Use msnodesqlv8 — Microsoft's native Windows driver.
// It supports (localdb)\InstanceName, Windows Auth, and named pipes natively.
import type { ConnectionPool, config as MssqlConfig } from "mssql";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mssql = require("mssql/msnodesqlv8") as typeof import("mssql");

import { config } from "../config.js";

let pool: ConnectionPool | null = null;

function buildPoolConfig(): MssqlConfig {
  const db = config.database;

  // Build an ODBC connection string directly — bypasses mssql's builder which
  // defaults to 'SQL Server Native Client 11.0' on Windows.
  // ODBC Driver 17 for SQL Server handles (localdb)\InstanceName natively.
  const odbcDriver = db.odbcDriver ?? "ODBC Driver 17 for SQL Server";
  const connectionString =
    `Driver={${odbcDriver}};` +
    `Server=${db.server};` +
    `Database=${db.name};` +
    `Trusted_Connection=Yes;` +
    `Encrypt=No;` +
    `TrustServerCertificate=Yes;`;

  const cfg: MssqlConfig & { connectionString?: string } = {
    server: db.server,
    database: db.name,
    connectionString,  // mssql/msnodesqlv8 reads this; @types/mssql doesn't declare it
    options: {
      enableArithAbort: db.options.enableArithAbort,
    },
    connectionTimeout: db.options.connectTimeout,
    requestTimeout: db.options.requestTimeout,
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 60000,
    },
  };
  return cfg;
}

export async function getPool(): Promise<ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }
  if (pool) {
    await pool.close().catch(() => {});
    pool = null;
  }
  pool = new mssql.ConnectionPool(buildPoolConfig());
  await pool.connect();
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close().catch(() => {});
    pool = null;
  }
}
