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
  Code2,
  FileText,
  Download,
} from 'lucide-react';
import { ToolCallExecution } from '../lib/agent/types';

interface ToolCallCardProps {
  toolCall: ToolCallExecution;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall }) => {
  // Mainstream Agent UX: Collapsed by default when completed, expanded while running
  const [isExpanded, setIsExpanded] = useState<boolean>(toolCall.status === 'running');
  const [activeTab, setActiveTab] = useState<'input' | 'output' | 'preview'>('output');
  const [copied, setCopied] = useState(false);

  const getToolIcon = (name: string) => {
    if (name.includes('python')) return <Terminal className="w-3.5 h-3.5 text-emerald-500" />;
    if (name.includes('directory') || name.includes('file')) return <Folder className="w-3.5 h-3.5 text-amber-500" />;
    if (name.includes('web') || name.includes('fetch')) return <Globe className="w-3.5 h-3.5 text-sky-500" />;
    if (name.includes('calc')) return <Calculator className="w-3.5 h-3.5 text-purple-500" />;
    if (name.includes('companion') || name.includes('bash')) return <Terminal className="w-3.5 h-3.5 text-indigo-500" />;
    return <Terminal className="w-3.5 h-3.5 text-slate-500" />;
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
        return 'Web Page Fetch';
      case 'calculator':
        return 'Calculator';
      case 'companion_bash_execute':
        return 'Terminal (Bash)';
      case 'companion_read_file':
        return 'Host Read File';
      case 'companion_write_file':
        return 'Host Write File';
      default:
        return name;
    }
  };

  // Concise 1-line argument summary
  const getArgSummary = (): string => {
    const args = toolCall.args || {};
    if (toolCall.toolName === 'python_interpreter') {
      const code = String(args.code || '');
      const lines = code.split('\n').filter(Boolean).length;
      return lines > 1 ? `${lines} lines code` : code.slice(0, 32);
    }
    if (args.path) return `"${args.path}"`;
    if (args.command) return `"${args.command.slice(0, 36)}${args.command.length > 36 ? '...' : ''}"`;
    if (args.expression) return `${args.expression}`;
    if (args.url) return `${args.url.slice(0, 32)}...`;
    return '';
  };

  const durationMs =
    toolCall.startedAt && toolCall.finishedAt
      ? toolCall.finishedAt - toolCall.startedAt
      : null;

  const copyResult = (text: string) => {
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasImages = Boolean(toolCall.result?.images && toolCall.result.images.length > 0);
  const argSummary = getArgSummary();

  return (
    <div
      className={`my-1.5 rounded-xl border transition-all duration-200 overflow-hidden text-xs ${
        toolCall.status === 'running'
          ? 'border-blue-400/80 dark:border-blue-500/60 bg-blue-50/40 dark:bg-blue-950/20 shadow-xs ring-1 ring-blue-400/20'
          : toolCall.status === 'error'
          ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/15'
          : 'border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/80 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      {/* 1-Line Compact Header Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-3 py-2 flex items-center justify-between cursor-pointer select-none transition-colors group"
      >
        {/* Left: Status icon, Tool Name, Arg snippet, Duration */}
        <div className="flex items-center space-x-2 min-w-0">
          <div className="flex-shrink-0 flex items-center">
            {toolCall.status === 'running' && (
              <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
            )}
            {toolCall.status === 'success' && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            )}
            {toolCall.status === 'error' && (
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
            )}
            {toolCall.status === 'pending' && (
              <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 ml-0.5 mr-1" />
            )}
          </div>

          <div className="flex items-center space-x-1.5 min-w-0">
            {getToolIcon(toolCall.toolName)}
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px] truncate">
              {getDisplayName(toolCall.toolName)}
            </span>
          </div>

          {argSummary && (
            <span className="hidden sm:inline-block font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded truncate max-w-[200px]">
              {argSummary}
            </span>
          )}

          {durationMs !== null && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
              {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(2)}s`}
            </span>
          )}
        </div>

        {/* Right: Artifact preview pill & Expand Chevron */}
        <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
          {hasImages && (
            <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              <ImageIcon className="w-3 h-3 text-purple-500" />
              <span>Plot</span>
            </span>
          )}

          {toolCall.status === 'running' && (
            <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 animate-pulse">
              Running...
            </span>
          )}

          <div className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-transform duration-200">
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Tabbed Inspector */}
      {isExpanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-2.5 space-y-2">
          {/* Tab Navigation */}
          <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/60 pb-1.5 mb-1.5">
            <div className="flex items-center space-x-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('output');
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center space-x-1 transition-colors cursor-pointer ${
                  activeTab === 'output'
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>Output</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('input');
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center space-x-1 transition-colors cursor-pointer ${
                  activeTab === 'input'
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3 h-3" />
                <span>Parameters</span>
              </button>

              {hasImages && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab('preview');
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center space-x-1 transition-colors cursor-pointer ${
                    activeTab === 'preview'
                      ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-900 dark:text-purple-200 font-semibold'
                      : 'text-purple-600 dark:text-purple-400 hover:text-purple-800'
                  }`}
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>Plot ({toolCall.result?.images?.length})</span>
                </button>
              )}
            </div>

            {/* Quick Copy Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                const text =
                  activeTab === 'input'
                    ? toolCall.toolName === 'python_interpreter' && toolCall.args?.code
                      ? toolCall.args.code
                      : JSON.stringify(toolCall.args, null, 2)
                    : toolCall.result?.output || toolCall.result?.error || '';
                copyResult(text);
              }}
              className="flex items-center space-x-1 text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {/* Tab 1: Input Arguments */}
          {activeTab === 'input' && (
            <div>
              {toolCall.toolName === 'python_interpreter' && toolCall.args?.code ? (
                <div className="bg-slate-950 text-slate-100 rounded-lg p-2.5 font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed border border-slate-800/80">
                  <code>{toolCall.args.code}</code>
                </div>
              ) : (
                <pre className="bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200 rounded-lg p-2 font-mono text-[11px] overflow-x-auto border border-slate-200/60 dark:border-slate-800/60">
                  {JSON.stringify(toolCall.args, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Tab 2: Output Terminal */}
          {activeTab === 'output' && (
            <div className="space-y-1.5">
              {toolCall.result?.error ? (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 font-mono text-[11px] whitespace-pre-wrap">
                  {toolCall.result.error}
                </div>
              ) : toolCall.result?.output ? (
                <pre className="bg-slate-950 text-emerald-400 rounded-lg p-2.5 font-mono text-[11px] max-h-56 overflow-y-auto whitespace-pre-wrap border border-slate-800 leading-relaxed">
                  {toolCall.result.output}
                </pre>
              ) : toolCall.status === 'running' ? (
                <div className="p-3 text-center text-slate-400 italic text-[11px] flex items-center justify-center space-x-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                  <span>Tool is running on local sandbox...</span>
                </div>
              ) : (
                <div className="p-2 text-slate-400 dark:text-slate-500 italic text-[10px]">
                  (No console output returned)
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Visual Plot Preview */}
          {activeTab === 'preview' && hasImages && (
            <div className="space-y-2">
              {toolCall.result!.images!.map((imgUrl, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 p-2 shadow-xs"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pb-1.5 border-b border-slate-100 dark:border-slate-800 mb-2">
                    <span className="font-medium">Matplotlib Plot #{idx + 1}</span>
                    <a
                      href={imgUrl}
                      download={`plot_${Date.now()}_${idx + 1}.png`}
                      className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download PNG</span>
                    </a>
                  </div>
                  <img
                    src={imgUrl}
                    alt={`Plot ${idx + 1}`}
                    className="w-full h-auto rounded max-h-[380px] object-contain mx-auto"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
