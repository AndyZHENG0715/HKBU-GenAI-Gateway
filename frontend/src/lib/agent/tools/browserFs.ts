import { AgentTool, ToolExecutionResult } from '../types';

let currentDirHandle: any = null;
let currentDirName: string = '';

export function setWorkspaceDirectoryHandle(handle: any, name?: string): void {
  currentDirHandle = handle;
  currentDirName = name || handle?.name || 'Local Workspace';
}

export function getWorkspaceDirectoryHandle(): any {
  return currentDirHandle;
}

export function getWorkspaceDirectoryName(): string {
  return currentDirName;
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';
}

export async function promptSelectDirectory(): Promise<string> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API is not supported in this browser. Please use Chrome, Edge, or Opera.');
  }
  const handle = await (window as any).showDirectoryPicker({
    mode: 'readwrite',
  });
  setWorkspaceDirectoryHandle(handle, handle.name);
  return handle.name;
}

async function resolveSubHandle(
  root: any,
  relativePath: string,
  createParent = false
): Promise<{ parent: any; name: string } | null> {
  const parts = relativePath
    .replace(/^(\.\/|\/)/, '')
    .split('/')
    .filter(Boolean);
  if (parts.length === 0) return null;

  let current = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const dirName = parts[i];
    current = await current.getDirectoryHandle(dirName, { create: createParent });
  }
  return { parent: current, name: parts[parts.length - 1] };
}

export const listDirectoryTool: AgentTool = {
  name: 'list_directory',
  displayName: 'List Local Files',
  description:
    'List files and subdirectories inside the user selected local directory (via browser File System Access API).',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path within the directory (leave empty or "." for root).',
      },
    },
  },
  execute: async (args: Record<string, any>): Promise<ToolExecutionResult> => {
    if (!currentDirHandle) {
      return {
        output: '',
        error:
          'No local folder selected. Please click "Select Local Folder" in the Playground to choose a local workspace folder.',
      };
    }

    try {
      const relPath = String(args.path || '').trim();
      let targetHandle = currentDirHandle;

      if (relPath && relPath !== '.') {
        const parts = relPath.replace(/^(\.\/|\/)/, '').split('/').filter(Boolean);
        for (const part of parts) {
          targetHandle = await targetHandle.getDirectoryHandle(part, { create: false });
        }
      }

      const entries: string[] = [];
      for await (const [name, handle] of (targetHandle as any).entries()) {
        const isDir = handle.kind === 'directory';
        entries.push(isDir ? `📁 ${name}/` : `📄 ${name}`);
      }

      entries.sort();
      return {
        output: entries.length > 0 ? entries.join('\n') : '(Directory is empty)',
      };
    } catch (err: any) {
      return {
        output: '',
        error: `Failed to list directory: ${err.message || String(err)}`,
      };
    }
  },
};

export const readFileTool: AgentTool = {
  name: 'read_local_file',
  displayName: 'Read Local File',
  description:
    'Read the text content of a file from the user selected local directory.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path of the file to read (e.g. "src/index.ts", "package.json").',
      },
    },
    required: ['path'],
  },
  execute: async (args: Record<string, any>): Promise<ToolExecutionResult> => {
    if (!currentDirHandle) {
      return {
        output: '',
        error:
          'No local folder selected. Please click "Select Local Folder" in the Playground to grant access.',
      };
    }

    const relPath = String(args.path || '').trim();
    if (!relPath) return { output: '', error: 'Missing path argument.' };

    try {
      const resolved = await resolveSubHandle(currentDirHandle, relPath, false);
      if (!resolved) return { output: '', error: 'Invalid path.' };

      const fileHandle = await resolved.parent.getFileHandle(resolved.name, { create: false });
      const file = await fileHandle.getFile();
      const content = await file.text();

      return { output: content };
    } catch (err: any) {
      return {
        output: '',
        error: `Could not read file "${relPath}": ${err.message || String(err)}`,
      };
    }
  },
};

export const writeFileTool: AgentTool = {
  name: 'write_local_file',
  displayName: 'Write Local File',
  description:
    'Create or overwrite a file in the user selected local directory with new content.',
  category: 'filesystem',
  isDestructive: true,
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path of the file to write (e.g. "src/App.tsx", "README.md").',
      },
      content: {
        type: 'string',
        description: 'The full text content to write into the file.',
      },
    },
    required: ['path', 'content'],
  },
  execute: async (args: Record<string, any>): Promise<ToolExecutionResult> => {
    if (!currentDirHandle) {
      return {
        output: '',
        error:
          'No local folder selected. Please click "Select Local Folder" in the Playground to grant access.',
      };
    }

    const relPath = String(args.path || '').trim();
    const content = String(args.content ?? '');
    if (!relPath) return { output: '', error: 'Missing path argument.' };

    try {
      const resolved = await resolveSubHandle(currentDirHandle, relPath, true);
      if (!resolved) return { output: '', error: 'Invalid path.' };

      const fileHandle = await resolved.parent.getFileHandle(resolved.name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      return {
        output: `Successfully wrote ${content.length} characters to "${relPath}".`,
      };
    } catch (err: any) {
      return {
        output: '',
        error: `Failed to write file "${relPath}": ${err.message || String(err)}`,
      };
    }
  },
};
