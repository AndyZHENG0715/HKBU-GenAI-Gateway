import React, { useState } from 'react';
import { Copy, Check, MessageSquare, ArrowDown, ShieldAlert, Key, Globe } from 'lucide-react';
import { getBaseUrl } from '../lib/api';

interface ResultCardProps {
  apiKey: string;
  onGoToPlayground: () => void;
  onScrollToGuides: () => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({
  apiKey,
  onGoToPlayground,
  onScrollToGuides,
}) => {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const baseUrl = getBaseUrl();

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(baseUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  return (
    <div className="bg-gradient-to-br from-hkbu-blue-50/90 via-white to-hkbu-gold-50/50 dark:from-hkbu-blue-950/70 dark:via-slate-900 dark:to-slate-900 rounded-2xl border-2 border-hkbu-blue-300/80 dark:border-hkbu-blue-600/60 p-6 sm:p-8 shadow-2xl shadow-hkbu-blue-900/10 space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 mb-2">
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Key Generated & Ready</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Your OpenAI-Compatible Credentials
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Use these credentials in any software that supports OpenAI API compatibility.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onGoToPlayground}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-hkbu-blue-700 hover:bg-hkbu-blue-800 dark:bg-hkbu-blue-600 dark:hover:bg-hkbu-blue-500 shadow-sm transition-all cursor-pointer"
          >
            <MessageSquare className="w-4 h-4 text-hkbu-gold-400" />
            <span>Try in Playground</span>
          </button>
        </div>
      </div>

      {/* Warning Box */}
      <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs sm:text-sm text-amber-800 dark:text-amber-200 flex items-start space-x-3">
        <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div>
          <p className="font-semibold">Save your key now!</p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300/90 leading-relaxed">
            For security, the gateway stores only an irreversible cryptographic hash of this key. It cannot be recovered once you close this page. If lost, simply generate a new one.
          </p>
        </div>
      </div>

      {/* Credentials Grid */}
      <div className="grid grid-cols-1 gap-4">
        {/* Gateway API Key */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5 uppercase tracking-wider">
              <Key className="w-3.5 h-3.5 text-hkbu-gold-500" />
              <span>Gateway API Key</span>
            </span>
            <button
              onClick={handleCopyKey}
              className="inline-flex items-center space-x-1 text-xs font-semibold text-hkbu-blue-700 dark:text-hkbu-blue-300 hover:text-hkbu-blue-800 hover:underline cursor-pointer"
            >
              {copiedKey ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Key</span>
                </>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-750 font-mono text-xs sm:text-sm text-slate-900 dark:text-slate-100 overflow-x-auto break-all select-all">
            <span>{apiKey}</span>
          </div>
        </div>

        {/* Base URL */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5 uppercase tracking-wider">
              <Globe className="w-3.5 h-3.5 text-hkbu-blue-500" />
              <span>OpenAI Base URL</span>
            </span>
            <button
              onClick={handleCopyUrl}
              className="inline-flex items-center space-x-1 text-xs font-semibold text-hkbu-blue-700 dark:text-hkbu-blue-300 hover:text-hkbu-blue-800 hover:underline cursor-pointer"
            >
              {copiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy URL</span>
                </>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-750 font-mono text-xs sm:text-sm text-slate-900 dark:text-slate-100 overflow-x-auto break-all select-all">
            <span>{baseUrl}</span>
          </div>
        </div>
      </div>

      {/* Guide CTA */}
      <div className="flex items-center justify-center pt-2">
        <button
          onClick={onScrollToGuides}
          className="inline-flex items-center space-x-1.5 text-xs sm:text-sm text-hkbu-blue-700 dark:text-hkbu-blue-300 hover:underline font-medium cursor-pointer"
        >
          <span>See how to configure Chatbox, NextChat, Cursor & Python below</span>
          <ArrowDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
