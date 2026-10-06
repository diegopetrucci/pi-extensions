// Standalone /annotate-git-diff extension.
// Adapted from @ryan_nookpi/pi-extension-diff-review (MIT), itself inspired by
// badlogic/pi-diff-review. See ./README.md for attribution details.
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { readSystemClipboard, writeSystemClipboard } from "./clipboard.js";
import {
  getCommitFiles,
  getReviewWindowData,
  isWorkingTreeCommitSha,
  loadReviewFileContents,
} from "./git.js";
import { composeReviewPrompt } from "./prompt.js";
import { openQuietGlimpse, type QuietGlimpseWindow } from "./quiet-glimpse.js";
import { startReviewUiServer, type ReviewUiServer } from "./review-server.js";
import type {
  CommentSide,
  DiffReviewComment,
  ReviewCancelPayload,
  ReviewClipboardReadPayload,
  ReviewClipboardWritePayload,
  ReviewCommitKind,
  ReviewFile,
  ReviewFileContents,
  ReviewHostMessage,
  ReviewRequestCommitPayload,
  ReviewRequestFilePayload,
  ReviewRequestReviewDataPayload,
  ReviewScope,
  ReviewSubmitPayload,
  ReviewWindowMessage,
} from "./types.js";
import { createRepoChangeWatcher, type RepoChangeWatcher } from "./watch.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === "string";
}

function isCommentSide(value: unknown): value is CommentSide {
  return value === "original" || value === "modified" || value === "file";
}

function isReviewScope(value: unknown): value is ReviewScope {
  return value === "branch" || value === "commits" || value === "all";
}

function isReviewCommitKind(value: unknown): value is ReviewCommitKind | null | undefined {
  return value == null || value === "commit" || value === "working-tree";
}

function hasNullableInteger(value: Record<string, unknown>, key: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(value, key)) return false;
  const field = value[key];
  return field === null || (typeof field === "number" && Number.isInteger(field));
}

function isDiffReviewComment(value: unknown): value is DiffReviewComment {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.fileId) &&
    isReviewScope(value.scope) &&
    isNullableString(value.commitSha) &&
    isNullableString(value.commitShort) &&
    isReviewCommitKind(value.commitKind) &&
    isCommentSide(value.side) &&
    hasNullableInteger(value, "startLine") &&
    hasNullableInteger(value, "endLine") &&
    isString(value.body)
  );
}

function parseSubmitPayload(value: unknown): ReviewSubmitPayload | null {
  if (!isRecord(value) || value.type !== "submit") return null;
  if (
    !isString(value.overallComment) ||
    !Array.isArray(value.comments) ||
    !value.comments.every(isDiffReviewComment)
  ) {
    return null;
  }

  // Fail-safe: only a literal false means the user explicitly clicked Submit.
  // Missing, true, and malformed discriminator values remain editor-only drafts.
  return {
    type: "submit",
    overallComment: value.overallComment,
    comments: value.comments,
    draft: value.draft !== false,
  };
}

function isCancelPayload(value: unknown): value is ReviewCancelPayload {
  return isRecord(value) && value.type === "cancel";
}

function hasMessageType(
  value: unknown,
  type: ReviewWindowMessage["type"],
): value is Record<string, unknown> {
  return isRecord(value) && value.type === type;
}

function isRequestFilePayload(value: unknown): value is ReviewRequestFilePayload {
  return (
    hasMessageType(value, "request-file") &&
    isString(value.requestId) &&
    isString(value.fileId) &&
    isReviewScope(value.scope) &&
    isNullableString(value.commitSha)
  );
}

function isRequestCommitPayload(value: unknown): value is ReviewRequestCommitPayload {
  return (
    hasMessageType(value, "request-commit") && isString(value.requestId) && isString(value.sha)
  );
}

function isRequestReviewDataPayload(value: unknown): value is ReviewRequestReviewDataPayload {
  return hasMessageType(value, "request-review-data") && isString(value.requestId);
}

function isClipboardReadPayload(value: unknown): value is ReviewClipboardReadPayload {
  return hasMessageType(value, "clipboard-read") && isString(value.requestId);
}

function isClipboardWritePayload(value: unknown): value is ReviewClipboardWritePayload {
  return hasMessageType(value, "clipboard-write") && isString(value.text);
}

