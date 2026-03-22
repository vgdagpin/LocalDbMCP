import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { closePool, getPool } from "./database/client.js";
import { listTables } from "./tools/listTables.js";
import { getTableSchema } from "./tools/getSchema.js";
import { queryTable } from "./tools/queryData.js";

const server = new Server(
  {
    name: "local-db-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_tables",
        description:
          "List all tables in the configured LocalDB database that match the allowed table patterns defined in config.json.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          required: [],
        },
      },
      {
        name: "get_table_schema",
        description:
          "Get the column definitions (name, data type, nullable, default) for an allowed table.",
        inputSchema: {
          type: "object" as const,
          properties: {
            tableName: {
              type: "string",
              description: "The table name (without schema prefix) to describe.",
            },
          },
          required: ["tableName"],
        },
      },
      {
        name: "query_table",
        description:
          "Execute a read-only SELECT against an allowed table with optional filtering, ordering, and pagination.",
        inputSchema: {
          type: "object" as const,
          properties: {
            tableName: {
              type: "string",
              description: "The table name to query (must match an allowed pattern).",
            },
            filters: {
              type: "array",
              description: "Optional WHERE conditions (all combined with AND).",
              items: {
                type: "object",
                properties: {
                  column: { type: "string", description: "Column name to filter on." },
                  operator: {
                    type: "string",
                    enum: ["=", "!=", ">", ">=", "<", "<=", "LIKE", "NOT LIKE"],
                    description: "Comparison operator.",
                  },
                  value: {
                    oneOf: [
                      { type: "string" },
                      { type: "number" },
                      { type: "boolean" },
                      { type: "null" },
                    ],
                    description: "Value to compare against.",
                  },
                },
                required: ["column", "operator", "value"],
              },
            },
            orderBy: {
              type: "array",
              description: "Optional ORDER BY columns.",
              items: {
                type: "object",
                properties: {
                  column: { type: "string", description: "Column name to sort by." },
                  direction: {
                    type: "string",
                    enum: ["ASC", "DESC"],
                    description: "Sort direction (default ASC).",
                  },
                },
                required: ["column"],
              },
            },
            limit: {
              type: "number",
              description: "Maximum rows to return (1–1000, default 100).",
            },
            offset: {
              type: "number",
              description: "Number of rows to skip for pagination (default 0).",
            },
          },
          required: ["tableName"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_tables": {
        const result = await listTables();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_table_schema": {
        if (!args || typeof args["tableName"] !== "string") {
          throw new Error("tableName is required and must be a string.");
        }
        const result = await getTableSchema(args["tableName"]);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "query_table": {
        const result = await queryTable(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

process.on("SIGINT", async () => {
  await closePool();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closePool();
  process.exit(0);
});

async function main() {
  // Config is validated at module load time — any errors appear immediately
  console.error(
    `[LocalDbMCP] Starting — server: ${config.database.server}, ` +
      `database: ${config.database.name}, ` +
      `patterns: ${config.allowedTablePatterns.join(", ")}`
  );

  // Test database connection
  try {
    const pool = await getPool();
    const result = await pool.request().query("SELECT DB_NAME() as dbName, @@VERSION as version");
    const dbName = result.recordset[0]?.dbName;
    console.error(`[LocalDbMCP] ✓ Database connection successful — connected to: ${dbName}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[LocalDbMCP] ✗ Database connection failed: ${message}`);
    console.error("[LocalDbMCP] Server will start but tools will fail until connection is fixed");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[LocalDbMCP] MCP server running on stdio");
}

main().catch((error) => {
  console.error("[LocalDbMCP] Fatal error:", error);
  process.exit(1);
});
