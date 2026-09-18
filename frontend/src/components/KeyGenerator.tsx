import React, { useState } from 'react';
import { Key, Eye, EyeOff, ArrowRight, ExternalLink, ShieldCheck, HelpCircle, AlertCircle, Sparkles } from 'lucide-react';
import { createCredential, CredentialResponse } from '../lib/api';

interface KeyGeneratorProps {
  onSuccess: (cred: CredentialResponse) => void;
}

export const KeyGenerator: React.FC<KeyGeneratorProps> = ({ onSuccess }) => {
  const [hkbuKey, setHkbuKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hkbuKey.trim()) return;

    setError(null);
    setLoading(true);

    try {
      const result = await createCredential(hkbuKey);
      onSuccess(result);
    } catch (err: any) {
      setError(err.message || 'Validation failed. Please verify your HKBU key and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none overflow-hidden transition-all">
      {/* Card Header */}
      <div className="p-6 sm:p-8 bg-gradient-to-br from-hkbu-blue-50/70 via-white to-hkbu-gold-50/30 dark:from-hkbu-blue-950/40 dark:via-slate-900 dark:to-slate-900 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-hkbu-blue-100 dark:bg-hkbu-blue-900/60 text-hkbu-blue-800 dark:text-hkbu-blue-200 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-hkbu-gold-500" />
              <span>Step-by-Step Self-Service</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Get Your OpenAI-Compatible Key
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-xl">
              Submit your HKBU GenAI Platform key once to generate a universal OpenAI key compatible with Chatbox, Cursor, Dify, Python, and AI agents.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className="self-start sm:self-center inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-hkbu-blue-700 dark:text-hkbu-blue-300 bg-white dark:bg-slate-800 border border-hkbu-blue-200 dark:border-slate-700 shadow-sm hover:bg-hkbu-blue-50 dark:hover:bg-slate-750 transition-all"
          >
            <HelpCircle className="w-4 h-4 text-hkbu-gold-500" />
            <span>{showHelp ? 'Hide guide' : 'Where is my HKBU key?'}</span>
          </button>
        </div>

        {/* Collapsible HKBU Key Guide */}
        {showHelp && (
          <div className="mt-6 p-4 sm:p-5 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-hkbu-blue-100 dark:border-slate-700/80 shadow-sm text-sm space-y-3 animate-fadeIn">
            <h3 className="font-semibold text-hkbu-blue-800 dark:text-hkbu-blue-200 flex items-center space-x-2">
              <span>How to find your HKBU GenAI Platform key:</span>
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-slate-600 dark:text-slate-300 ml-1">
              <li>
                Log into the official{' '}
                <a
                  href="https://genai.hkbu.edu.hk/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-hkbu-blue-600 dark:text-hkbu-blue-400 hover:underline inline-flex items-center space-x-0.5"
                >
                  <span>HKBU GenAI Platform</span>
                  <ExternalLink className="w-3.5 h-3.5 ml-0.5 inline" />
                </a>{' '}
                using your university credentials.
              </li>
              <li>
                Navigate to your user profile or API documentation page.
              </li>
              <li>
                Look for your personal <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono text-xs text-slate-800 dark:text-slate-200">api-key</code>.
              </li>
              <li>Copy and paste it into the field below.</li>
            </ol>
          </div>
        )}
      </div>

      {/* Form Body */}
      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
        <div>
          <label htmlFor="hkbu-key-input" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
            HKBU GenAI Platform Key
          </label>
          <div className="relative rounded-xl shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Key className="w-4 h-4" />
            </div>
            <input
              id="hkbu-key-input"
              type={showKey ? 'text' : 'password'}
              value={hkbuKey}
              onChange={(e) => setHkbuKey(e.target.value)}
              placeholder="Paste your HKBU Platform API key here..."
              required
              className="block w-full pl-10 pr-12 py-3 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-hkbu-blue-500/30 focus:border-hkbu-blue-500 dark:focus:border-hkbu-blue-400 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 font-mono transition-all"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Toggle password visibility"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span>Encrypted at rest using Fernet encryption. Plaintext is never logged or exposed.</span>
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-sm flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to validate key</p>
              <p className="mt-0.5 text-xs text-red-600 dark:text-red-300/90">{error}</p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={loading || !hkbuKey.trim()}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3 rounded-xl font-semibold text-sm text-white bg-hkbu-blue-700 hover:bg-hkbu-blue-800 active:bg-hkbu-blue-900 dark:bg-hkbu-blue-600 dark:hover:bg-hkbu-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-hkbu-blue-900/20 transition-all cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Verifying key with HKBU Platform...</span>
              </>
            ) : (
              <>
                <span>Validate & Generate Gateway Key</span>
                <ArrowRight className="w-4 h-4 text-hkbu-gold-400" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
