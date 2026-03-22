# LocalDbMCP

A read-only MCP (Model Context Protocol) server that connects to a SQL Server LocalDB instance and exposes only tables matching configurable name patterns. Use it with GitHub Copilot in VS Code or Visual Studio 2022 to query your local database through natural language.

## Features

- **Read-only**: Only `SELECT` queries are ever executed — no inserts, updates, or deletes.
- **Table allowlist**: Only tables matching your configured patterns (e.g., `pr_*`) are accessible.
- **Windows Authentication**: Connects to LocalDB without a username or password.
- **SQL injection prevention**: Multi-layer defense — identifier validation, parameterized values, strict Zod input schemas.

---

## Prerequisites

| Requirement | Minimum version | Check |
|---|---|---|
| Node.js | 18 | `node --version` |
| npm | 7 | `npm --version` |
| SQL Server LocalDB | Any | `sqllocaldb info` |

If LocalDB is not installed, get it from:
- **Visual Studio** — included with the "Data storage and processing" workload
- **SQL Server Express** — download from microsoft.com (includes LocalDB)

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

Edit `config.json` (never commit this file — it is gitignored):

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
| `allowedTablePatterns` | string[] | Glob patterns. `*` matches any sequence of characters. |

### Table patterns

| Pattern | Matches |
|---|---|
| `pr_*` | `pr_order`, `pr_customer`, `pr_invoice_line`, … |
| `inv_*` | `inv_item`, `inv_location`, … |
| `*_archive` | `orders_archive`, `users_archive`, … |
| `exact_table` | Only `exact_table` |
| `*` | All tables (not recommended) |

Matching is case-insensitive and applies to the bare table name (without schema prefix).

### Start the LocalDB instance

If the instance is not running, start it first:
```
sqllocaldb start MSSQLLocalDB
```

To verify it is running and see the named pipe:
```
sqllocaldb info MSSQLLocalDB
```

---

## Running (manual test)

The server is designed to be launched by an IDE. To test it manually:
```
npm start
```

You should see on stderr:
```
[LocalDbMCP] Starting — server: (localdb)\MSSQLLocalDB, database: YourDb, patterns: pr_*
[LocalDbMCP] MCP server running on stdio
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
    { "schema": "dbo", "name": "pr_order", "fullName": "dbo.pr_order" },
    { "schema": "dbo", "name": "pr_customer", "fullName": "dbo.pr_customer" }
  ],
  "totalCount": 2
}
```

---

### `get_table_schema`
Returns column definitions for a single allowed table.

**Input:**
```json
{ "tableName": "pr_order" }
```

**Response includes:** column name, data type, max length, nullability, default value.

---

### `query_table`
Executes a read-only SELECT with optional filters, ordering, and pagination.

**Input:**
```json
{
  "tableName": "pr_order",
  "filters": [
    { "column": "status", "operator": "=", "value": "open" }
  ],
  "orderBy": [
    { "column": "created_at", "direction": "DESC" }
  ],
  "limit": 50,
  "offset": 0
}
```

**Supported operators:** `=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE`, `NOT LIKE`

**Defaults:** `limit` = 100, `offset` = 0

---

## Connect to GitHub Copilot in VS Code

Create a file at `.vscode/mcp.json` in your workspace (or any project that should use this server):

```json
{
  "servers": {
    "local-db-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\full\\path\\to\\LocalDbMCP\\dist\\index.js"],
      "cwd": "C:\\full\\path\\to\\LocalDbMCP"
    }
  }
}
```

Replace `C:\\full\\path\\to\\LocalDbMCP` with the actual path to this project. The `cwd` must point to the directory containing `config.json`.

**Using a workspace-relative path:**
```json
{
  "servers": {
    "local-db-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/../LocalDbMCP/dist/index.js"],
      "cwd": "${workspaceFolder}/../LocalDbMCP"
    }
  }
}
```

After saving, reload the VS Code window (`Ctrl+Shift+P` → **Developer: Reload Window**).

Open **GitHub Copilot Chat** and try:
> "List my tables"
> "Show me the schema for pr_order"
> "Find all open orders from the pr_order table"

---

## Connect to GitHub Copilot in Visual Studio 2022

Visual Studio 2022 **17.13 or later** with the GitHub Copilot extension supports MCP servers.

### Option A — Via Visual Studio settings UI

1. Go to **Tools → Options → GitHub Copilot → MCP Servers**
2. Click **Add** and enter:
   - **Name**: `local-db-mcp`
   - **Command**: `node`
   - **Arguments**: `C:\full\path\to\LocalDbMCP\dist\index.js`
   - **Working Directory**: `C:\full\path\to\LocalDbMCP`
3. Click **OK** and restart Visual Studio.

### Option B — Via global MCP config file

Open or create this file (substitute your VS version number):
```
%APPDATA%\Microsoft\VisualStudio\<version>\Extensions\GitHub.Copilot\mcp.json
```

Common paths:
- VS 2022 17.x: `%APPDATA%\Microsoft\VisualStudio\17.0_<hash>\Extensions\GitHub.Copilot\mcp.json`

Contents:
```json
{
  "servers": {
    "local-db-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\full\\path\\to\\LocalDbMCP\\dist\\index.js"],
      "cwd": "C:\\full\\path\\to\\LocalDbMCP"
    }
  }
}
```

Restart Visual Studio after saving. The tools will be available in the **GitHub Copilot Chat** panel.

---

## Troubleshooting

**`config.json not found`**
Make sure you copied `config.example.json` to `config.json` in the project root and ran `npm run build`.

**`Connection failed` or `Login failed`**
- Confirm the LocalDB instance is running: `sqllocaldb start MSSQLLocalDB`
- Confirm the database name in `config.json` is correct.
- Try the exact named pipe from `sqllocaldb info MSSQLLocalDB` as the `server` value.

**Table not found / `not in the allowed table list`**
- The table name must match one of the `allowedTablePatterns` in `config.json`.
- Patterns are case-insensitive but must otherwise match the table name exactly (with `*` as wildcard).

**GitHub Copilot does not show the tools**
- VS Code: reload the window after saving `.vscode/mcp.json`.
- Visual Studio: restart the IDE after modifying MCP settings.
- Verify the `args` path uses full absolute paths with double backslashes in JSON.
