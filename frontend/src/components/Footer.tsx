import React from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-16 border-t border-slate-200 dark:border-slate-800 py-8 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-xs text-slate-500 dark:text-slate-400">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 rounded-md bg-hkbu-blue-700 text-white flex items-center justify-center font-bold text-[10px] font-mono">
              BU
            </div>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              HKBU GenAI Gateway
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
      </div>
    </footer>
  );
};
