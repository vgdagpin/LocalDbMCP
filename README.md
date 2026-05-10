# BDADbMCP

A read-only MCP (Model Context Protocol) server that connects to a SQL Server database and exposes only tables matching configurable name patterns. Supports both **SQL Server LocalDB** (Windows Auth) and **Azure SQL** (AAD Interactive). Use it with GitHub Copilot in VS Code or Visual Studio 2022 to query your local or cloud database through natural language.

## Features

- **Read-only**: Only `SELECT` queries are ever executed — no inserts, updates, or deletes.
- **Table allowlist**: Only tables matching your configured patterns (e.g., `pr_*`) are accessible.
- **Multiple connection modes**: LocalDB (Windows Auth/SSPI), Azure SQL (AAD Interactive), or any ADO.NET connection string.
- **SQL injection prevention**: Multi-layer defense — identifier validation, parameterized values, strict Zod input schemas.

---

## Prerequisites

| Requirement | Minimum version | Check |
|---|---|---|
| Node.js | 18 | `node --version` |
| npm | 7 | `npm --version` |
| ODBC Driver 17 for SQL Server | Any | See below |
| SQL Server LocalDB | Any (LocalDB only) | `sqllocaldb info` |

**ODBC Driver 17 for SQL Server** is required for both LocalDB and Azure SQL connections. It is included with:
- **Visual Studio** — "Data storage and processing" workload
- **SQL Server Express** — download from microsoft.com (includes LocalDB and the driver)
- **Standalone** — [Download from Microsoft](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)

---

## Installation

**1. Clone or download this repository.**

**2. Install dependencies:**
```
npm install
```

