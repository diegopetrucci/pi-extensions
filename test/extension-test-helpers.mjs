import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

export async function loadExtension(relativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, relativePath)).href;
  const extensionModule = await import(moduleUrl);
  return extensionModule.default;
}

export function createExtensionHarness({ execImpl, getSettings } = {}) {
  const handlers = new Map();
  const tools = new Map();
  const commands = new Map();
  const toolRendererResolvers = [];
  const execCalls = [];
  const sentUserMessages = [];
  const pi = {
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    registerToolRenderer(resolver) {
      toolRendererResolvers.push(resolver);
    },
    sendUserMessage(message, options) {
      sentUserMessages.push({ message, options });
    },
    async exec(...args) {
      execCalls.push(args);
      if (!execImpl) {
        throw new Error("pi.exec should not have been called");
      }
      return execImpl(...args);
    },
  };
  if (getSettings) pi.getSettings = getSettings;

  return {
    pi,
    handlers,
    tools,
    commands,
    toolRendererResolvers,
    execCalls,
    sentUserMessages,
  };
}
