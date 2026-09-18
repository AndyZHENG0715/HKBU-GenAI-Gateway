import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { KeyGenerator } from './components/KeyGenerator';
import { ResultCard } from './components/ResultCard';
import { Playground } from './components/Playground';
import { ToolPresets } from './components/ToolPresets';
import { ModelCatalog } from './components/ModelCatalog';
import { RevokeModal } from './components/RevokeModal';
import { Footer } from './components/Footer';
import { checkHealth, CredentialResponse } from './lib/api';
import { Sparkles, ShieldCheck, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';

export const App: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hkbu_theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const [activeTab, setActiveTab] = useState<'setup' | 'playground' | 'models'>('setup');
  const [isOnline, setIsOnline] = useState(true);
  const [generatedKey, setGeneratedKey] = useState<string>('');
  const [showRevokeModal, setShowRevokeModal] = useState(false);

  // Sync dark mode class with HTML tag
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('hkbu_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('hkbu_theme', 'light');
    }
  }, [darkMode]);

  // Check backend health
  useEffect(() => {
    checkHealth().then(setIsOnline);
    const interval = setInterval(() => {
      checkHealth().then(setIsOnline);
    }, 45000);
    return () => clearInterval(interval);
  }, []);

  const handleKeyGenerated = (cred: CredentialResponse) => {
    setGeneratedKey(cred.api_key);
    // Smoothly scroll down to result card
    setTimeout(() => {
      const el = document.getElementById('result-section');
      el?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleScrollToGuides = () => {
    const el = document.getElementById('guides-section');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Header
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOnline={isOnline}
        onOpenRevoke={() => setShowRevokeModal(true)}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10">
        {/* Setup / Onboarding Tab */}
        {activeTab === 'setup' && (
          <div className="space-y-10">
            {/* Hero Section */}
            <div className="text-center max-w-3xl mx-auto space-y-4 pt-2 sm:pt-4">
              <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-hkbu-blue-100/80 dark:bg-hkbu-blue-900/50 text-hkbu-blue-800 dark:text-hkbu-blue-200 border border-hkbu-blue-200 dark:border-hkbu-blue-700/60 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-hkbu-gold-500 animate-ping"></span>
                <span>OpenAI Compatible · Student Quota Enabled</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                Use HKBU GenAI in{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-hkbu-blue-700 via-hkbu-blue-600 to-hkbu-gold-500 dark:from-hkbu-blue-400 dark:via-hkbu-blue-300 dark:to-hkbu-gold-400">
                  Any AI Agent & App
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
                Convert your HKBU GenAI key into standard OpenAI credentials in 1 click. Connect directly to Chatbox, Cursor, NextChat, Dify, and Python scripts with zero hassle.
              </p>

              {/* Feature Highlights Pills */}
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
                <div className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>GPT-4.1, Gemini 2.5 & DeepSeek</span>
                </div>
                <div className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5 text-hkbu-blue-500" />
                  <span>Safe & Encrypted at Rest</span>
                </div>
                <div className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <Zap className="w-3.5 h-3.5 text-hkbu-gold-500" />
                  <span>No Setup Required</span>
                </div>
              </div>
            </div>

            {/* Step 1 & 2: Key Generator Card */}
            <KeyGenerator onSuccess={handleKeyGenerated} />

            {/* Step 3: Result Card (If key generated) */}
            {generatedKey && (
              <div id="result-section">
                <ResultCard
                  apiKey={generatedKey}
                  onGoToPlayground={() => setActiveTab('playground')}
                  onScrollToGuides={handleScrollToGuides}
                />
              </div>
            )}

            {/* In-Browser Playground Teaser */}
            <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-hkbu-blue-700 to-hkbu-blue-900 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-1 text-center sm:text-left">
                <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-hkbu-gold-300 mb-1">
                  <Sparkles className="w-3 h-3 text-hkbu-gold-300" />
                  <span>Instant Test</span>
                </div>
                <h3 className="text-xl font-bold tracking-tight">Want to chat with models right away?</h3>
                <p className="text-xs sm:text-sm text-hkbu-blue-100 max-w-xl">
                  Try our built-in playground without installing any desktop software or extensions.
                </p>
              </div>

              <button
                onClick={() => setActiveTab('playground')}
                className="whitespace-nowrap px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-hkbu-blue-900 bg-hkbu-gold-400 hover:bg-hkbu-gold-300 shadow-md transition-all inline-flex items-center space-x-1.5 cursor-pointer"
              >
                <span>Open Chat Playground</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Client Tool Presets */}
            <ToolPresets apiKey={generatedKey} />
          </div>
        )}

        {/* Playground Tab */}
        {activeTab === 'playground' && (
          <div className="space-y-6 animate-fadeIn">
            <Playground currentApiKey={generatedKey} />
          </div>
        )}

        {/* Models Guide Tab */}
        {activeTab === 'models' && (
          <div className="space-y-6 animate-fadeIn">
            <ModelCatalog />
          </div>
        )}
      </main>

      {/* Revoke Modal */}
      <RevokeModal
        isOpen={showRevokeModal}
        onClose={() => setShowRevokeModal(false)}
        onRevokedSuccess={() => {
          if (generatedKey) setGeneratedKey('');
        }}
      />

      <Footer />
    </div>
  );
};
