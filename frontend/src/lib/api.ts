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

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  content?: string;
  reasoning_content?: string;
}

export interface StreamChatOptions {
  model: string;
  messages: ChatMessage[];
  gatewayKey: string;
  onChunk: (chunk: StreamChunk) => void;
  onError: (err: Error) => void;
  onFinish: () => void;
  signal?: AbortSignal;
}

export async function streamChatCompletion({
  model,
  messages,
  gatewayKey,
  onChunk,
  onError,
  onFinish,
  signal,
}: StreamChatOptions): Promise<void> {
  const root = getApiRoot();
  try {
    const response = await fetch(`${root}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gatewayKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
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
            const delta = parsed.choices?.[0]?.delta;
            if (delta) {
              const content = delta.content || '';
              const reasoning = delta.reasoning_content || delta.reasoning || '';
              if (content || reasoning) {
                onChunk({ content, reasoning_content: reasoning });
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

