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
    'Read the text content of a file from the user selected local directory. Supports optional line offset and line limit for safe inspection of large code files.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path of the file to read (e.g. "src/index.mjs", "package.json").',
      },
      max_lines: {
        type: 'integer',
        minimum: 1,
        maximum: 1000,
        description: 'Maximum lines to read (default 300, max 1000). Use to avoid firewall payload limits on large files.',
      },
      offset: {
        type: 'integer',
        minimum: 1,
        description: '1-based line offset to start reading from (default 1).',
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

    const isBinaryExt = /\.(png|jpe?g|gif|webp|zip|tar|gz|wasm|bin|ico|db|sqlite|pyc|pdf|exe|dll|so)$/i.test(relPath);
    if (isBinaryExt) {
      return {
        output: '',
        error: `Cannot read binary file "${relPath}" as text. Please select a text or code file.`,
      };
    }

    try {
      const resolved = await resolveSubHandle(currentDirHandle, relPath, false);
      if (!resolved) return { output: '', error: 'Invalid path.' };

      const fileHandle = await resolved.parent.getFileHandle(resolved.name, { create: false });
      const file = await fileHandle.getFile();

      // Guard: do not read oversized single files (> 5MB)
      if (file.size > 5 * 1024 * 1024) {
        return {
          output: '',
          error: `File "${relPath}" is too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum allowed is 5MB.`,
        };
      }

      const raw = await file.text();
      const cleanText = raw.replace(/\0/g, '');
      const allLines = cleanText.split(/\r?\n/);
      const totalLines = allLines.length;

      let offset = Math.floor(Number(args.offset));
      if (!Number.isFinite(offset) || offset < 1) offset = 1;

      let maxLines = Math.floor(Number(args.max_lines));
      if (!Number.isFinite(maxLines) || maxLines < 1) maxLines = 300;
      maxLines = Math.min(maxLines, 1000);

      if (offset > totalLines) {
        return {
          output: `(File "${relPath}" has ${totalLines} lines; offset ${offset} is past end of file)`,
        };
      }

      const encoder = new TextEncoder();
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const MAX_TOTAL_BYTES = 25000;
      const NOTICE_BUDGET_BYTES = 200;
      const CONTENT_BUDGET_BYTES = MAX_TOTAL_BYTES - NOTICE_BUDGET_BYTES;

      const endLineIdx = Math.min(totalLines, offset - 1 + maxLines);
      const deliveredLines: string[] = [];
      let currentBytes = 0;
      let linesIncluded = 0;
      let firstLineTruncatedInBytes = false;

      for (let i = offset - 1; i < endLineIdx; i++) {
        const line = allLines[i];
        const lineBytes = encoder.encode((linesIncluded > 0 ? '\n' : '') + line).length;

        if (currentBytes + lineBytes > CONTENT_BUDGET_BYTES) {
          if (linesIncluded === 0) {
            // Edge case: single line exceeds the entire byte budget
            const rawLineBytes = encoder.encode(line);
            const sliced = decoder.decode(rawLineBytes.subarray(0, CONTENT_BUDGET_BYTES));
            deliveredLines.push(sliced);
            linesIncluded = 1;
            firstLineTruncatedInBytes = true;
          }
          break;
        }

        deliveredLines.push(line);
        currentBytes += lineBytes;
        linesIncluded++;
      }

      const nextOffset = offset + linesIncluded;
      let output = deliveredLines.join('\n');

      if (firstLineTruncatedInBytes) {
        output += `\n\n[... Truncated: line ${offset} exceeds the 25KB UTF-8 buffer limit ...]`;
      } else if (nextOffset <= totalLines) {
        output += `\n\n[... Truncated: showing lines ${offset}-${nextOffset - 1} of ${totalLines}. Use read_local_file with offset=${nextOffset} to read next lines ...]`;
      }

      return { output };
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

      const clean = content.trim();
      const isBinaryExt = /\.(pdf|png|jpe?g|gif|webp|zip|tar|gz|wasm|bin|ico)$/i.test(relPath);
      let isBase64 = false;
      let rawB64 = clean;

      if (clean.startsWith('data:') && clean.includes(';base64,')) {
        rawB64 = clean.split(';base64,')[1];
        isBase64 = true;
      } else if (clean.startsWith('JVBERi0') || (isBinaryExt && clean.length > 20 && !clean.slice(0, 80).includes(' '))) {
        isBase64 = true;
      }

      if (isBase64) {
        try {
          const binaryStr = atob(rawB64.replace(/\s+/g, ''));
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          await writable.write(bytes);
          await writable.close();
          return {
            output: `Successfully saved binary file "${relPath}" (${len} bytes written).`,
          };
        } catch {
          // Fall back to text write if atob fails
        }
      }

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
