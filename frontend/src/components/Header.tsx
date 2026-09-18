import React from 'react';
import { Sparkles, Sun, Moon, BookOpen, MessageSquare, KeyRound } from 'lucide-react';

interface HeaderProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  activeTab: 'setup' | 'playground' | 'models';
  setActiveTab: (tab: 'setup' | 'playground' | 'models') => void;
  isOnline: boolean;
  onOpenRevoke: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  darkMode,
  setDarkMode,
  activeTab,
  setActiveTab,
  isOnline,
  onOpenRevoke,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Brand Logo & Name */}
          <div className="flex items-center space-x-3 sm:space-x-4 cursor-pointer" onClick={() => setActiveTab('setup')}>
            {/* HKBU Emblem Badge */}
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-hkbu-blue-700 dark:bg-hkbu-blue-800 flex items-center justify-center shadow-md shadow-hkbu-blue-900/20 ring-2 ring-hkbu-gold-500/80">
              <span className="text-white font-black text-sm tracking-wider font-mono">BU</span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-hkbu-blue-700 dark:text-hkbu-blue-300">
                  HKBU GenAI
                </span>
                <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-hkbu-gold-100 dark:bg-hkbu-gold-900/50 text-hkbu-gold-700 dark:text-hkbu-gold-300 border border-hkbu-gold-300/60 dark:border-hkbu-gold-600/40">
                  Gateway
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                OpenAI-Compatible Proxy for HKBU Students & Researchers
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            <button
              onClick={() => setActiveTab('setup')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'setup'
                  ? 'bg-hkbu-blue-50 text-hkbu-blue-700 dark:bg-hkbu-blue-950 dark:text-hkbu-blue-300 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-hkbu-blue-600 dark:hover:text-hkbu-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-4 h-4 text-hkbu-gold-500" />
              <span>Get Started</span>
            </button>

            <button
              onClick={() => setActiveTab('playground')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'playground'
                  ? 'bg-hkbu-blue-50 text-hkbu-blue-700 dark:bg-hkbu-blue-950 dark:text-hkbu-blue-300 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-hkbu-blue-600 dark:hover:text-hkbu-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-hkbu-blue-500" />
              <span>Chat Playground</span>
            </button>

            <button
              onClick={() => setActiveTab('models')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'models'
                  ? 'bg-hkbu-blue-50 text-hkbu-blue-700 dark:bg-hkbu-blue-950 dark:text-hkbu-blue-300 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-hkbu-blue-600 dark:hover:text-hkbu-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <BookOpen className="w-4 h-4 text-slate-500" />
              <span>Model Guide</span>
            </button>
          </nav>

          {/* Right Actions: Status, Revoke, Dark Mode */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Status Pill */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`}></span>
              <span className="hidden sm:inline">{isOnline ? 'Gateway Online' : 'Connecting...'}</span>
            </div>

            {/* Revoke Key Button */}
            <button
              onClick={onOpenRevoke}
              title="Manage or Revoke a Gateway Key"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            {/* Theme Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle Dark Mode"
            >
              {darkMode ? <Sun className="w-4 h-4 text-hkbu-gold-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
          <button
            onClick={() => setActiveTab('setup')}
            className={`flex items-center space-x-1 py-1 px-2.5 rounded-md ${
              activeTab === 'setup' ? 'text-hkbu-blue-700 dark:text-hkbu-blue-300 font-semibold bg-hkbu-blue-50 dark:bg-hkbu-blue-950' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Get Started</span>
          </button>
          <button
            onClick={() => setActiveTab('playground')}
            className={`flex items-center space-x-1 py-1 px-2.5 rounded-md ${
              activeTab === 'playground' ? 'text-hkbu-blue-700 dark:text-hkbu-blue-300 font-semibold bg-hkbu-blue-50 dark:bg-hkbu-blue-950' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Playground</span>
          </button>
          <button
            onClick={() => setActiveTab('models')}
            className={`flex items-center space-x-1 py-1 px-2.5 rounded-md ${
              activeTab === 'models' ? 'text-hkbu-blue-700 dark:text-hkbu-blue-300 font-semibold bg-hkbu-blue-50 dark:bg-hkbu-blue-950' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Models</span>
          </button>
        </div>
      </div>
    </header>
  );
};
