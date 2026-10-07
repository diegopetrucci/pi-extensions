/**
 * project-mcp-json: reads a Claude Code-style .mcp.json from the project
 * working directory and registers the configured MCP servers with pi.
 *
 * The handler is synchronous (no awaits); there is no async gap between the
 * trust decision and server registration.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  getAgentDir,
  hasTrustRequiringProjectResources,
  ProjectTrustStore,
  SettingsManager,
  type DefaultProjectTrust,
} from "@earendil-works/pi-coding-agent";
import { parseMcpJson, sanitizeStringForWarning } from "./config.ts";
import fs from "node:fs";
import path from "node:path";

export default function (pi: ExtensionAPI): void {
  // Guard: pi.registerMcpServer was introduced in Pi 1.0.  If the API is
  // absent (older Pi version), emit a single session-start notice and bail
  // out rather than crashing or emitting per-server errors.
  if (typeof (pi as unknown as Record<string, unknown>).registerMcpServer !== "function") {
    pi.on("session_start", (_event, ctx) => {
      if (ctx.hasUI) {
        ctx.ui.notify(
          "project-mcp-json: Pi >=1.0 is required to register MCP servers. Please upgrade Pi.",
          "info",
        );
      }
    });
    return;
  }

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.isProjectTrusted()) {
      return;
    }

    const mcpJsonPath = path.join(ctx.cwd, ".mcp.json");
    if (!fs.existsSync(mcpJsonPath)) {
      return;
    }

    const agentDir = getAgentDir();

    if (!hasTrustRequiringProjectResources(ctx.cwd)) {
      const trustStore = new ProjectTrustStore(agentDir);
      const savedDecision = trustStore.get(ctx.cwd);

      if (savedDecision === false) {
        return;
      }

      if (savedDecision !== true) {
        let defaultTrust: DefaultProjectTrust;
        try {
          defaultTrust = SettingsManager.create(ctx.cwd, agentDir, {
            projectTrusted: false,
          }).getDefaultProjectTrust();
        } catch {
          defaultTrust = "ask";
        }

        if (defaultTrust === "never") {
          return;
        }

        if (defaultTrust === "ask") {
          if (ctx.hasUI) {
            ctx.ui.notify(
              "project-mcp-json: Found .mcp.json — run /trust to enable its MCP servers.",
              "info",
            );
          }
          return;
        }
      }
    }

    let rawContent: string;
    try {
      rawContent = fs.readFileSync(mcpJsonPath, "utf-8");
    } catch {
      // File disappeared or became unreadable between the existsSync and now.
      return;
    }

    const { servers, warnings } = parseMcpJson(rawContent, {});

    for (const warning of warnings) {
      if (ctx.hasUI) {
        ctx.ui.notify(warning, "warning");
      }
    }

    if (servers.length === 0) {
      return;
    }

    for (const server of servers) {
      try {
        pi.registerMcpServer(server.name, server.config);
      } catch {
        // Do not forward the raw error message; it may contain internal Pi
        // details.  Emit a generic warning that names the server only.
        if (ctx.hasUI) {
          ctx.ui.notify(
            `project-mcp-json: could not register server "${sanitizeStringForWarning(server.name)}" — ` +
              `name may already be in use by another extension or configuration.`,
            "warning",
          );
        }
      }
    }
  });
}
