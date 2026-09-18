import React, { useState } from 'react';
import { X, KeyRound, Check, AlertCircle } from 'lucide-react';
import { revokeCredential } from '../lib/api';

interface RevokeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRevokedSuccess?: () => void;
}

export const RevokeModal: React.FC<RevokeModalProps> = ({ isOpen, onClose, onRevokedSuccess }) => {
  const [keyToRevoke, setKeyToRevoke] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyToRevoke.trim()) return;

    setError(null);
    setLoading(true);

    try {
      const ok = await revokeCredential(keyToRevoke);
      if (ok) {
        setSuccess(true);
        onRevokedSuccess?.();
      } else {
        setError('This key could not be found or has already been revoked.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to revoke key.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-5 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Revoke Gateway Key
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Permanently disable an existing gateway API key
            </p>
          </div>
        </div>

        {success ? (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm space-y-3">
            <div className="flex items-center space-x-2 font-semibold">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Key successfully revoked</span>
            </div>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              This gateway key has been immediately invalidated and can no longer make upstream requests.
            </p>
            <button
              onClick={() => {
                setSuccess(false);
                setKeyToRevoke('');
                onClose();
              }}
              className="w-full py-2 rounded-xl text-xs font-semibold text-white bg-hkbu-blue-700 hover:bg-hkbu-blue-800 cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleRevoke} className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              If you shared your gateway key or no longer need it, paste it below to permanently deactivate it.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Gateway Key to Revoke
              </label>
              <input
                type="text"
                value={keyToRevoke}
                onChange={(e) => setKeyToRevoke(e.target.value)}
                placeholder="hkbu-gw-..."
                required
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-slate-900 dark:text-white"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !keyToRevoke.trim()}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {loading ? 'Revoking...' : 'Revoke Key'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