**3. Copy the example config and fill in your details:**
```
copy config.example.json config.json
```
Then edit `config.json` (see [Configuration](#configuration) below).

**4. Build:**
```
npm run build
```

---

## Configuration

Edit `config.json` (never commit this file — it is gitignored). Use **either** `connectionString` **or** the `database` block — not both.

### Option A — ADO.NET connection string (recommended)

Works for both LocalDB and Azure SQL:

```json
{
  "connectionString": "Data Source=(localdb)\\mssqllocaldb;Initial Catalog=YourDatabaseName;Integrated Security=SSPI;",
  "allowedTablePatterns": ["pr_*", "inv_*"]
}
```

**LocalDB (Windows Auth):**
```
Data Source=(localdb)\mssqllocaldb;Initial Catalog=YourDatabaseName;Integrated Security=SSPI;
```

**Azure SQL (AAD Interactive — prompts a browser login):**
```
Data Source=yourserver.database.windows.net;Initial Catalog=YourDb;Authentication=Active Directory Interactive;Encrypt=True;TrustServerCertificate=False;
```

| Field | Type | Description |
|---|---|---|
| `connectionString` | string | ADO.NET format connection string. |
| `requestTimeout` | number | Query execution timeout in ms (default: 30000). |
| `odbcDriver` | string | Override ODBC driver (default: `ODBC Driver 17 for SQL Server`). |
| `allowedTablePatterns` | string[] | Glob patterns. `*` matches any sequence of characters. |
| `excludedTablePatterns` | string[] | Patterns to deny even if matched by `allowedTablePatterns`. |

### Option B — Structured database block (LocalDB only)

```json
{
  "database": {
    "server": "(localdb)\\MSSQLLocalDB",
    "name": "YourDatabaseName",
    "options": {
      "trustServerCertificate": true,
      "connectTimeout": 30000,
      "requestTimeout": 30000
    }
  },
  "allowedTablePatterns": ["pr_*", "inv_*"]
}
```

| Field | Type | Description |
|---|---|---|
| `database.server` | string | LocalDB instance name. Default is `(localdb)\MSSQLLocalDB`. |
| `database.name` | string | The database to connect to. |
| `database.options.trustServerCertificate` | boolean | Always `true` for LocalDB. |
| `database.options.connectTimeout` | number | Connection timeout in milliseconds. |
| `database.options.requestTimeout` | number | Query timeout in milliseconds. |

### Table patterns

| Pattern | Matches |
|---|---|
| `pr_*` | `pr_benefit_def`, `pr_option_def`, … |
| `cm_*` | `cm_lookup`, `cm_document_def`, … |
| `*_archive` | `web_archive`, … |
| `exact_table` | Only `exact_table` |
| `*` | All tables (not recommended) |

Matching is case-insensitive and applies to the bare table name (without schema prefix).

### Start the LocalDB instance

If using LocalDB and the instance is not running, start it first:
```
sqllocaldb start MSSQLLocalDB
```

To verify it is running and see the named pipe:
```
sqllocaldb info MSSQLLocalDB
```

---

## Running with `mcp-server.ps1`

`mcp-server.ps1` is a PowerShell helper that wraps the Node.js server. It supports three actions.

> **`config.json` is now fully optional** — all configuration can be passed via CLI params:
> - `-ConnectionString` — database connection
> - `-AllowedTablePatterns` — which tables to expose
> - `-ExcludedTablePatterns` — which tables to hide (optional)

### Start
```powershell
# Minimal — all config via CLI (no config.json needed)
.\mcp-server.ps1 -Action start `
  -ConnectionString "Data Source=(localdb)\mssqllocaldb;Initial Catalog=YourDb;Integrated Security=SSPI;" `
  -AllowedTablePatterns "pr_*","cm_*","job_def"

# With excluded patterns
.\mcp-server.ps1 -Action start `
  -ConnectionString "Data Source=(localdb)\mssqllocaldb;Initial Catalog=YourDb;Integrated Security=SSPI;" `
  -AllowedTablePatterns "pr_*","cm_*" `
  -ExcludedTablePatterns "pr_sensitive_*"

# Azure SQL (AAD Interactive — a browser popup will appear for auth)
.\mcp-server.ps1 -Action start `
  -ConnectionString "Data Source=yourserver.database.windows.net;Initial Catalog=YourDb;Authentication=Active Directory Interactive;Encrypt=True;" `
  -AllowedTablePatterns "pr_*","cm_*"

# Using config.json for patterns (connection string still via CLI)
.\mcp-server.ps1 -Action start -ConnectionString "Data Source=(localdb)\mssqllocaldb;..."
```

### `-AllowedTablePatterns` syntax

| Call style | Example |
|---|---|
| Direct PowerShell (array literal) | `-AllowedTablePatterns "pr_*","cm_*","job_def"` |
| From mcp-config.json JSON args (separate values) | `"-AllowedTablePatterns", "pr_*", "cm_*", "job_def"` |

The param type is `[string[]]` — a real PowerShell array. When passed via JSON args, list each pattern as a separate element in the `args` array and PowerShell will bind them all as one array parameter. Do **not** use a single comma-separated string when calling from JSON (use separate elements instead).

### Test connection
Verifies the connection and pattern config before committing to `mcp-config.json`:
```powershell
# LocalDB
.\mcp-server.ps1 -Action test `
  -ConnectionString "Data Source=(localdb)\mssqllocaldb;Initial Catalog=YourDb;Integrated Security=SSPI;" `
  -AllowedTablePatterns "pr_*","cm_*"

# Azure SQL
.\mcp-server.ps1 -Action test `
  -ConnectionString "Data Source=yourserver.database.windows.net;Initial Catalog=YourDb;Authentication=Active Directory Interactive;Encrypt=True;" `
  -AllowedTablePatterns "pr_*"
```

The test waits up to 60 seconds (to allow AAD browser login to complete) and reports success or failure.

### Show config
```powershell
.\mcp-server.ps1 -Action config
```

---

## Running (manual test)

The server is designed to be launched by an IDE. To test it manually:
```
npm start
```

You should see on stderr:
```
[BDADbMCP] Starting — server: (localdb)\MSSQLLocalDB, database: YourDb, patterns: pr_*
[BDADbMCP] MCP server running on stdio
```

Press `Ctrl+C` to stop.

---

## Available Tools

Once connected, GitHub Copilot can call these tools:

### `list_tables`
Lists all tables in the database that match your allowed patterns.

**No input required.**

Example response:
```json
{
  "tables": [
    { "schema": "dbo", "name": "pr_benefit_def", "fullName": "dbo.pr_benefit_def" },
    { "schema": "dbo", "name": "pr_option_def", "fullName": "dbo.pr_option_def" }
  ],
  "totalCount": 2
}
```

---

### `get_table_schema`
Returns column definitions for a single allowed table.

**Input:**
```json
{ "tableName": "pr_benefit_def" }
```

**Response includes:** column name, data type, max length, nullability, default value.

---

### `query_table`
Executes a read-only SELECT with optional filters, ordering, and pagination.

**Input:**
```json
{
  "tableName": "pr_benefit_def",
  "filters": [
    { "column": "PlanYear", "operator": "=", "value": "2026" }
  ],
  "orderBy": [
    { "column": "SortOrder", "direction": "ASC" }
  ],
  "limit": 50,
  "offset": 0
}
```

**Supported operators:** `=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE`, `NOT LIKE`

**Defaults:** `limit` = 100, `offset` = 0

---

## Setup with GitHub Copilot CLI

To use this MCP server with the **GitHub Copilot CLI** (`copilot`), configure it in the user-level MCP configuration file.

Create or edit this file:
```
%USERPROFILE%\.copilot\mcp-config.json
```

On Windows, this is typically:
```
C:\Users\YourUsername\.copilot\mcp-config.json
```

**LocalDB connection (with patterns in JSON args):**
```json
{
  "mcpServers": {
    "bda-db-mcp": {
      "type": "stdio",
      "command": "pwsh",
      "tools": ["*"],
      "args": [
        "-File", "C:\\path\\to\\BDADbMCP\\mcp-server.ps1",
        "-Action", "start",
        "-ConnectionString", "Data Source=(localdb)\\mssqllocaldb;Initial Catalog=YourDb;Integrated Security=SSPI;",
        "-AllowedTablePatterns", "pr_*", "cm_*", "job_def"
      ]
    }
  }
}
```

**Azure SQL (AAD Interactive) with excluded patterns:**
```json
{
  "mcpServers": {
    "bda-db-mcp": {
      "type": "stdio",
      "command": "pwsh",
      "tools": ["*"],
      "args": [
        "-File", "C:\\path\\to\\BDADbMCP\\mcp-server.ps1",
        "-Action", "start",
        "-ConnectionString", "Data Source=yourserver.database.windows.net;Initial Catalog=YourDb;Authentication=Active Directory Interactive;Encrypt=True;",
        "-AllowedTablePatterns", "pr_*", "cm_*",
        "-ExcludedTablePatterns", "pr_sensitive_*"
      ]
    }
  }
}
```

> **Note on `-AllowedTablePatterns` in JSON args:** List each pattern as a **separate element** in the `args` array. PowerShell's `-File` mode binds consecutive non-flag values to the `[string[]]` parameter automatically — stopping when it sees the next `-Flag`.

> **Tip:** You can also omit `-AllowedTablePatterns` / `-ConnectionString` and put them in `config.json`. CLI params always take priority over `config.json`. With both `-ConnectionString` and `-AllowedTablePatterns` supplied, `config.json` is not needed at all.

**After saving the config:**
- Restart your terminal session
- Run `copilot` commands as usual

The Copilot CLI will automatically connect to your MCP server and make the database tools available. You can then ask questions like:
> "What tables are available in my database?"  
> "Show me the schema for pr_order"  
> "Query the pr_customer table for active customers"

---

## Troubleshooting

**`No allowedTablePatterns configured`**
Add `allowedTablePatterns` to `config.json`, or pass `-AllowedTablePatterns "pr_*","cm_*"` to `mcp-server.ps1`.

**`config.json not found`**
`config.json` is now optional if `-ConnectionString` and `-AllowedTablePatterns` are passed via CLI. If you want a file-based config, copy `config.example.json` to `config.json`.

**`Connection failed` or `Login failed` (LocalDB)**
- Confirm the LocalDB instance is running: `sqllocaldb start MSSQLLocalDB`
- Confirm the database name in your connection string or `config.json` is correct.
- Try the exact named pipe from `sqllocaldb info MSSQLLocalDB` as the `Data Source` value.

**`Connection failed` (Azure SQL)**
- Run the test action first: `.\mcp-server.ps1 -Action test -ConnectionString "..."`
- A browser window should open for AAD authentication — the test waits up to 60 seconds.
- Ensure your Azure AD account has at least `db_datareader` on the target database.
- Confirm `Encrypt=True` and `TrustServerCertificate=False` for Azure SQL.

**Table not found / `not in the allowed table list`**
- The table name must match one of the `allowedTablePatterns` (from `config.json` or `-AllowedTablePatterns`).
- Patterns are case-insensitive but must otherwise match the table name exactly (with `*` as wildcard).

**GitHub Copilot does not show the tools**
- VS Code: reload the window after saving `.vscode/mcp.json`.
- Visual Studio: restart the IDE after modifying MCP settings.
- Verify the `args` path uses full absolute paths with double backslashes in JSON.
