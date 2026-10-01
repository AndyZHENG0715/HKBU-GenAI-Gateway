import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Sparkles, Cpu, Search } from 'lucide-react';
import { ModelInfo } from '../lib/models';

interface ModelDropdownProps {
  models: ModelInfo[];
  selectedModelId: string;
  onSelect: (modelId: string) => void;
  disabled?: boolean;
}

export const ModelDropdown: React.FC<ModelDropdownProps> = ({
  models,
  selectedModelId,
  onSelect,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedModel = models.find((m) => m.id === selectedModelId) || models[0];

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const filteredModels = models.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q)
    );
  });

  const getProviderBadge = (provider: string) => {
    switch (provider) {
      case 'OpenAI':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'DeepSeek':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'Google':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'Alibaba':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        disabled={disabled}
        className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer shadow-2xs select-none ${
          isOpen
            ? 'bg-hkbu-blue-50 dark:bg-hkbu-blue-950/60 border-hkbu-blue-400 dark:border-hkbu-blue-600 text-hkbu-blue-700 dark:text-hkbu-blue-300 ring-2 ring-hkbu-blue-500/20'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        title="Select Model"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-hkbu-blue-500 shrink-0"></span>
        <span className="truncate max-w-[100px] sm:max-w-[140px]">
          {selectedModel?.name || selectedModelId}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-hkbu-blue-600 dark:text-hkbu-blue-400' : ''
          }`}
        />
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-72 sm:w-84 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden animate-fadeIn">
          {/* Search Header */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models, categories, providers..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-hkbu-blue-500 text-slate-900 dark:text-white placeholder-slate-400"
              />
            </div>
          </div>

          {/* Model Options List */}
          <div className="max-h-64 sm:max-h-72 overflow-y-auto p-1.5 space-y-1">
            {filteredModels.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500">
                No matching models found
              </div>
            ) : (
              filteredModels.map((m) => {
                const isSelected = m.id === selectedModelId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelect(m.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left p-2 rounded-lg transition-all flex items-start space-x-2.5 cursor-pointer group ${
                      isSelected
                        ? 'bg-hkbu-blue-50 dark:bg-hkbu-blue-950/60 border border-hkbu-blue-200/80 dark:border-hkbu-blue-800/80 shadow-2xs'
                        : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    {/* Left Icon */}
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected
                          ? 'bg-hkbu-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-hkbu-blue-600 dark:group-hover:text-hkbu-blue-400'
                      }`}
                    >
                      {m.provider === 'DeepSeek' ? (
                        <Cpu className="w-3.5 h-3.5" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                    </div>

                    {/* Main Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5 mb-0.5">
                        <span
                          className={`text-xs font-bold truncate ${
                            isSelected
                              ? 'text-hkbu-blue-900 dark:text-white'
                              : 'text-slate-800 dark:text-slate-200 group-hover:text-hkbu-blue-600 dark:group-hover:text-hkbu-blue-400'
                          }`}
                        >
                          {m.name}
                        </span>

                        <div className="flex items-center space-x-1 shrink-0">
                          <span
                            className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${getProviderBadge(
                              m.provider
                            )}`}
                          >
                            {m.provider}
                          </span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-hkbu-blue-600 dark:text-hkbu-blue-400 shrink-0 ml-0.5" />
                          )}
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 leading-relaxed">
                        {m.description}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
