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
  const hasSystemPrompt = conversationMessages.some((m) => m.role === 'system');
  if (!hasSystemPrompt) {
    conversationMessages.unshift({
      role: 'system',
      content:
        'You are an autonomous HKBU GenAI Assistant operating in Agent Mode. ' +
        'You have access to tools to execute Python code, inspect/write local files in the user workspace, and run calculations. ' +
        'Autonomous Delivery Principle: When generating files, reports, charts, or deliverables and tools like write_local_file or companion_write_file are available, take initiative: select a clean, sensible default filename (e.g. "resume.pdf", "analysis_report.md", "chart.png"), call write_local_file immediately, and report the saved path to the user. Do NOT ask the user technical questions like "what is your desired file path?". ' +
        'If a tool returned binary base64 data (like PDF bytes), pass it directly to write_local_file which will decode and save it as a binary file.',
    });
  }
  let currentIteration = 1;
  const openAITools = formatToOpenAITools(tools);

  try {
    while (currentIteration <= maxIterations) {
      if (signal?.aborted) break;

      onStepStart?.(currentIteration);

      let stepContent = '';
      let stepReasoning = '';
      let stepToolCalls: ToolCallExecution[] = [];

      let stepSuccess = false;
      let stepRetries = 0;
      const MAX_STEP_RETRIES = 1;

      while (!stepSuccess && stepRetries <= MAX_STEP_RETRIES) {
        if (signal?.aborted) break;

        let stepError: Error | null = null;
        stepContent = '';
        stepReasoning = '';
        stepToolCalls = [];

        await new Promise<void>((resolve) => {
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
                    stepIndex: currentIteration,
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
              stepError = err;
              resolve();
            },
            onFinish: () => {
              resolve();
            },
          });
        });

        if (signal?.aborted) break;

        if (!stepError) {
          stepSuccess = true;
          break;
        }

        const rawErrMsg = stepError.message || String(stepError);
        const isSizeOrLengthError = /413|payload too large|context length|context_length_exceeded|maximum context/i.test(rawErrMsg);
        const isWafOrPolicyError = /403|access denied|firewall|waf|security policy|forbidden/i.test(rawErrMsg);
        const isTransientError = /429|500|502|503|504|timeout|rate limit|temporarily unavailable/i.test(rawErrMsg);
        const isAuthError = /401|invalid.*key|unauthorized/i.test(rawErrMsg);

        // Allow-listed category for diagnostic notice - strictly avoids prompt injection from raw upstream errors
        let errorCategory = 'unknown_platform_error';
        if (isSizeOrLengthError) {
          errorCategory = 'payload_size_or_context_limit';
        } else if (isWafOrPolicyError) {
          errorCategory = 'security_policy_or_waf_rejection';
        } else if (isTransientError) {
          errorCategory = 'transient_service_unavailable';
        } else if (isAuthError) {
          errorCategory = 'authentication_failure';
        }

        // Restrict redaction to payload/WAF/context-length failures only (and only the implicated tool output)
        let sanitizedAnyTool = false;
        if (isSizeOrLengthError || isWafOrPolicyError) {
          for (let i = conversationMessages.length - 1; i >= 0; i--) {
            const msg = conversationMessages[i];
            if (msg.role === 'tool' && typeof msg.content === 'string' && msg.content.length > 200) {
              msg.content = `[Tool output desensitized: content (~${msg.content.length} chars) removed after ${errorCategory}. Details cleared to allow recovery.]`;
              sanitizedAnyTool = true;
              break; // Implicated latest tool output
            }
          }
        }

        // Determine if retry is possible and productive
        let canRetry = stepRetries < MAX_STEP_RETRIES && !isAuthError;
        // Avoid retrying unchanged oversized requests if no reducible content was found
        if (isSizeOrLengthError && !sanitizedAnyTool) {
          canRetry = false;
        }

        if (canRetry) {
          stepRetries++;
          onStepStart?.(currentIteration);

          // Use strictly allow-listed category rather than raw text to prevent prompt injection
          conversationMessages.push({
            role: 'system',
            content:
              `[Diagnostic context: The previous platform request failed with category "${errorCategory}". ` +
              (sanitizedAnyTool ? 'Oversized tool output has been desensitized to prevent further rejections. ' : '') +
              'Please adjust your reasoning, avoid repeating the action that triggered this error, and conclude your answer or explain the platform restriction to the user.]',
          });

          await new Promise((r) => setTimeout(r, 800));
          continue;
        }

        // Soft Landing: Gracefully conclude rather than hard crash
        const failureStep: AgentStep = {
          stepIndex: currentIteration,
          model,
          reasoning: stepReasoning || undefined,
          content:
            `⚠️ **Agent 执行遇到上游平台限制**\n\n` +
            `上游接口返回了错误：\n> **${rawErrMsg}**\n\n` +
            `**排查与建议**：\n` +
            `- 如果刚刚执行了本地代码或脚本读取（如 \`.mjs\`, \`.js\`, \`.sql\` 等），通常是因为文件中的代码特征或体积触发了校园网防火墙（WAF）拦截。\n` +
            `- 您可以指定读取更小的行数区间（例如使用 \`offset\` 和 \`max_lines\`），或直接告知 Agent 您想了解的具体逻辑。\n` +
            `- 当前会话仍然有效，您可以直接在下方输入框继续与我对话。`,
          toolCalls: stepToolCalls,
          status: 'completed',
        };

        conversationMessages.push({
          role: 'assistant',
          content: failureStep.content,
        });

        onStepFinish?.(currentIteration, failureStep);
        onFinish?.(conversationMessages);
        return conversationMessages;
      }

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

        const execResult = await dispatchToolExecution(tc.toolName, tc.args, tools, { gatewayKey });
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
