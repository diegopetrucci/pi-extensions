import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_GH_TIMEOUT_MS,
  DEFAULT_GIT_TIMEOUT_MS,
  DEFAULT_REFRESH_INTERVAL_MS,
  GH_PR_VIEW_ARGS,
  GIT_STATUS_ARGS,
  GitFooterCache,
  formatGitFooterStatus,
  formatGitStatusFooterSegment,
  formatPullRequestFooterSegment,
  parseGitStatusPorcelainV2,
  parsePullRequestJson,
} from "./git-status.ts";

type ProjectGitContext = {
  cwd: string;
  isProjectTrusted?: () => boolean;
};

const STATUS_KEY = "git-footer";

function canRunProjectGit(ctx: ProjectGitContext): boolean {
  return typeof ctx.isProjectTrusted === "function" && ctx.isProjectTrusted();
}

export default function (pi: ExtensionAPI) {
  let cache: GitFooterCache | undefined;
  let updateStatus: (() => void) | undefined;

  function disposeCache(): void {
    cache?.dispose();
    cache = undefined;
  }

  function ensureCache(ctx: ProjectGitContext): void {
    if (!canRunProjectGit(ctx)) {
      disposeCache();
      updateStatus?.();
      return;
    }

    if (cache) return;
    cache = new GitFooterCache({
      cwd: () => ctx.cwd,
      canRun: () => canRunProjectGit(ctx),
      onChange: () => updateStatus?.(),
    });
  }

  pi.on("session_start", (_event, ctx) => {
    disposeCache();
    updateStatus = () => {
      const text = formatGitFooterStatus(
        cache?.getStatusSnapshot(),
        cache?.getPullRequestSnapshot(),
      );
      ctx.ui.setStatus(STATUS_KEY, text ? ctx.ui.theme.fg("dim", text) : undefined);
    };
    ensureCache(ctx);
    updateStatus();
  });

  pi.on("turn_end", (_event, ctx) => {
    ensureCache(ctx);
    void cache?.refresh();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    disposeCache();
    updateStatus = undefined;
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}

export const __testing = {
  GitFooterCache,
  DEFAULT_REFRESH_INTERVAL_MS,
  DEFAULT_GIT_TIMEOUT_MS,
  DEFAULT_GH_TIMEOUT_MS,
  GIT_STATUS_ARGS,
  GH_PR_VIEW_ARGS,
  parseGitStatusPorcelainV2,
  parsePullRequestJson,
  formatGitStatusFooterSegment,
  formatPullRequestFooterSegment,
  formatGitFooterStatus,
};
