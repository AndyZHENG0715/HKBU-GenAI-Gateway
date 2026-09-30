import { ChatMessage, streamChatCompletion } from '../api';
import { AgentStep, AgentTool, ToolCallExecution } from './types';
import { DEFAULT_BROWSER_TOOLS, dispatchToolExecution, formatToOpenAITools } from './tools/registry';

export interface RunAgentLoopOptions {
  model: string;
  messages: ChatMessage[];
  tools?: AgentTool[];
  gatewayKey: string;
  maxIterations?: number;
  signal?: AbortSignal;
  onStepStart?: (stepIndex: number) => void;
  onStepChunk?: (
    stepIndex: number,
    chunk: {
      content?: string;
      reasoning_content?: string;
      toolCalls?: ToolCallExecution[];
    }
  ) => void;
  onToolStart?: (stepIndex: number, toolCall: ToolCallExecution) => void;
  onToolFinish?: (stepIndex: number, toolCall: ToolCallExecution) => void;
  onStepFinish?: (stepIndex: number, step: AgentStep) => void;
  onError?: (err: Error) => void;
  onFinish?: (finalMessages: ChatMessage[]) => void;
}

export async function runAgentLoop({
  model,
  messages,
  tools = DEFAULT_BROWSER_TOOLS,
  gatewayKey,
  maxIterations = 10,
  signal,
  onStepStart,
  onStepChunk,
  onToolStart,
  onToolFinish,
  onStepFinish,
  onError,
  onFinish,
}: RunAgentLoopOptions): Promise<ChatMessage[]> {
  const conversationMessages: ChatMessage[] = [...messages];
  let currentIteration = 1;
  const openAITools = formatToOpenAITools(tools);

  try {
    while (currentIteration <= maxIterations) {
      if (signal?.aborted) break;

      onStepStart?.(currentIteration);

      let stepContent = '';
      let stepReasoning = '';
      let stepToolCalls: ToolCallExecution[] = [];

      await new Promise<void>((resolve, reject) => {
        streamChatCompletion({
          model,
          messages: conversationMessages,
          tools: openAITools,
          gatewayKey,
          signal,
          onChunk: (chunk) => {
            if (chunk.content) {
              stepContent += chunk.content;
            }
            if (chunk.reasoning_content) {
              stepReasoning += chunk.reasoning_content;
            }
            if (chunk.tool_calls && chunk.tool_calls.length > 0) {
              stepToolCalls = chunk.tool_calls.map((tc) => {
                let parsedArgs: Record<string, any> = {};
                try {
                  parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
                } catch {
                  parsedArgs = { raw: tc.function.arguments };
                }
                return {
                  callId: tc.id,
                  toolName: tc.function.name,
                  args: parsedArgs,
                  rawArgs: tc.function.arguments,
                  status: 'pending',
                };
              });
            }

            onStepChunk?.(currentIteration, {
              content: stepContent,
              reasoning_content: stepReasoning,
              toolCalls: stepToolCalls,
            });
          },
          onError: (err) => {
            reject(err);
          },
          onFinish: () => {
            resolve();
          },
        });
      });

      if (signal?.aborted) break;

      const hasToolCalls = stepToolCalls.length > 0;

      // Create Step Record
      const completedStep: AgentStep = {
        stepIndex: currentIteration,
        model,
        reasoning: stepReasoning || undefined,
        content: stepContent || undefined,
        toolCalls: stepToolCalls,
        status: hasToolCalls ? 'executing_tools' : 'completed',
      };

      if (!hasToolCalls) {
        // No tools called; agent has provided the final response
        conversationMessages.push({
          role: 'assistant',
          content: stepContent,
        });
        onStepFinish?.(currentIteration, completedStep);
        break;
      }

      // Model requested tool calls
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: stepContent || null,
        tool_calls: stepToolCalls.map((tc) => ({
          id: tc.callId,
          type: 'function',
          function: {
            name: tc.toolName,
            arguments: tc.rawArgs,
          },
        })),
      };
      conversationMessages.push(assistantMessage);

      // Execute each tool locally
      for (const tc of stepToolCalls) {
        if (signal?.aborted) break;

        tc.status = 'running';
        tc.startedAt = Date.now();
        onToolStart?.(currentIteration, tc);

        const execResult = await dispatchToolExecution(tc.toolName, tc.args, tools);
        tc.result = execResult;
        tc.finishedAt = Date.now();
        tc.status = execResult.error ? 'error' : 'success';

        onToolFinish?.(currentIteration, tc);

        const toolResponseContent = execResult.error
          ? `Error executing ${tc.toolName}: ${execResult.error}`
          : execResult.output || '(success)';

        conversationMessages.push({
          role: 'tool',
          name: tc.toolName,
          tool_call_id: tc.callId,
          content: toolResponseContent,
        });
      }

      completedStep.status = 'completed';
      onStepFinish?.(currentIteration, completedStep);

      if (currentIteration >= maxIterations) {
        // Max limit reached; inject system reminder to conclude
        conversationMessages.push({
          role: 'system',
          content: 'You have reached the maximum allowed tool iterations. Please summarize your findings and provide the final answer to the user now.',
        });
      }

      currentIteration++;
    }

    onFinish?.(conversationMessages);
    return conversationMessages;
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
    return conversationMessages;
  }
}
