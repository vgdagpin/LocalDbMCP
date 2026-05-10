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
  database: DatabaseSchema,
  allowedTablePatterns: z
    .array(z.string().min(1))
    .min(1, "allowedTablePatterns must have at least one pattern"),
  excludedTablePatterns: z.array(z.string().min(1)).optional().default([]),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  // Search for config.json relative to cwd (dev) or next to dist/ (deployed)
  const candidates = [
    join(process.cwd(), "config.json"),
    join(__dirname, "..", "config.json"),
  ];

  let raw: unknown;
  let loaded = false;

  for (const candidate of candidates) {
    try {
      const content = readFileSync(candidate, "utf-8");
      raw = JSON.parse(content);
      loaded = true;
      break;
    } catch {
      // try next candidate
    }
  }

  if (!loaded) {
    throw new Error(
      "config.json not found. Copy config.example.json to config.json and fill in your database details."
    );
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`config.json is invalid:\n${issues}`);
  }

  return result.data;
}

export const config: Config = loadConfig();
