#!/usr/bin/env node
/**
 * Minimal stdio MCP server for integration tests.
 *
 * Exposes one tool (`fixture_tool`) and speaks the MCP JSON-RPC protocol on
 * stdin/stdout.  The server writes its PID to the file named by the
 * `MCP_FIXTURE_PID_FILE` environment variable so tests can verify the process
 * exits after session shutdown.
 */

import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

// ── PID file ─────────────────────────────────────────────────────────────────
if (process.env.MCP_FIXTURE_PID_FILE) {
  await writeFile(process.env.MCP_FIXTURE_PID_FILE, String(process.pid));
}

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────
function sendResponse(id, result) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write(msg + "\n");
}

function sendError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
  process.stdout.write(msg + "\n");
}

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "fixture_tool",
    description: "A fixture tool for integration tests.",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Any string input." },
      },
    },
  },
];

// ── Message dispatch ──────────────────────────────────────────────────────────
function handleMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return; // malformed; ignore
  }

  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      sendResponse(id, {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1.0.0" },
      });
      break;

    case "ping":
      sendResponse(id, {});
      break;

    case "tools/list":
      sendResponse(id, { tools: TOOLS });
      break;

    case "tools/call": {
      const name = params?.name;
      if (name === "fixture_tool") {
        sendResponse(id, {
          content: [
            {
              type: "text",
              text: `fixture_tool called with: ${JSON.stringify(params?.arguments ?? {})}`,
            },
          ],
        });
      } else {
        sendError(id, -32601, `Unknown tool: ${name}`);
      }
      break;
    }

    default:
      if (id !== undefined && id !== null) {
        // Respond to unknown requests so the client doesn't hang.
        sendResponse(id, {});
      }
      // Notifications (no id) are silently ignored.
      break;
  }
}

// ── Stdin reader ──────────────────────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", handleMessage);

// Keep the process alive until stdin closes.
rl.on("close", () => process.exit(0));
