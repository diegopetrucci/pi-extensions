/**
 * project-mcp-json: reads a Claude Code-style .mcp.json from the project
 * working directory and registers the configured MCP servers with pi.
 *
 * Session lifecycle:
 *  1. Bail out when the project is not trusted (ctx.isProjectTrusted()).
 *  2. Bail out when <cwd>/.mcp.json does not exist — complete no-op, no notice.
 *  3. Determine whether .mcp.json should be loaded using Pi-aligned trust
 *     semantics (mirrors resolveProjectTrusted for this extra resource):
 *     a. If hasTrustRequiringProjectResources(ctx.cwd) — the project already
 *        has real Pi resources and the user approved them → load.
 *     b. Else check the nearest-ancestor saved decision in trust.json:
 *        true → load, false → skip.
 *     c. Else read the global defaultProjectTrust setting via SettingsManager:
 *        "always" → load,
 *        "never"  → skip,
 *        "ask" (default) → skip + notify via ctx.ui.notify when UI is available.
 *  4. Read <cwd>/.mcp.json, parse with config.ts, and call pi.registerMcpServer.
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

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
  /** Names of servers this extension has successfully registered this session. */
  const ownRegistrations = new Set<string>();

  pi.on("session_start", (_event, ctx) => {
    // 1. Project must be trusted.
    if (!ctx.isProjectTrusted()) {
      return;
    }

    // 2. Bail out immediately when .mcp.json does not exist — no trust branches
    //    are evaluated and no notification is emitted.
    const mcpJsonPath = path.join(ctx.cwd, ".mcp.json");
    if (!fs.existsSync(mcpJsonPath)) {
      return;
    }

    // 3. Determine trust disposition for .mcp.json using Pi-aligned semantics.
    const agentDir = getAgentDir();

    // 3a. If the project has trust-requiring Pi resources (e.g. .pi/mcp.json,
    //     .pi/extensions/, .agents/skills/), Pi already evaluated project trust
    //     for genuine reasons.  Honour that decision and load.
    if (!hasTrustRequiringProjectResources(ctx.cwd)) {
      // 3b. Check the nearest-ancestor saved decision in trust.json.
      const trustStore = new ProjectTrustStore(agentDir);
      const savedDecision = trustStore.get(ctx.cwd);

      if (savedDecision === false) {
        // Explicitly saved as untrusted — skip without notification.
        return;
      }

      if (savedDecision !== true) {
        // No saved decision — fall back to the defaultProjectTrust setting.
        let defaultTrust: DefaultProjectTrust;
        try {
          defaultTrust = SettingsManager.create(ctx.cwd, agentDir, {
            projectTrusted: false,
          }).getDefaultProjectTrust();
        } catch {
          // Defensive fallback to Pi's built-in default.
          defaultTrust = "ask";
        }

        if (defaultTrust === "never") {
          return;
        }

        if (defaultTrust === "ask") {
          // Skip and hint about /trust when interactive UI is available.
          if (ctx.hasUI) {
            ctx.ui.notify(
              "project-mcp-json: Found .mcp.json — run /trust to enable its MCP servers.",
              "info"
            );
          }
          return;
        }

        // defaultTrust === "always" → fall through to load.
      }
      // savedDecision === true → fall through to load.
    }
    // hasTrustRequiringProjectResources === true → fall through to load.

    // 4. Read .mcp.json (path was already checked for existence above).
    let rawContent: string;
    try {
      rawContent = fs.readFileSync(mcpJsonPath, "utf-8");
    } catch {
      // File disappeared or became unreadable between the existsSync and now.
      return;
    }

    // 5. Parse with config.ts to get server configs and warnings.
    //    Warnings from config.ts are already prefixed with "project-mcp-json:"
    //    and never contain secret values; forward them as-is.
    const { servers, warnings } = parseMcpJson(rawContent, {});

    for (const warning of warnings) {
      ctx.ui.notify(warning, "warning");
    }

    if (servers.length === 0) {
      return;
    }

    // 6. Register servers.
    for (const server of servers) {
      try {
        pi.registerMcpServer(server.name, server.config);
        ownRegistrations.add(server.name);
      } catch {
        // Do not forward the raw error message; it may contain internal Pi
        // details.  Emit a generic warning that names the server only.
        ctx.ui.notify(
          `project-mcp-json: could not register server "${sanitizeStringForWarning(server.name)}" — ` +
            `name may already be in use by another extension or configuration.`,
          "warning"
        );
      }
    }
  });
}
