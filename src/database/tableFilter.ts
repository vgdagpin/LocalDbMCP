import { config } from "../config.js";

// Compiled once at startup for performance
const compiledAllowedPatterns: RegExp[] = config.allowedTablePatterns.map(
  patternToRegex
);
const compiledExcludedPatterns: RegExp[] = config.excludedTablePatterns.map(
  patternToRegex
);

/**
 * Converts a simple glob pattern (supporting only * wildcards) to a RegExp.
 * Example: "pr_*" -> /^pr_.*$/i
 */
export function patternToRegex(pattern: string): RegExp {
  // Escape all regex metacharacters except *, which we handle separately
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // Replace glob * with regex .*
  const regexStr = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${regexStr}$`, "i");
}

/**
 * Returns true if the given table name matches at least one allowed pattern
 * and does not match any excluded pattern.
 * Matching is on the bare table name only (no schema prefix), case-insensitive.
 */
export function isTableAllowed(tableName: string): boolean {
  const isAllowed = compiledAllowedPatterns.some((re) => re.test(tableName));
  if (!isAllowed) return false;
  const isExcluded = compiledExcludedPatterns.some((re) => re.test(tableName));
  return !isExcluded;
}

/**
 * Filters a list of schema+table pairs, returning only allowed tables.
 */
export function filterAllowedTables(
  tables: Array<{ schemaName: string; tableName: string }>
): Array<{ schemaName: string; tableName: string }> {
  return tables.filter((t) => isTableAllowed(t.tableName));
}
