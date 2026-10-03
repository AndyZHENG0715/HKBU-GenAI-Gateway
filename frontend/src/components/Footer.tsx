import React, { useState } from 'react';
import { ExternalLink, ShieldCheck, History, ChevronDown, ChevronUp, X } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { GatewayLogo } from './GatewayLogo';
import pkg from '../../package.json';
import changelogRaw from '../../../CHANGELOG.md?raw';

export const Footer: React.FC = () => {
  const [showChangelog, setShowChangelog] = useState<boolean>(false);

  const toggleChangelog = () => {
    setShowChangelog((prev) => !prev);
  };

  return (
    <footer className="mt-16 border-t border-slate-200 dark:border-slate-800 py-8 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-xs text-slate-500 dark:text-slate-400">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <GatewayLogo size="sm" className="w-5 h-5 !rounded-md" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              HKBU GenAI Gateway
            </span>
            <span className="px-1.5 py-0.5 rounded-md bg-hkbu-blue-100/80 dark:bg-hkbu-blue-900/50 text-hkbu-blue-800 dark:text-hkbu-blue-200 border border-hkbu-blue-200 dark:border-hkbu-blue-700/60 font-mono text-[10px] font-semibold">
              v{pkg.version}
            </span>
            <span>·</span>
            <span>Made for HKBU Students & Researchers</span>
          </div>

          <div className="flex items-center space-x-4 text-xs">
            <a
              href="https://genai.hkbu.edu.hk/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-hkbu-blue-600 dark:hover:text-hkbu-blue-400 flex items-center space-x-1"
            >
              <span>HKBU GenAI Platform</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <span>·</span>
            <span className="flex items-center space-x-1 text-slate-400 dark:text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Encrypted at rest</span>
            </span>
          </div>
        </div>

        {/* Changelog toggle */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
          <button
            onClick={toggleChangelog}
            aria-expanded={showChangelog}
            className="flex items-center space-x-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-hkbu-blue-600 dark:hover:text-hkbu-blue-400 transition-colors cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>What&apos;s new in v{pkg.version}</span>
            {showChangelog ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showChangelog && (
            <div className="mt-3 relative rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-inner overflow-hidden animate-fadeIn">
              <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 bg-slate-50/95 dark:bg-slate-850/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-700/80">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">Changelog</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Release Notes
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChangelog(false)}
                  className="flex items-center space-x-1 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/80 rounded transition-colors cursor-pointer"
                  title="Close changelog"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto p-4 sm:p-6 text-left">
                <MarkdownRenderer content={changelogRaw} />
              </div>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
};
