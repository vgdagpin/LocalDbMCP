// Use msnodesqlv8 — Microsoft's native Windows driver.
// It supports (localdb)\InstanceName, Windows Auth, named pipes, and AAD auth natively.
import type { ConnectionPool, config as MssqlConfig } from "mssql";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mssql = require("mssql/msnodesqlv8") as typeof import("mssql");

import { config } from "../config.js";

let pool: ConnectionPool | null = null;

interface ParsedAdoNet {
  server: string | undefined;
  database: string | undefined;
  odbcConnectionString: string;
}

/**
 * Parses an ADO.NET connection string and converts it to an ODBC connection string
 * suitable for msnodesqlv8. Returns parsed server/database fields for the pool config.
 *
 * Supported ADO.NET keys → ODBC mapping:
 *   Data Source            → Server
 *   Initial Catalog        → Database
 *   Connect Timeout        → Connection Timeout  (already in seconds)
 *   Integrated Security    → Trusted_Connection  (SSPI/True → Yes)
 *   Encrypt                → Encrypt             (True → Yes, False → No)
 *   TrustServerCertificate → TrustServerCertificate (True → Yes, False → No)
 *   Authentication         → Authentication      (spaces removed, e.g. "ActiveDirectoryInteractive")
 *   Persist Security Info  → (ignored)
 */
function parseAdoNet(adoNetCs: string, odbcDriver: string): ParsedAdoNet {
  const pairs: Record<string, string> = {};
  for (const segment of adoNetCs.split(";")) {
    const eq = segment.indexOf("=");
    if (eq < 0) continue;
    const key = segment.slice(0, eq).trim().toLowerCase();
    const value = segment.slice(eq + 1).trim();
    if (key) pairs[key] = value;
  }

  const get = (...keys: string[]): string | undefined => {
    for (const k of keys) if (pairs[k] !== undefined) return pairs[k];
    return undefined;
  };

  const boolYesNo = (v: string | undefined): string =>
    v?.toLowerCase() === "true" || v?.toLowerCase() === "yes" ? "Yes" : "No";

  const parts: string[] = [`Driver={${odbcDriver}}`];

  const server = get("data source", "server");
  if (server) parts.push(`Server=${server}`);

  const database = get("initial catalog", "database");
  if (database) parts.push(`Database=${database}`);

  const intSec = get("integrated security");
  if (intSec?.toLowerCase() === "sspi" || intSec?.toLowerCase() === "true") {
    parts.push("Trusted_Connection=Yes");
  }

  const auth = get("authentication");
  if (auth) {
    // "Active Directory Interactive" → "ActiveDirectoryInteractive"
    parts.push(`Authentication=${auth.replace(/\s+/g, "")}`);
  }

  const encrypt = get("encrypt");
  if (encrypt !== undefined) parts.push(`Encrypt=${boolYesNo(encrypt)}`);

  const trustCert = get("trustservercertificate");
  if (trustCert !== undefined) parts.push(`TrustServerCertificate=${boolYesNo(trustCert)}`);

  const timeout = get("connect timeout", "connection timeout");
  if (timeout) parts.push(`Connection Timeout=${timeout}`);

  return {
    server,
    database,
    odbcConnectionString: parts.join(";") + ";",
  };
}

function buildPoolConfig(): MssqlConfig {
  const effectiveCs = process.env.MCP_CONNECTION_STRING ?? config.connectionString;
  const odbcDriver =
    config.odbcDriver ?? config.database?.odbcDriver ?? "ODBC Driver 17 for SQL Server";

  if (effectiveCs) {
    const parsed = parseAdoNet(effectiveCs, odbcDriver);
    const cfg: MssqlConfig & { connectionString?: string } = {
      server: parsed.server ?? "localhost",
      database: parsed.database,
      connectionString: parsed.odbcConnectionString,
      options: {
        enableArithAbort: true,
      },
      requestTimeout: config.requestTimeout ?? 30000,
      pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 60000,
      },
    };
    return cfg;
  }

  // Fall back to structured database config
  const db = config.database!;
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
    connectionString,
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
