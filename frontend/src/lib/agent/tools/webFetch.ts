import { AgentTool, ToolExecutionResult } from '../types';

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

    try {
      const url = new URL(rawUrl);
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

      // Convert HTML to simple readable text
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');

      // Remove scripts, styles, iframes
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
        error: `Failed to fetch URL: ${err.message || String(err)}`,
      };
    }
  },
};
