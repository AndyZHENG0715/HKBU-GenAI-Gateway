import { AgentTool, OpenAIToolDefinition, ToolExecutionResult } from '../types';
import { pythonTool } from './python';
import { listDirectoryTool, readFileTool, writeFileTool } from './browserFs';
import { webFetchTool } from './webFetch';
import { calculatorTool } from './calculator';

export const DEFAULT_BROWSER_TOOLS: AgentTool[] = [
  pythonTool,
  listDirectoryTool,
  readFileTool,
  writeFileTool,
  webFetchTool,
  calculatorTool,
];

export function formatToOpenAITools(tools: AgentTool[]): OpenAIToolDefinition[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export async function dispatchToolExecution(
  toolName: string,
  args: Record<string, any>,
  tools: AgentTool[] = DEFAULT_BROWSER_TOOLS
): Promise<ToolExecutionResult> {
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    return {
      output: '',
      error: `Unknown tool "${toolName}". Available tools: ${tools.map((t) => t.name).join(', ')}`,
    };
  }

  try {
    return await tool.execute(args);
  } catch (err: any) {
    return {
      output: '',
      error: `Tool "${toolName}" threw an unhandled exception: ${err.message || String(err)}`,
    };
  }
}
