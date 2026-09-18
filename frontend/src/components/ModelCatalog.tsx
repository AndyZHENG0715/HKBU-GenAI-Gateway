import React, { useState } from 'react';
import { Search, Copy, Check, BookOpen } from 'lucide-react';
import { SUPPORTED_MODELS } from '../lib/models';

export const ModelCatalog: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = [
    'All',
    'Writing & Logic',
    'Fast & Economical',
    'Long Documents',
    'Coding & Math',
    'Chinese & Multilingual',
    'Embeddings',
  ];

  const filteredModels = SUPPORTED_MODELS.filter((model) => {
    const matchesSearch =
      model.id.toLowerCase().includes(search.toLowerCase()) ||
      model.name.toLowerCase().includes(search.toLowerCase()) ||
      model.description.toLowerCase().includes(search.toLowerCase()) ||
      model.recommendedFor.toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      selectedCategory === 'All' || model.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleCopyModelId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header & Search */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-hkbu-blue-100 dark:bg-hkbu-blue-900/60 text-hkbu-blue-800 dark:text-hkbu-blue-200 mb-2">
              <BookOpen className="w-3.5 h-3.5 text-hkbu-gold-500" />
              <span>Model Selection Guide</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Available Models & Recommendations
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Pick the best model for your assignment or project. Click on any model name to copy it.
            </p>
          </div>

          {/* Search Field */}
          <div className="relative w-full md:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models or tasks..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-hkbu-blue-500 text-slate-900 dark:text-white placeholder-slate-400 transition-all"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="mt-6 flex items-center space-x-2 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-hkbu-blue-700 text-white shadow-sm font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {filteredModels.map((model) => (
          <div
            key={model.id}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-hkbu-blue-300 dark:hover:border-hkbu-blue-700 transition-all flex flex-col justify-between space-y-4"
          >
            <div>
              {/* Header: Title & Badges */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    {model.name}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Provider: {model.provider}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${model.badgeColor}`}
                >
                  {model.category}
                </span>
              </div>

              {/* Description */}
              <p className="mt-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {model.description}
              </p>

              {/* Best for */}
              <div className="mt-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-hkbu-blue-800 dark:text-hkbu-blue-300 uppercase tracking-wider block">
                  Recommended For
                </span>
                <span className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 block">
                  {model.recommendedFor}
                </span>
              </div>
            </div>

            {/* Copy Model String */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <code className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded truncate max-w-[180px]">
                {model.id}
              </code>
              <button
                onClick={() => handleCopyModelId(model.id)}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium text-hkbu-blue-700 dark:text-hkbu-blue-300 hover:bg-hkbu-blue-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                title="Copy model ID to paste in client app"
              >
                {copiedId === model.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Name</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
