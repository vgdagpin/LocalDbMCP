import * as mssql from "mssql";
import { config } from "../config.js";

let pool: mssql.ConnectionPool | null = null;

function buildPoolConfig(): mssql.config {
  const db = config.database;
  
  // For LocalDB: server format is (localdb)\InstanceName
  // Extract instance name if present
  const parts = db.server.match(/\(localdb\)\\(.+)/i);
  const instanceName = parts ? parts[1] : undefined;
  
  return {
    server: "localhost",  // LocalDB accessed via localhost
    database: db.name,
    authentication: {
      type: "default",
      options: {
        userName: undefined,
        password: undefined,
      },
    },
    options: {
      trustServerCertificate: db.options.trustServerCertificate,
      enableArithAbort: db.options.enableArithAbort,
      encrypt: false,  // LocalDB doesn't support encryption by default
      instanceName: instanceName,
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
