import React, { useState, useEffect } from 'react';
import { Brain, ChevronDown, ChevronRight, Copy, Check, Sparkles } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ThinkingBoxProps {
  reasoning: string;
  isThinking?: boolean;
}

export const ThinkingBox: React.FC<ThinkingBoxProps> = ({ reasoning, isThinking = false }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  // When reasoning first starts arriving, keep open.
  // When reasoning finishes (isThinking goes false), keep user's current preference or open by default
  useEffect(() => {
    if (isThinking) {
      setIsOpen(true);
    }
  }, [isThinking]);

  if (!reasoning.trim() && !isThinking) {
    return null;
  }

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(reasoning);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const wordCount = reasoning.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="mb-3 rounded-xl border border-hkbu-blue-200/80 dark:border-hkbu-blue-900/60 bg-hkbu-blue-50/40 dark:bg-slate-850/60 overflow-hidden text-xs transition-all">
      {/* Accordion Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="px-3.5 py-2 flex items-center justify-between cursor-pointer hover:bg-hkbu-blue-100/50 dark:hover:bg-slate-800/60 transition-colors select-none"
      >
        <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 font-medium">
          <div className="relative">
            <Brain className="w-3.5 h-3.5 text-hkbu-blue-600 dark:text-hkbu-blue-400" />
            {isThinking && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-hkbu-gold-500 animate-ping" />
            )}
          </div>
          <span className="font-semibold text-hkbu-blue-900 dark:text-hkbu-blue-200">
            {isThinking ? 'Thinking...' : 'Thought Process'}
          </span>
          {!isThinking && wordCount > 0 && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">
              ({wordCount} words)
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1.5 text-slate-400 dark:text-slate-500">
          {reasoning.trim() && (
            <button
              onClick={handleCopy}
              type="button"
              className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              title="Copy thought process"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          )}
          <button type="button" className="p-0.5">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Accordion Content */}
      {isOpen && (
        <div className="px-3.5 py-3 border-t border-hkbu-blue-100/80 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-sans border-l-2 border-l-hkbu-blue-500 dark:border-l-hkbu-blue-400 max-h-96 overflow-y-auto">
          {reasoning ? (
            <MarkdownRenderer content={reasoning} className="text-xs text-slate-600 dark:text-slate-300" />
          ) : (
            <div className="flex items-center space-x-2 text-slate-400 dark:text-slate-500 italic py-1">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>Analyzing query and forming reasoning steps...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