function escapeForInlineScript(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function hasReviewFeedback(payload: ReviewSubmitPayload): boolean {
  return (
    payload.overallComment.trim().length > 0 ||
    payload.comments.some((comment) => comment.body.trim().length > 0)
  );
}

function appendReviewPrompt(ctx: ExtensionCommandContext, prompt: string): void {
  const prefix = ctx.ui.getEditorText().trim().length > 0 ? "\n\n" : "";
  ctx.ui.pasteToEditor(`${prefix}${prompt}`);
}

export default function (pi: ExtensionAPI) {
  let activeWindow: QuietGlimpseWindow | null = null;
  let activeUiServer: ReviewUiServer | null = null;
  let activeWatcher: RepoChangeWatcher | null = null;
  let reviewOpening = false;
  let reviewAttempt = 0;
  const suppressedWindows = new WeakSet<QuietGlimpseWindow>();

  function stopActiveWatcher(): void {
    if (activeWatcher == null) return;
    activeWatcher.dispose();
    activeWatcher = null;
  }

  function closeActiveWindow(options: { suppressResults?: boolean } = {}): void {
    reviewAttempt += 1;
    const windowToClose = activeWindow;
    activeWindow = null;
    activeUiServer?.dispose();
    activeUiServer = null;
    stopActiveWatcher();
    if (windowToClose == null) return;
    if (options.suppressResults) {
      suppressedWindows.add(windowToClose);
    }
    try {
      windowToClose.close();
    } catch {
      // Window is already closing; ignore shutdown races.
    }
  }

  async function reviewRepository(ctx: ExtensionCommandContext): Promise<void> {
    if (ctx.mode !== "tui") {
      ctx.ui.notify("annotate-git-diff requires interactive mode.", "error");
      return;
    }

    if (reviewOpening || activeWindow != null || activeUiServer != null) {
      ctx.ui.notify("A review window is already open.", "warning");
      return;
    }

    reviewOpening = true;
    const attempt = ++reviewAttempt;
    try {
      let reviewData = await getReviewWindowData(pi, ctx.cwd);
      if (attempt !== reviewAttempt) return;
      const { repoRoot } = reviewData;
      if (reviewData.files.length === 0 && reviewData.commits.length === 0) {
        ctx.ui.notify("No reviewable files found.", "info");
        return;
      }

      const uiServer = await startReviewUiServer(reviewData);
      if (attempt !== reviewAttempt) {
        uiServer.dispose();
        return;
      }
      activeUiServer = uiServer;
      const window = await openQuietGlimpse(uiServer.html, {
        width: 1680,
        height: 1020,
        title: "annotate-git-diff",
      });
      if (attempt !== reviewAttempt) {
        suppressedWindows.add(window);
        window.close();
        uiServer.dispose();
        return;
      }
      activeWindow = window;
      if (uiServer.failure != null) throw uiServer.failure;
      if (window.failure != null) throw window.failure;
      if (window.closed) throw new Error("Glimpse closed while the review window was starting.");

      const historicalFiles = new Map<string, ReviewFile>();
      const rememberFiles = (files: ReviewFile[]): void => {
        for (const file of files) {
          // A submitted comment may outlive a refresh. Keep the first metadata
          // advertised for an id so refreshed authorization cannot rewrite its
          // historical path in the composed prompt.
          if (!historicalFiles.has(file.id)) historicalFiles.set(file.id, file);
        }
      };
      rememberFiles(reviewData.files);

      type ReviewReadSnapshot = {
        generation: number;
        data: typeof reviewData;
        branchFiles: Map<string, ReviewFile>;
        allFiles: Map<string, ReviewFile>;
        commitFiles: Map<string, Map<string, ReviewFile>>;
      };

      const createReviewReadSnapshot = (
        data: typeof reviewData,
        generation: number,
        previous: ReviewReadSnapshot | null,
      ): ReviewReadSnapshot => {
        const branchFiles = new Map<string, ReviewFile>();
        const allFiles = new Map<string, ReviewFile>();
        for (const file of data.files) {
          allFiles.set(file.id, file);
          if (file.inGitDiff) branchFiles.set(file.id, file);
        }

        const commitFiles = new Map<string, Map<string, ReviewFile>>();
        for (const commit of data.commits) {
          if (commit.kind !== "commit") continue;
          const retainedFiles = previous?.commitFiles.get(commit.sha);
          if (retainedFiles != null) commitFiles.set(commit.sha, retainedFiles);
        }

        return { generation, data, branchFiles, allFiles, commitFiles };
      };

      const commitFileCache = new Map<string, Promise<ReviewFile[]>>();
      const contentCache = new Map<string, Promise<ReviewFileContents>>();
      let currentSnapshot = createReviewReadSnapshot(reviewData, 0, null);
      const isLiveWindow = (): boolean =>
        activeWindow === window && attempt === reviewAttempt && !window.closed;

      const cacheCommitSha = (cacheKey: string): string | null => {
        if (!cacheKey.startsWith("commits:")) return null;
        const rest = cacheKey.slice("commits:".length);
        const separator = rest.indexOf(":");
        return separator < 0 ? null : rest.slice(0, separator);
      };

      const pruneCachesForReviewData = (nextReviewData: typeof reviewData): void => {
        const retainedImmutableCommits = new Set(
          nextReviewData.commits
            .filter((commit) => commit.kind === "commit")
            .map((commit) => commit.sha),
        );
        for (const sha of commitFileCache.keys()) {
          if (!retainedImmutableCommits.has(sha)) commitFileCache.delete(sha);
        }
        for (const cacheKey of contentCache.keys()) {
          const commitSha = cacheCommitSha(cacheKey);
          if (commitSha == null || !retainedImmutableCommits.has(commitSha)) {
            contentCache.delete(cacheKey);
          }
        }
      };

      const replaceReviewData = (nextReviewData: typeof reviewData): void => {
        pruneCachesForReviewData(nextReviewData);
        const previousSnapshot = currentSnapshot;
        reviewData = nextReviewData;
        rememberFiles(nextReviewData.files);
        currentSnapshot = createReviewReadSnapshot(
          nextReviewData,
          previousSnapshot.generation + 1,
          previousSnapshot,
        );
      };

      const sendWindowMessage = (message: ReviewHostMessage, guard?: () => boolean): void => {
        if (!isLiveWindow()) return;
        if (guard != null && !guard()) return;
        const payload = escapeForInlineScript(JSON.stringify(message));
        window.send(`window.__reviewReceive(${payload});`);
      };

      let watcherWarningShown = false;
      activeWatcher = createRepoChangeWatcher(
        repoRoot,
        () => {
          sendWindowMessage({ type: "working-tree-changed", changedAt: Date.now() });
        },
        {
          onError: (error) => {
            if (watcherWarningShown || activeWindow !== window) return;
            watcherWarningShown = true;
            ctx.ui.notify(`Review change watcher failed: ${error.message}`, "warning");
          },
        },
      );

      const loadCommitFiles = (sha: string): Promise<ReviewFile[]> => {
        const cached = commitFileCache.get(sha);
        if (cached != null) return cached;
        const pending = getCommitFiles(pi, repoRoot, sha);
        commitFileCache.set(sha, pending);
        pending
          .then((commitFiles) => {
            if (commitFileCache.get(sha) !== pending || !isLiveWindow()) return;
            if (!currentSnapshot.data.commits.some((commit) => commit.sha === sha)) return;
            rememberFiles(commitFiles);
            currentSnapshot.commitFiles.set(
              sha,
              new Map(commitFiles.map((file) => [file.id, file])),
            );
          })
          .catch(() => {
            // A rejected promise is retryable, but an old rejection must not
            // evict a replacement request for the same key.
            if (isLiveWindow() && commitFileCache.get(sha) === pending) commitFileCache.delete(sha);
          });
        return pending;
      };

      const loadContents = (
        file: ReviewFile,
        scope: ReviewRequestFilePayload["scope"],
        commitSha: string | null,
        snapshot: ReviewReadSnapshot,
      ): Promise<ReviewFileContents> => {
        const cacheKey = `${scope}:${commitSha ?? ""}:${file.id}`;
        const cached = contentCache.get(cacheKey);
        if (cached != null) return cached;

        const pending = loadReviewFileContents(
          pi,
          repoRoot,
          file,
          scope,
          commitSha,
          snapshot.data.branchMergeBaseSha,
        );
        contentCache.set(cacheKey, pending);
        pending.catch(() => {
          // Do not let an older rejection remove a newer retry's promise.
          if (isLiveWindow() && contentCache.get(cacheKey) === pending)
            contentCache.delete(cacheKey);
        });
        return pending;
      };

      const isAdvertisedCommitSha = (snapshot: ReviewReadSnapshot, sha: string): boolean =>
        snapshot.data.commits.some((commit) => commit.sha === sha);

      const isCurrentCommitRequest = (
        snapshot: ReviewReadSnapshot,
        sha: string,
        pending: Promise<ReviewFile[]> | null = null,
      ): boolean => {
        if (!isLiveWindow()) return false;
        const commit = currentSnapshot.data.commits.find((item) => item.sha === sha);
        if (commit == null) return false;
        if (currentSnapshot === snapshot) return true;
        return commit.kind === "commit" && pending != null && commitFileCache.get(sha) === pending;
      };

      const isCurrentFileRequest = (
        snapshot: ReviewReadSnapshot,
        scope: ReviewRequestFilePayload["scope"],
        commitSha: string | null,
        file: ReviewFile,
      ): boolean => {
        if (!isLiveWindow()) return false;
        if (scope === "commits") {
          if (commitSha == null || !isAdvertisedCommitSha(currentSnapshot, commitSha)) return false;
          if (isWorkingTreeCommitSha(commitSha) && currentSnapshot !== snapshot) return false;
          return currentSnapshot.commitFiles.get(commitSha)?.get(file.id) === file;
        }
        if (currentSnapshot !== snapshot) return false;
        const files = scope === "branch" ? currentSnapshot.branchFiles : currentSnapshot.allFiles;
        return files.get(file.id) === file;
      };

      const terminalMessagePromise = new Promise<ReviewSubmitPayload | ReviewCancelPayload | null>(
        (resolve, reject) => {
          let settled = false;
          let closeTimer: ReturnType<typeof setTimeout> | null = null;
          let removeUiServerErrorListener = (): void => {};

          const requestWindowClose = (): void => {
            try {
              window.close();
            } catch {
              // Ignore races when the native process has already exited.
            }
          };

          const cleanup = (): void => {
            if (closeTimer != null) {
              clearTimeout(closeTimer);
              closeTimer = null;
            }
            window.removeListener("message", onMessage);
            window.removeListener("closed", onClosed);
            window.removeListener("error", onError);
            removeUiServerErrorListener();
            removeUiServerErrorListener = (): void => {};
            if (activeWindow === window) {
              activeWindow = null;
              stopActiveWatcher();
            }
            if (activeUiServer === uiServer) activeUiServer = null;
            uiServer.dispose();
          };

          const settle = (value: ReviewSubmitPayload | ReviewCancelPayload | null): void => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(value);
          };

          const handleRequestFile = async (message: ReviewRequestFilePayload): Promise<void> => {
            const snapshot = currentSnapshot;
            const currentGuard = (): boolean => isLiveWindow() && currentSnapshot === snapshot;
            const commitSha = message.commitSha ?? null;
            if (message.scope === "commits") {
              if (commitSha == null) {
                sendWindowMessage(
                  {
                    type: "file-error",
                    requestId: message.requestId,
                    fileId: message.fileId,
                    scope: message.scope,
                    commitSha: null,
                    message: "A commit SHA is required for commit-scoped file requests.",
                  },
                  currentGuard,
                );
                return;
              }
              if (!isAdvertisedCommitSha(snapshot, commitSha)) {
                sendWindowMessage(
                  {
                    type: "file-error",
                    requestId: message.requestId,
                    fileId: message.fileId,
                    scope: message.scope,
                    commitSha,
                    message: "Unknown commit requested.",
                  },
                  currentGuard,
                );
                return;
              }
            } else if (commitSha != null) {
              sendWindowMessage(
                {
                  type: "file-error",
                  requestId: message.requestId,
                  fileId: message.fileId,
                  scope: message.scope,
                  commitSha,
                  message: "A commit SHA is only valid for commit-scoped file requests.",
                },
                currentGuard,
              );
              return;
            }

            const fileMap =
              message.scope === "branch"
                ? snapshot.branchFiles
                : message.scope === "all"
                  ? snapshot.allFiles
                  : (snapshot.commitFiles.get(commitSha as string) ??
                    new Map<string, ReviewFile>());
            const file = fileMap.get(message.fileId);
            if (file == null) {
              sendWindowMessage(
                {
                  type: "file-error",
                  requestId: message.requestId,
                  fileId: message.fileId,
                  scope: message.scope,
                  commitSha,
                  message: "Unknown file requested.",
                },
                currentGuard,
              );
              return;
            }

            try {
              const contents = await loadContents(file, message.scope, commitSha, snapshot);
              if (!isCurrentFileRequest(snapshot, message.scope, commitSha, file)) return;
              sendWindowMessage(
                {
                  type: "file-data",
                  requestId: message.requestId,
                  fileId: message.fileId,
                  scope: message.scope,
                  commitSha,
                  originalContent: contents.originalContent,
                  modifiedContent: contents.modifiedContent,
                  kind: contents.kind,
                  mimeType: contents.mimeType,
                  originalExists: contents.originalExists,
                  modifiedExists: contents.modifiedExists,
                  originalPreviewUrl: contents.originalPreviewUrl,
                  modifiedPreviewUrl: contents.modifiedPreviewUrl,
                },
                () => isCurrentFileRequest(snapshot, message.scope, commitSha, file),
              );
            } catch (error) {
              if (!isCurrentFileRequest(snapshot, message.scope, commitSha, file)) return;
              const messageText = error instanceof Error ? error.message : String(error);
              sendWindowMessage(
                {
                  type: "file-error",
                  requestId: message.requestId,
                  fileId: message.fileId,
                  scope: message.scope,
                  commitSha,
                  message: messageText,
                },
                () => isCurrentFileRequest(snapshot, message.scope, commitSha, file),
              );
            }
          };

          const handleRequestCommit = async (
            message: ReviewRequestCommitPayload,
          ): Promise<void> => {
            const snapshot = currentSnapshot;
            const currentGuard = (): boolean => isLiveWindow() && currentSnapshot === snapshot;
            if (!isAdvertisedCommitSha(snapshot, message.sha)) {
              sendWindowMessage(
                {
                  type: "commit-error",
                  requestId: message.requestId,
                  sha: message.sha,
                  message: "Unknown commit requested.",
                },
                currentGuard,
              );
              return;
            }

            const pending = loadCommitFiles(message.sha);
            try {
              const commitFiles = await pending;
              if (!isCurrentCommitRequest(snapshot, message.sha, pending)) return;
              if (currentSnapshot.commitFiles.get(message.sha) == null) return;
              sendWindowMessage(
                {
                  type: "commit-data",
                  requestId: message.requestId,
                  sha: message.sha,
                  files: commitFiles,
                },
                () =>
                  isCurrentCommitRequest(snapshot, message.sha, pending) &&
                  currentSnapshot.commitFiles.get(message.sha) != null,
              );
            } catch (error) {
              if (!isCurrentCommitRequest(snapshot, message.sha, pending)) return;
              const messageText = error instanceof Error ? error.message : String(error);
              sendWindowMessage({
                type: "commit-error",
                requestId: message.requestId,
                sha: message.sha,
                message: messageText,
              });
            }
          };

          let refreshRequestSequence = 0;
          let newestRefreshRequest = 0;
          const handleRequestReviewData = async (
            message: ReviewRequestReviewDataPayload,
          ): Promise<void> => {
            const refreshRequest = ++refreshRequestSequence;
            newestRefreshRequest = refreshRequest;
            try {
              const nextReviewData = await getReviewWindowData(pi, repoRoot);
              if (!isLiveWindow() || refreshRequest !== newestRefreshRequest) return;
              replaceReviewData(nextReviewData);
              sendWindowMessage(
                {
                  type: "review-data",
                  requestId: message.requestId,
                  files: nextReviewData.files,
                  commits: nextReviewData.commits,
                  branchBaseRef: nextReviewData.branchBaseRef,
                  branchMergeBaseSha: nextReviewData.branchMergeBaseSha,
                  repositoryHasHead: nextReviewData.repositoryHasHead,
                },
                () => isLiveWindow() && refreshRequest === newestRefreshRequest,
              );
            } catch (error) {
              if (!isLiveWindow() || refreshRequest !== newestRefreshRequest) return;
              const messageText = error instanceof Error ? error.message : String(error);
              sendWindowMessage({
                type: "review-data-error",
                requestId: message.requestId,
                message: messageText,
              });
            }
          };

          const handleClipboardRead = (message: ReviewClipboardReadPayload): void => {
            try {
              sendWindowMessage({
                type: "clipboard-data",
                requestId: message.requestId,
                text: readSystemClipboard(),
              });
            } catch (error) {
              const messageText = error instanceof Error ? error.message : String(error);
              sendWindowMessage({
                type: "clipboard-data",
                requestId: message.requestId,
                text: "",
                message: messageText,
              });
            }
          };

          const handleClipboardWrite = (message: ReviewClipboardWritePayload): void => {
            try {
              writeSystemClipboard(message.text);
            } catch (error) {
              const messageText = error instanceof Error ? error.message : String(error);
              ctx.ui.notify(`Failed to copy from review window: ${messageText}`, "warning");
            }
          };

          const onMessage = (message: unknown): void => {
            // Terminal messages remain recoverable during the native close grace
            // period; all other work must stop once the window is closed or retired.
            const submit = parseSubmitPayload(message);
            if (submit != null) {
              settle(submit);
              requestWindowClose();
              return;
            }
            if (isCancelPayload(message)) {
              settle(message);
              requestWindowClose();
              return;
            }
            if (!isLiveWindow()) return;
            if (isRequestFilePayload(message)) {
              void handleRequestFile(message);
              return;
            }
            if (isRequestCommitPayload(message)) {
              void handleRequestCommit(message);
              return;
            }
            if (isRequestReviewDataPayload(message)) {
              void handleRequestReviewData(message);
              return;
            }
            if (isClipboardReadPayload(message)) {
              handleClipboardRead(message);
              return;
            }
            if (isClipboardWritePayload(message)) {
              handleClipboardWrite(message);
            }
          };

          const onClosed = (): void => {
            if (settled || closeTimer != null) return;
            closeTimer = setTimeout(() => {
              closeTimer = null;
              settle(null);
            }, 250);
          };

          const onError = (error: Error): void => {
            if (settled) return;
            settled = true;
            requestWindowClose();
            cleanup();
            reject(error);
          };

          window.on("message", onMessage);
          window.on("closed", onClosed);
          window.on("error", onError);
          removeUiServerErrorListener = uiServer.onError(onError);
          if (uiServer.failure != null) onError(uiServer.failure);
          else if (window.failure != null) onError(window.failure);
          else if (window.closed) onClosed();
        },
      );

      void (async () => {
        try {
          const message = await terminalMessagePromise;
          if (suppressedWindows.has(window) || attempt !== reviewAttempt) return;
          if (message == null) return;
          if (message.type === "cancel") {
            ctx.ui.notify("Review cancelled.", "info");
            return;
          }
          if (!hasReviewFeedback(message)) return;

          const prompt = composeReviewPrompt([...historicalFiles.values()], message);
          if (message.draft === true) {
            appendReviewPrompt(ctx, prompt);
            ctx.ui.notify("Appended review feedback to the editor.", "info");
          } else {
            pi.sendUserMessage(prompt, { deliverAs: "followUp" });
            ctx.ui.notify("Review feedback sent to the agent.", "info");
          }
        } catch (error) {
          if (suppressedWindows.has(window) || attempt !== reviewAttempt) return;
          const message = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`Review failed: ${message}`, "error");
        }
      })();

      ctx.ui.notify("Opened native review window.", "info");
    } catch (error) {
      if (attempt !== reviewAttempt) return;
      closeActiveWindow({ suppressResults: true });
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Review failed: ${message}`, "error");
    } finally {
      reviewOpening = false;
    }
  }

  pi.registerCommand("annotate-git-diff", {
    description: "Open a native review window with branch, per-commit, and all-files scopes",
    handler: async (_args, ctx) => {
      await reviewRepository(ctx);
    },
  });

  pi.on("session_shutdown", async () => {
    closeActiveWindow({ suppressResults: true });
  });
}
