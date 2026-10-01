import { AgentTool, ToolExecutionResult } from '../types';
import { getApiRoot } from '../../api';

export const webFetchTool: AgentTool = {
  name: 'web_fetch',
  displayName: 'Fetch Web Page',
  description:
    'Fetch and extract text content or markdown from a public URL or documentation page.',
  category: 'web',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The HTTP or HTTPS URL to fetch content from.',
      },
    },
    required: ['url'],
  },
  execute: async (args: Record<string, any>): Promise<ToolExecutionResult> => {
    const rawUrl = String(args.url || '').trim();
    if (!rawUrl) return { output: '', error: 'Missing url argument.' };

    let normalizedUrl = rawUrl;
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    // 1. Try server-side proxy via Gateway backend (/api/tools/web_fetch)
    // This completely bypasses browser CORS restrictions and works for 99.9% of websites!
    try {
      const apiRoot = getApiRoot();
      const res = await fetch(`${apiRoot}/api/tools/web_fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.error) {
          return { output: '', error: data.error };
        }
        if (data.content !== undefined) {
          return { output: data.content };
        }
      }
    } catch {
      // Gateway proxy unreachable, continue to fallback
    }

    // 2. Try companion node (/api/web_fetch) if running locally
    try {
      const res = await fetch('http://127.0.0.1:9001/api/web_fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.error) {
          return { output: '', error: data.error };
        }
        if (data.content !== undefined) {
          return { output: data.content };
        }
      }
    } catch {
      // Companion not running, continue to browser direct fetch
    }

    // 3. Fallback: Browser direct fetch (works if the target site supports CORS)
    try {
      const url = new URL(normalizedUrl);
      const res = await fetch(url.toString(), {
        headers: { Accept: 'text/html,application/xhtml+xml,text/plain,application/json' },
      });

      if (!res.ok) {
        return {
          output: '',
          error: `HTTP error ${res.status}: ${res.statusText}`,
        };
      }

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();

      if (contentType.includes('application/json')) {
        return { output: text.slice(0, 15000) };
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const toRemove = doc.querySelectorAll('script, style, noscript, iframe, svg');
      toRemove.forEach((el) => el.remove());

      const bodyText = doc.body?.innerText || doc.body?.textContent || text;
      const cleaned = bodyText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n');

      return {
        output: cleaned.slice(0, 15000),
      };
    } catch (err: any) {
      return {
        output: '',
        error: `Failed to fetch URL: ${err.message || String(err)} (Target website blocks browser cross-origin requests).`,
      };
    }
  },
};
