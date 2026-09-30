import { AgentTool, ToolExecutionResult } from '../types';

let companionPort = 9001;
let isCompanionConnected = false;
let companionCwd = '';

export function getCompanionState(): {
  connected: boolean;
  port: number;
  cwd: string;
} {
  return {
    connected: isCompanionConnected,
    port: companionPort,
    cwd: companionCwd,
  };
}

export async function probeCompanion(
  port = 9001
): Promise<{ connected: boolean; cwd?: string; version?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data.service === 'hkbu-genai-companion') {
        isCompanionConnected = true;
        companionPort = port;
        companionCwd = data.cwd || '';
        return { connected: true, cwd: data.cwd, version: data.version };
      }
    }
    isCompanionConnected = false;
    return { connected: false };
  } catch {
    isCompanionConnected = false;
    return { connected: false };
  }
}

export const companionBashTool: AgentTool = {
  name: 'companion_bash_execute',
  displayName: 'Local Terminal (Bash)',
  description:
    'Execute a real bash shell command on the user local machine via the local HKBU companion node (e.g. "git status", "npm test", "pytest"). Runs 100% on the user machine with zero server load.',
  category: 'system',
  isDestructive: true,
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command string to execute on the local host machine.',
      },
      cwd: {
        type: 'string',
        description: 'Optional working directory path relative to project root.',
      },
    },
    required: ['command'],
  },
  execute: async (args: Record<string, any>): Promise<ToolExecutionResult> => {
    const command = String(args.command || '').trim();
    if (!command) return { output: '', error: 'Missing command argument.' };

    try {
      const res = await fetch(`http://127.0.0.1:${companionPort}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          cwd: args.cwd || undefined,
          timeout: 45,
        }),
      });

      if (!res.ok) {
        return { output: '', error: `Companion returned HTTP ${res.status}` };
      }

      const data = await res.json();
      const exitCode = data.exit_code ?? 0;
      let outputText = '';
      if (data.stdout) outputText += data.stdout;
      if (data.stderr) {
        outputText += (outputText ? '\n[Stderr]:\n' : '[Stderr]:\n') + data.stderr;
      }
      if (!outputText.trim()) {
        outputText = `(Command finished with exit code ${exitCode})`;
      }

      return {
        output: outputText,
        error: exitCode !== 0 ? `Exit Code ${exitCode}` : undefined,
      };
    } catch (err: any) {
      return {
        output: '',
        error: `Could not connect to local companion on 127.0.0.1:${companionPort}. Run "python companion/hkbu_genai_companion.py" on your machine.`,
      };
    }
  },
};

export const companionReadFileTool: AgentTool = {
  name: 'companion_read_file',
  displayName: 'Read Host File',
  description:
    'Read file content from the local machine workspace via the companion node.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative or absolute path of the file to read on local host.',
      },
    },
    required: ['path'],
  },
  execute: async (args: Record<string, any>): Promise<ToolExecutionResult> => {
    const filePath = String(args.path || '').trim();
    if (!filePath) return { output: '', error: 'Missing path argument.' };

    try {
      const res = await fetch(`http://127.0.0.1:${companionPort}/api/read_file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { output: '', error: data.error || `HTTP ${res.status}` };
      }
      return { output: data.content || '' };
    } catch (err: any) {
      return {
        output: '',
        error: `Failed to connect to local companion: ${err.message || String(err)}`,
      };
    }
  },
};

export const companionWriteFileTool: AgentTool = {
  name: 'companion_write_file',
  displayName: 'Write Host File',
  description:
    'Write text content to a file on the local machine workspace via the companion node.',
  category: 'filesystem',
  isDestructive: true,
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative or absolute path of the file to write on local host.',
      },
      content: {
        type: 'string',
        description: 'Content to write into the file.',
      },
    },
    required: ['path', 'content'],
  },
  execute: async (args: Record<string, any>): Promise<ToolExecutionResult> => {
    const filePath = String(args.path || '').trim();
    const content = String(args.content ?? '');
    if (!filePath) return { output: '', error: 'Missing path argument.' };

    try {
      const res = await fetch(`http://127.0.0.1:${companionPort}/api/write_file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { output: '', error: data.error || `HTTP ${res.status}` };
      }
      return { output: `Successfully wrote ${content.length} characters to "${filePath}".` };
    } catch (err: any) {
      return {
        output: '',
        error: `Failed to connect to local companion: ${err.message || String(err)}`,
      };
    }
  },
};

export const COMPANION_TOOLS: AgentTool[] = [
  companionBashTool,
  companionReadFileTool,
  companionWriteFileTool,
];
