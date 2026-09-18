import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const codeString = String(children).replace(/\n$/, '');

            if (!inline && (match || codeString.includes('\n'))) {
              return <CodeBlock language={language} code={codeString} />;
            }

            return (
              <code
                className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-hkbu-blue-800 dark:text-hkbu-blue-300 font-mono text-[12px]"
                {...props}
              >
                {children}
              </code>
            );
          },
          a({ node, href, children, ...props }: any) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium underline hover:text-hkbu-blue-800 dark:hover:text-hkbu-blue-300 transition-colors"
                {...props}
              >
                {children}
              </a>
            );
          },
          table({ node, children, ...props }: any) {
            return (
              <div className="overflow-x-auto my-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs text-left" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          thead({ node, children, ...props }: any) {
            return (
              <thead className="bg-slate-100 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-200" {...props}>
                {children}
              </thead>
            );
          },
          th({ node, children, ...props }: any) {
            return (
              <th className="px-3 py-2 text-xs font-semibold" {...props}>
                {children}
              </th>
            );
          },
          td({ node, children, ...props }: any) {
            return (
              <td className="px-3 py-2 text-xs border-t border-slate-200 dark:border-slate-800" {...props}>
                {children}
              </td>
            );
          },
          blockquote({ node, children, ...props }: any) {
            return (
              <blockquote
                className="border-l-4 border-hkbu-gold-500 bg-hkbu-gold-50/30 dark:bg-hkbu-gold-950/10 pl-3.5 py-1 my-2 rounded-r italic text-slate-700 dark:text-slate-300 text-xs"
                {...props}
              >
                {children}
              </blockquote>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

interface CodeBlockProps {
  language: string;
  code: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100 shadow-sm not-prose">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-950/80 border-b border-slate-800 text-[11px] font-mono text-slate-400">
        <span className="font-semibold uppercase tracking-wider">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          type="button"
          className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-sans">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="font-sans">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 text-xs font-mono overflow-x-auto leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
};
