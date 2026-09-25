import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');

export async function loadExtension(relativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, relativePath)).href;
  const extensionModule = await import(moduleUrl);
  return extensionModule.default;
}

function createEventBus() {
  const listeners = new Map();

  return {
    on(channel, handler) {
      const set = listeners.get(channel) ?? new Set();
      set.add(handler);
      listeners.set(channel, set);
      return () => {
        listeners.get(channel)?.delete(handler);
      };
    },
    emit(channel, data) {
      for (const handler of listeners.get(channel) ?? []) {
        handler(data);
      }
    },
    listeners,
  };
}

export function createExtensionHarness({ execImpl } = {}) {
  const handlers = new Map();
  const tools = new Map();
  const commands = new Map();
  const execCalls = [];
  const events = createEventBus();

  return {
    pi: {
      on(eventName, handler) {
        handlers.set(eventName, handler);
      },
      registerTool(definition) {
        tools.set(definition.name, definition);
      },
      registerCommand(name, definition) {
        commands.set(name, definition);
      },
      async exec(...args) {
        execCalls.push(args);
        if (!execImpl) {
          throw new Error('pi.exec should not have been called');
        }
        return execImpl(...args);
      },
      events,
    },
    handlers,
    tools,
    commands,
    execCalls,
    events,
  };
}
