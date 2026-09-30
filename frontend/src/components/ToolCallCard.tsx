import React, { useState } from 'react';
import {
  Terminal,
  Folder,
  Globe,
  Calculator,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  ImageIcon,
} from 'lucide-react';
import { ToolCallExecution } from '../lib/agent/types';

interface ToolCallCardProps {
  toolCall: ToolCallExecution;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const getToolIcon = (name: string) => {
    if (name.includes('python')) return <Terminal className="w-4 h-4 text-emerald-500" />;
    if (name.includes('directory') || name.includes('file')) return <Folder className="w-4 h-4 text-amber-500" />;
    if (name.includes('web') || name.includes('fetch')) return <Globe className="w-4 h-4 text-sky-500" />;
    if (name.includes('calc')) return <Calculator className="w-4 h-4 text-purple-500" />;
    return <Terminal className="w-4 h-4 text-slate-500" />;
  };

  const getDisplayName = (name: string) => {
    switch (name) {
      case 'python_interpreter':
        return 'Python (WebAssembly)';
      case 'list_directory':
        return 'List Directory';
      case 'read_local_file':
        return 'Read File';
      case 'write_local_file':
        return 'Write File';
      case 'web_fetch':
        return 'Fetch Web Page';
      case 'calculator':
        return 'Calculator';
      default:
        return name;
    }
  };

  const durationMs =
    toolCall.startedAt && toolCall.finishedAt
      ? toolCall.finishedAt - toolCall.startedAt
      : null;

  const copyResult = () => {
    const textToCopy = toolCall.result?.output || toolCall.result?.error || '';
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="my-2 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/70 shadow-sm overflow-hidden text-xs">
      {/* Header bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-3.5 py-2.5 flex items-center justify-between bg-slate-100/60 dark:bg-slate-800/60 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center space-x-2.5">
          {getToolIcon(toolCall.toolName)}
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {getDisplayName(toolCall.toolName)}
          </span>
          {durationMs !== null && (
            <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">
              {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(2)}s`}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {toolCall.status === 'running' && (
            <span className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Running</span>
            </span>
          )}
          {toolCall.status === 'success' && (
            <span className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Done</span>
            </span>
          )}
          {toolCall.status === 'error' && (
            <span className="flex items-center space-x-1 text-rose-600 dark:text-rose-400 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Failed</span>
            </span>
          )}
          {toolCall.status === 'pending' && (
            <span className="text-slate-600 dark:text-slate-400">Queued</span>
          )}

          <button className="text-slate-600 dark:text-slate-400 p-0.5">
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div className="p-3 space-y-2.5 border-t border-slate-200/60 dark:border-slate-800/60">
          {/* Arguments */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
              Input Arguments
            </div>
            {toolCall.toolName === 'python_interpreter' && toolCall.args?.code ? (
              <div className="bg-slate-900 text-slate-100 rounded-lg p-2.5 font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed border border-slate-800">
                <code>{toolCall.args.code}</code>
              </div>
            ) : (
              <pre className="bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-lg p-2 font-mono text-[11px] overflow-x-auto border border-slate-200/60 dark:border-slate-800/60">
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            )}
          </div>

          {/* Results */}
          {toolCall.result && (
            <div>
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                <span>Output Result</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyResult();
                  }}
                  className="flex items-center space-x-1 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {/* Matplotlib Images Render */}
              {toolCall.result.images && toolCall.result.images.length > 0 && (
                <div className="my-2 space-y-2">
                  {toolCall.result.images.map((imgUrl, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white p-2 shadow-sm">
                      <div className="flex items-center space-x-1.5 text-[10px] text-slate-600 font-medium pb-1.5 border-b border-slate-100 mb-2">
                        <ImageIcon className="w-3 h-3 text-blue-500" />
                        <span>Matplotlib Generated Plot</span>
                      </div>
                      <img src={imgUrl} alt="Generated Plot" className="w-full h-auto rounded max-h-[420px] object-contain mx-auto" />
                    </div>
                  ))}
                </div>
              )}

              {/* Output Text */}
              {toolCall.result.output && (
                <pre className="bg-slate-900 text-emerald-400 rounded-lg p-2.5 font-mono text-[11px] max-h-60 overflow-y-auto whitespace-pre-wrap border border-slate-800 leading-relaxed">
                  {toolCall.result.output}
                </pre>
              )}

              {/* Error Box */}
              {toolCall.result.error && (
                <div className="mt-1 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 font-mono text-[11px] whitespace-pre-wrap">
                  {toolCall.result.error}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
