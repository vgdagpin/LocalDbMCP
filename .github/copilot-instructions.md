# LocalDbMCP — Copilot Instructions

A read-only MCP (Model Context Protocol) server that exposes SQL Server LocalDB tables to AI assistants. Windows-only — uses Windows Authentication via the `msnodesqlv8` native driver.

## Build & Run

```bash
npm install          # first-time setup
npm run build        # compile TypeScript → dist/
npm start            # run the server (manual test)
npm run dev          # watch mode — recompiles on file save
```

There is no test suite. Manual testing: `npm start` and verify the startup banner on stderr, then confirm database connection message.

To test MCP protocol connectivity via PowerShell:
```powershell
.\mcp-server.ps1 -Action test
```

## Architecture

The server is a single Node.js process that speaks the MCP protocol over **stdio** (stdout = JSON-RPC frames, stderr = human-readable logs). It exposes three tools:

| Tool | Handler |
|---|---|
| `list_tables` | `src/tools/listTables.ts` |
| `get_table_schema` | `src/tools/getSchema.ts` |
| `query_table` | `src/tools/queryData.ts` |

**Request flow for `query_table`** (the most complex path):
1. `src/index.ts` — receives MCP call, dispatches to handler
2. `src/tools/queryData.ts` — 5-layer defense: Zod parse → identifier validation → allowlist check → column identifier validation → parameterized SQL
3. `src/database/client.ts` — lazy singleton connection pool using `mssql/msnodesqlv8`
4. `src/database/tableFilter.ts` — glob patterns compiled once at startup into `RegExp[]`

**Config loading** (`src/config.ts`): `config.json` is read and Zod-validated at module load time. Any schema error aborts startup immediately. The file is searched in `cwd` first, then `../` relative to `dist/`.

## Key Conventions

### stdout is sacred — always use stderr for logging
The MCP protocol uses stdout exclusively for JSON-RPC. All `console.log`/`console.error` calls in tool handlers and `index.ts` must go to stderr. Use `process.stderr.write(...)` or `console.error(...)`.

### TypeScript import paths use `.js` extension
The project uses `"module": "Node16"` in `tsconfig.json`. All relative imports must use `.js` extension even though the source files are `.ts`:
```ts
import { config } from "./config.js";        // ✓ correct
import { config } from "./config";           // ✗ breaks at runtime
```

### SQL injection is multi-layered — maintain all layers
When modifying `query_table` or adding new query tools, all five layers must be preserved in order:
1. **Zod schema** — rejects wrong types and invalid enum values before SQL is touched
2. **`validateIdentifier()`** — regex whitelist on all identifier strings (`^[A-Za-z_][A-Za-z0-9_$]*$`)
3. **Allowlist check** — `isTableAllowed()` via compiled glob patterns
4. **Column identifier validation** — same `validateIdentifier()` on filter/orderBy columns
5. **Parameterized values** — filter values go through `request.input(paramName, value)` only; never string-interpolated

Validated identifiers are always bracket-quoted in SQL: `[${tableName}]`, `[${column}]`.

### `mssql/msnodesqlv8` — not `mssql` directly
`client.ts` uses `require("mssql/msnodesqlv8")` (not the default `import from "mssql"`) because the standard mssql driver cannot handle `(localdb)\InstanceName` or Windows Authentication. The ODBC connection string is built manually for the same reason — mssql's built-in string builder defaults to a deprecated SQL Native Client driver.

### Tool response format
Every tool handler returns this exact shape — never throw out of the `switch`:
```ts
return {
  content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
};
```
Errors are returned as:
```ts
return {
  content: [{ type: "text", text: `Error: ${message}` }],
  isError: true,
};
```

### config.json is gitignored
`config.json` holds local DB credentials and must never be committed. `config.example.json` is the source of truth for the config schema. When adding new config fields, update **both** `config.example.json` (example values) and the Zod schema in `src/config.ts`.

### Pattern matching is case-insensitive glob (`*` only)
`tableFilter.ts` supports only `*` as a wildcard (no `?`, `**`, or brace expansion). Patterns are compiled to `RegExp` once at startup — avoid per-request compilation. Matching applies to the bare table name without schema prefix.

### `excludedTablePatterns` takes priority over `allowedTablePatterns`
A table matching both an allowed pattern and an excluded pattern is **denied**. Check `isTableAllowed()` in `tableFilter.ts` before assuming a table is accessible.
