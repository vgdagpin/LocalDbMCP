import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

const DatabaseOptionsSchema = z.object({
  trustServerCertificate: z.boolean().default(true),
  enableArithAbort: z.boolean().default(true),
  connectTimeout: z.number().int().positive().default(30000),
  requestTimeout: z.number().int().positive().default(30000),
});

const DatabaseSchema = z.object({
  server: z.string().min(1),
  name: z.string().min(1),
  odbcDriver: z.string().optional(), // e.g. "ODBC Driver 17 for SQL Server"
  options: DatabaseOptionsSchema.default({}),
});

const ConfigSchema = z.object({
  // ADO.NET format connection string — takes priority over database.* when present.
  // Also overridden by the MCP_CONNECTION_STRING environment variable.
  connectionString: z.string().optional(),
  // Override the ODBC driver for all connection modes (default: ODBC Driver 17 for SQL Server)
  odbcDriver: z.string().optional(),
  // Query execution timeout in ms when using connectionString (default: 30000)
  requestTimeout: z.number().int().positive().optional(),
  // Structured connection settings — used when connectionString is absent
  database: DatabaseSchema.optional(),
  // Table access control — can also be set via MCP_ALLOWED_PATTERNS env var (comma-separated)
  allowedTablePatterns: z
    .array(z.string().min(1))
    .optional(),
  // Extra deny-list — can also be set via MCP_EXCLUDED_PATTERNS env var (comma-separated)
  excludedTablePatterns: z.array(z.string().min(1)).optional().default([]),
});

export type Config = z.infer<typeof ConfigSchema> & {
  allowedTablePatterns: string[];
};

function loadConfig(): Config {
  // Search for config.json relative to cwd (dev) or next to dist/ (deployed)
  const candidates = [
    join(process.cwd(), "config.json"),
    join(__dirname, "..", "config.json"),
  ];

  let raw: unknown = {};

  for (const candidate of candidates) {
    try {
      const content = readFileSync(candidate, "utf-8");
      raw = JSON.parse(content);
      break;
    } catch {
      // try next candidate; if none found, raw stays {} and env vars must supply everything
    }
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`config.json is invalid:\n${issues}`);
  }

  const data = result.data;

  // Validate that at least one connection source is available
  const hasEnvCs = !!process.env.MCP_CONNECTION_STRING;
  if (!hasEnvCs && !data.connectionString && !data.database) {
    throw new Error(
      "No database connection configured. " +
        "Provide either 'connectionString' or 'database' in config.json, " +
        "or pass -ConnectionString to mcp-server.ps1 (sets MCP_CONNECTION_STRING env var)."
    );
  }

  // Apply MCP_ALLOWED_PATTERNS env var (comma-separated list overrides config)
  const envAllowed = process.env.MCP_ALLOWED_PATTERNS;
  if (envAllowed) {
    data.allowedTablePatterns = envAllowed
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  }

  // Apply MCP_EXCLUDED_PATTERNS env var (comma-separated list overrides config)
  const envExcluded = process.env.MCP_EXCLUDED_PATTERNS;
  if (envExcluded) {
    data.excludedTablePatterns = envExcluded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  }

  // Validate that at least one allowed pattern is available after env var merge
  if (!data.allowedTablePatterns || data.allowedTablePatterns.length === 0) {
    throw new Error(
      "No allowedTablePatterns configured. " +
        "Add 'allowedTablePatterns' to config.json or pass -AllowedTablePatterns to mcp-server.ps1."
    );
  }

  return data as Config;
}

export const config: Config = loadConfig();
