/**
 * Dynamically resolves the Base URL for the OpenAI compatible endpoint.
 * Never hardcodes localhost so that deployments like byok.aitutor.ink work seamlessly.
 */
export const getBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    return 'https://byok.aitutor.ink/v1';
  }
  // Remove trailing slashes and append /v1
  const origin = window.location.origin;
  // If user is running via file:// or custom, fallback to default domain
  if (!origin || origin === 'null' || origin.startsWith('file:')) {
    return 'https://byok.aitutor.ink/v1';
  }
  return `${origin}/v1`;
};

export const getApiRoot = (): string => {
  if (typeof window === 'undefined') {
    return 'https://byok.aitutor.ink';
  }
  const origin = window.location.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) {
    return 'https://byok.aitutor.ink';
  }
  return origin;
};

export interface CredentialResponse {
  id: number;
  api_key: string;
  base_url: string;
  message: string;
}

export async function createCredential(hkbuApiKey: string): Promise<CredentialResponse> {
  const root = getApiRoot();
  const response = await fetch(`${root}/api/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ hkbu_api_key: hkbuApiKey.trim() }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = data.detail || data.error?.message || 'Failed to validate HKBU key. Please ensure your key is valid and has active quota.';
    throw new Error(errorMsg);
  }

  return data as CredentialResponse;
}

export async function revokeCredential(gatewayKey: string): Promise<boolean> {
  const root = getApiRoot();
  const response = await fetch(`${root}/api/credentials/current`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${gatewayKey.trim()}`,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = data.detail || data.error?.message || 'Failed to revoke key.';
    throw new Error(errorMsg);
  }

  return Boolean(data.revoked);
}

export async function checkHealth(): Promise<boolean> {
  try {
    const root = getApiRoot();
    const res = await fetch(`${root}/healthz`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

export interface ToolCallItem {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallItem[];
}

export interface StreamChunk {
  content?: string;
  reasoning_content?: string;
  tool_calls?: ToolCallItem[];
  finish_reason?: string | null;
}

export interface StreamChatOptions {
  model: string;
  messages: ChatMessage[];
  tools?: any[];
  tool_choice?: any;
  gatewayKey: string;
  onChunk: (chunk: StreamChunk) => void;
  onError: (err: Error) => void;
  onFinish: () => void;
  signal?: AbortSignal;
}

export async function streamChatCompletion({
  model,
  messages,
  tools,
  tool_choice,
  gatewayKey,
  onChunk,
  onError,
  onFinish,
  signal,
}: StreamChatOptions): Promise<void> {
  const root = getApiRoot();
  try {
    const requestBody: Record<string, any> = {
      model,
      messages,
      stream: true,
    };
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      if (tool_choice) {
        requestBody.tool_choice = tool_choice;
      }
    }

    const response = await fetch(`${root}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gatewayKey.trim()}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      const msg = errorJson.error?.message || errorJson.detail || `Server error (${response.status})`;
      throw new Error(msg);
    }

    if (!response.body) {
      throw new Error('Response body is empty');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    const accumulatedToolCalls: ToolCallItem[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') {
          onFinish();
          return;
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.error) {
              const errMsg = parsed.error.message || 'Stream error occurred';
              onError(new Error(errMsg));
              return;
            }
            const choice = parsed.choices?.[0];
            const delta = choice?.delta;
            const finishReason = choice?.finish_reason;
            if (delta) {
              const content = delta.content || '';
              const reasoning = delta.reasoning_content || delta.reasoning || '';

              if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!accumulatedToolCalls[idx]) {
                    accumulatedToolCalls[idx] = {
                      id: tc.id || `call_${Date.now()}_${idx}`,
                      type: 'function',
                      function: {
                        name: tc.function?.name || '',
                        arguments: tc.function?.arguments || '',
                      },
                    };
                  } else {
                    if (tc.id) accumulatedToolCalls[idx].id = tc.id;
                    if (tc.function?.name) accumulatedToolCalls[idx].function.name += tc.function.name;
                    if (tc.function?.arguments) accumulatedToolCalls[idx].function.arguments += tc.function.arguments;
                  }
                }
              }

              if (content || reasoning || delta.tool_calls || finishReason) {
                onChunk({
                  content,
                  reasoning_content: reasoning,
                  tool_calls: accumulatedToolCalls.length > 0 ? [...accumulatedToolCalls] : undefined,
                  finish_reason: finishReason,
                });
              }
            }
          } catch (e: any) {
            if (e.message && !e.message.startsWith('Unexpected') && !e.message.includes('JSON')) {
              onError(e);
              return;
            }
          }
        }
      }
    }

    onFinish();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      onFinish();
      return;
    }
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

