export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: Record<string, any>;
  properties?: Record<string, any>;
  required?: string[];
}

export interface ToolParametersSchema {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolExecutionResult {
  output: string;
  error?: string;
  images?: string[]; // Base64 data URLs (e.g. for Matplotlib plots, charts)
  details?: Record<string, any>;
}

export interface AgentTool {
  name: string;
  displayName: string;
  description: string;
  category: 'code' | 'filesystem' | 'web' | 'system';
  parameters: ToolParametersSchema;
  execute: (args: Record<string, any>) => Promise<ToolExecutionResult>;
  isDestructive?: boolean;
}

export interface ToolCallExecution {
  callId: string;
  toolName: string;
  args: Record<string, any>;
  rawArgs: string;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: ToolExecutionResult;
  startedAt?: number;
  finishedAt?: number;
  stepIndex?: number;
}

export interface AgentStep {
  stepIndex: number;
  model: string;
  reasoning?: string;
  content?: string;
  toolCalls: ToolCallExecution[];
  status: 'thinking' | 'streaming' | 'executing_tools' | 'completed' | 'failed';
}

export interface AgentState {
  isRunning: boolean;
  currentStep: number;
  maxSteps: number;
  statusMessage: string;
  error?: string;
}

export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolParametersSchema;
  };
}
