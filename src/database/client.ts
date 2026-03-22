import * as mssql from "mssql";
import { config } from "../config.js";

let pool: mssql.ConnectionPool | null = null;

function buildPoolConfig(): mssql.config {
  const db = config.database;
  return {
    server: db.server,
    database: db.name,
    options: {
      trustServerCertificate: db.options.trustServerCertificate,
      enableArithAbort: db.options.enableArithAbort,
      trustedConnection: true, // Windows Integrated Authentication — no username/password
    },
    connectionTimeout: db.options.connectTimeout,
    requestTimeout: db.options.requestTimeout,
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 60000,
    },
  };
}

export async function getPool(): Promise<mssql.ConnectionPool> {
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
