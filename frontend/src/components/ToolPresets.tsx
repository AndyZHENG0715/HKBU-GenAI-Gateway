import React, { useState } from 'react';
import { Copy, Check, MessageSquare, Code2, Terminal, Layers, Cpu, FileJson, Info } from 'lucide-react';
import { getBaseUrl } from '../lib/api';

interface ToolPresetsProps {
  apiKey: string;
}

export const ToolPresets: React.FC<ToolPresetsProps> = ({ apiKey }) => {
  const [activePreset, setActivePreset] = useState<
    'workbuddy' | 'vscode' | 'cursor' | 'nextchat' | 'chatbox' | 'dify' | 'python' | 'curl'
  >('workbuddy');
  const [vscodeSubTab, setVscodeSubTab] = useState<'continue' | 'cline'>('continue');
  const [wbPasteMode, setWbPasteMode] = useState<'full' | 'array'>('full');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const baseUrl = getBaseUrl();
  const effectiveKey = apiKey || '<YOUR_API_KEY>';

  // Standard chat models for client configurations
  const chatModels = [
    {
      id: 'gpt-5',
      name: 'GPT-5',
      vendor: 'gpt',
      maxInputTokens: 1047576,
      maxOutputTokens: 65536,
      supportsToolCall: true,
      supportsImages: true,
      supportsReasoning: true,
    },
    {
      id: 'gpt-5-mini',
      name: 'GPT-5 mini',
      vendor: 'gpt',
      maxInputTokens: 1047576,
      maxOutputTokens: 65536,
      supportsToolCall: true,
      supportsImages: true,
      supportsReasoning: true,
    },
    {
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      vendor: 'gpt',
      maxInputTokens: 1047576,
      maxOutputTokens: 32768,
      supportsToolCall: true,
      supportsImages: true,
      supportsReasoning: false,
    },
    {
      id: 'gpt-4.1-mini',
      name: 'GPT-4.1 mini',
      vendor: 'gpt',
      maxInputTokens: 1047576,
      maxOutputTokens: 32768,
      supportsToolCall: true,
      supportsImages: true,
      supportsReasoning: false,
    },
    {
      id: 'o1',
      name: 'o1',
      vendor: 'gpt',
      maxInputTokens: 200000,
      maxOutputTokens: 100000,
      supportsToolCall: true,
      supportsImages: true,
      supportsReasoning: true,
    },
    {
      id: 'o3-mini',
      name: 'o3-mini',
      vendor: 'gpt',
      maxInputTokens: 200000,
      maxOutputTokens: 100000,
      supportsToolCall: true,
      supportsImages: false,
      supportsReasoning: true,
    },
    {
      id: 'deepSeek-V4-Pro-hkbu',
      name: 'DeepSeek V4 Pro',
      vendor: 'deepseek',
      maxInputTokens: 1000000,
      maxOutputTokens: 384000,
      supportsToolCall: true,
      supportsImages: false,
      supportsReasoning: true,
    },
    {
      id: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      vendor: 'deepseek',
      maxInputTokens: 1000000,
      maxOutputTokens: 384000,
      supportsToolCall: true,
      supportsImages: false,
      supportsReasoning: true,
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      vendor: 'gemini',
      maxInputTokens: 2000000,
      maxOutputTokens: 65536,
      supportsToolCall: true,
      supportsImages: true,
      supportsReasoning: true,
    },
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      vendor: 'gemini',
      maxInputTokens: 1000000,
      maxOutputTokens: 65536,
      supportsToolCall: true,
      supportsImages: true,
      supportsReasoning: true,
    },
    {
      id: 'qwen3-max',
      name: 'Qwen3 Max',
      vendor: 'qwen',
      maxInputTokens: 1000000,
      maxOutputTokens: 65536,
      supportsToolCall: true,
      supportsImages: false,
      supportsReasoning: false,
    },
    {
      id: 'qwen-plus',
      name: 'Qwen Plus',
      vendor: 'qwen',
      maxInputTokens: 131072,
      maxOutputTokens: 8192,
      supportsToolCall: true,
      supportsImages: false,
      supportsReasoning: false,
    },
    {
      id: 'llama-4-maverick',
      name: 'Llama 4 Maverick',
      vendor: 'llama',
      maxInputTokens: 1000000,
      maxOutputTokens: 32768,
      supportsToolCall: true,
      supportsImages: false,
      supportsReasoning: false,
    },
  ];

  // WorkBuddy full JSON configuration (~/.workbuddy/models.json)
  const workbuddyFullJson = JSON.stringify(
    {
      models: chatModels.map((m) => ({
        id: m.id,
        name: m.name,
        vendor: m.vendor,
        url: baseUrl,
        apiKey: effectiveKey,
        maxInputTokens: m.maxInputTokens,
        maxOutputTokens: m.maxOutputTokens,
        supportsToolCall: m.supportsToolCall,
        supportsImages: m.supportsImages,
        supportsReasoning: m.supportsReasoning,
      })),
    },
    null,
    2
  );

  // WorkBuddy models array only (for users merging into existing config)
  const workbuddyArrayOnlyJson = JSON.stringify(
    chatModels.map((m) => ({
      id: m.id,
      name: m.name,
      vendor: m.vendor,
      url: baseUrl,
      apiKey: effectiveKey,
      maxInputTokens: m.maxInputTokens,
      maxOutputTokens: m.maxOutputTokens,
      supportsToolCall: m.supportsToolCall,
      supportsImages: m.supportsImages,
      supportsReasoning: m.supportsReasoning,
    })),
    null,
    2
  );

  // VS Code Continue JSON configuration (~/.continue/config.json)
  const vscodeContinueJson = JSON.stringify(
    {
      models: chatModels.map((m) => ({
        title: `${m.name} (HKBU)`,
        provider: 'openai',
        model: m.id,
        apiKey: effectiveKey,
        apiBase: baseUrl,
      })),
      tabAutocompleteModel: {
        title: 'DeepSeek V4 Flash (Autocomplete)',
        provider: 'openai',
        model: 'deepseek-v4-flash',
        apiKey: effectiveKey,
        apiBase: baseUrl,
      },
      embeddingsProvider: {
        provider: 'openai',
        model: 'text-embedding-3-small',
        apiKey: effectiveKey,
        apiBase: baseUrl,
      },
    },
    null,
    2
  );

  // VS Code Cline / Roo Code settings configuration
  const vscodeClineJson = JSON.stringify(
    {
      apiProvider: 'openai-compatible',
      openAiBaseUrl: baseUrl,
      openAiApiKey: effectiveKey,
      openAiModelId: 'gpt-4.1',
      openAiCustomModelInfo: {
        maxTokens: 32768,
        contextWindow: 1047576,
        supportsImages: true,
        supportsComputerUse: false,
      },
    },
    null,
    2
  );

  // Quick comma-separated model names for pasting into Cursor / NextChat / Cherry Studio
  const chatModelNamesList = chatModels.map((m) => m.id).join(', ');
  const allModelNamesList = [
    ...chatModels.map((m) => m.id),
    'text-embedding-3-large',
    'text-embedding-3-small',
  ].join(', ');

  const copyText = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback or ignore clipboard errors
    }
  };

  return (
    <div id="guides-section" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xl overflow-hidden transition-all">
      {/* Header */}
      <div className="p-6 sm:p-8 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          How to Connect Your Apps & Agents
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Select your tool below to view exact setup instructions, configuration file locations, and copy-pasteable configs.
        </p>

        {/* Preset Selector Tabs */}
        <div className="mt-6 flex items-center space-x-2 overflow-x-auto pb-2">
          <button
            onClick={() => setActivePreset('workbuddy')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activePreset === 'workbuddy'
                ? 'bg-hkbu-blue-700 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-hkbu-gold-500" />
            <span>Tencent WorkBuddy</span>
          </button>

          <button
            onClick={() => setActivePreset('vscode')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activePreset === 'vscode'
                ? 'bg-hkbu-blue-700 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>VS Code (Continue / Cline)</span>
          </button>

          <button
            onClick={() => setActivePreset('cursor')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activePreset === 'cursor'
                ? 'bg-hkbu-blue-700 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Cursor</span>
          </button>

          <button
            onClick={() => setActivePreset('nextchat')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activePreset === 'nextchat'
                ? 'bg-hkbu-blue-700 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Cherry Studio / NextChat</span>
          </button>

          <button
            onClick={() => setActivePreset('chatbox')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activePreset === 'chatbox'
                ? 'bg-hkbu-blue-700 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chatbox</span>
          </button>

          <button
            onClick={() => setActivePreset('dify')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activePreset === 'dify'
                ? 'bg-hkbu-blue-700 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Dify / Open WebUI</span>
          </button>

          <button
            onClick={() => setActivePreset('python')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activePreset === 'python'
                ? 'bg-hkbu-blue-700 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Python SDK</span>
          </button>

          <button
            onClick={() => setActivePreset('curl')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activePreset === 'curl'
                ? 'bg-hkbu-blue-700 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>cURL / Shell</span>
          </button>
        </div>
      </div>

      {/* Preset Details Body */}
      <div className="p-6 sm:p-8">
        {/* Tencent WorkBuddy Preset */}
        {activePreset === 'workbuddy' && (
          <div className="space-y-6">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Connecting Tencent WorkBuddy AI Agent
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                Configure all 13 HKBU models in Tencent WorkBuddy with tool calling and deep reasoning supported:
              </p>
            </div>

            {/* Method 1: GUI */}
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-850/40 border border-slate-200 dark:border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Method 1: GUI Setup (Settings → Models → Add Model → Custom)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-slate-500 block mb-1">API Base URL / Endpoint:</span>
                  <div className="flex items-center justify-between font-mono bg-slate-50 dark:bg-slate-900 p-1.5 rounded border border-slate-200 dark:border-slate-750">
                    <span className="truncate">{baseUrl}</span>
                    <button onClick={() => copyText(baseUrl, 'wb-url')} className="text-hkbu-blue-600 dark:text-hkbu-blue-400 hover:underline ml-2 cursor-pointer font-sans">
                      {copiedField === 'wb-url' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-slate-500 block mb-1">API Key:</span>
                  <div className="flex items-center justify-between font-mono bg-slate-50 dark:bg-slate-900 p-1.5 rounded border border-slate-200 dark:border-slate-750">
                    <span className="truncate">{effectiveKey}</span>
                    <button onClick={() => copyText(effectiveKey, 'wb-key')} className="text-hkbu-blue-600 dark:text-hkbu-blue-400 hover:underline ml-2 cursor-pointer font-sans">
                      {copiedField === 'wb-key' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Method 2: Foolproof Configuration File Guide */}
            <div className="space-y-4 p-4 sm:p-5 rounded-xl bg-slate-50 dark:bg-slate-850/40 border border-slate-200 dark:border-slate-800">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Method 2: 1-Click Configuration File (~/.workbuddy/models.json)</h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Follow these 3 simple steps to add all 13 models in seconds without manually entering them one by one:
                </p>
              </div>

              {/* Step 1: Locate File */}
              <div className="p-3.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                <div className="flex items-center space-x-2 font-bold text-slate-800 dark:text-slate-200">
                  <span className="w-5 h-5 rounded-full bg-hkbu-blue-600 text-white flex items-center justify-center text-[11px]">1</span>
                  <span>Locate or Create Your Configuration File</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-7 font-mono text-[11px]">
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-750">
                    <span className="text-slate-400 block text-[10px] font-sans font-semibold">macOS / Linux:</span>
                    <span className="text-hkbu-blue-600 dark:text-hkbu-blue-400 break-all">~/.workbuddy/models.json</span>
                    <span className="text-slate-400 block text-[10px] font-sans mt-0.5">(Finder: Cmd+Shift+G → paste path)</span>
                  </div>
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-750">
                    <span className="text-slate-400 block text-[10px] font-sans font-semibold">Windows:</span>
                    <span className="text-hkbu-blue-600 dark:text-hkbu-blue-400 break-all">%USERPROFILE%\.workbuddy\models.json</span>
                    <span className="text-slate-400 block text-[10px] font-sans mt-0.5">(Win+R → paste path → Open with Notepad/VSCode)</span>
                  </div>
                </div>
              </div>

              {/* Step 2: Choose Paste Mode & Copy */}
              <div className="p-3.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-3">
                <div className="flex items-center space-x-2 font-bold text-slate-800 dark:text-slate-200">
                  <span className="w-5 h-5 rounded-full bg-hkbu-blue-600 text-white flex items-center justify-center text-[11px]">2</span>
                  <span>Choose Your Setup Situation & Copy</span>
                </div>

                <div className="pl-7 space-y-3">
                  {/* Mode Selector Toggle */}
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setWbPasteMode('full')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                        wbPasteMode === 'full'
                          ? 'bg-hkbu-blue-700 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      Option A: Fresh Setup / Overwrite Entire File
                    </button>
                    <button
                      type="button"
                      onClick={() => setWbPasteMode('array')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                        wbPasteMode === 'array'
                          ? 'bg-hkbu-blue-700 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      Option B: Merge with Existing Custom Models
                    </button>
                  </div>

                  {/* Mode explanation */}
                  {wbPasteMode === 'full' ? (
                    <div className="p-2.5 rounded bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300 space-y-1">
                      <p className="font-semibold">Option A (Recommended for new users):</p>
                      <p>If your <code>models.json</code> is empty or you want all 13 HKBU models ready-to-go, click <strong>Copy Full models.json</strong> below and replace the entire file contents.</p>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-[11px] text-blue-800 dark:text-blue-300 space-y-1">
                      <p className="font-semibold">Option B (For users who already have other models configured):</p>
                      <p>Open your existing <code>models.json</code>. Inside your <code>&quot;models&quot;: [ ... ]</code> square brackets, add a comma <code>,</code> and paste these model objects directly inside the brackets.</p>
                    </div>
                  )}

                  {/* Code Block with Copy Button */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-slate-500">
                        {wbPasteMode === 'full' ? 'Full File ({ "models": [ ... ] })' : 'Models Array Only ([ ... ])'}
                      </span>
                      <button
                        onClick={() => copyText(wbPasteMode === 'full' ? workbuddyFullJson : workbuddyArrayOnlyJson, 'wb-json')}
                        className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1 cursor-pointer"
                      >
                        {copiedField === 'wb-json' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedField === 'wb-json' ? 'Copied to Clipboard!' : wbPasteMode === 'full' ? 'Copy Full models.json' : 'Copy Array Only [...]'}</span>
                      </button>
                    </div>
                    <pre className="max-h-72 p-3.5 rounded-lg bg-slate-900 text-slate-100 font-mono text-xs overflow-y-auto overflow-x-auto border border-slate-800">
                      <code>{wbPasteMode === 'full' ? workbuddyFullJson : workbuddyArrayOnlyJson}</code>
                    </pre>
                  </div>
                </div>
              </div>

              {/* Step 3: Save and Restart */}
              <div className="p-3.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                <div className="flex items-center space-x-2 font-bold text-slate-800 dark:text-slate-200">
                  <span className="w-5 h-5 rounded-full bg-hkbu-blue-600 text-white flex items-center justify-center text-[11px]">3</span>
                  <span>Save and Restart WorkBuddy</span>
                </div>
                <p className="pl-7 text-slate-600 dark:text-slate-300 text-[11px]">
                  Save the file in your text editor and restart the WorkBuddy desktop application. All 13 HKBU models will appear immediately in your chat and agent model dropdowns!
                </p>
              </div>
            </div>

            {/* Note on Embedding models */}
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-800 dark:text-amber-200 flex items-start space-x-2.5">
              <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold">Notice on Embedding Models:</span>
                <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                  WorkBuddy’s <code>models.json</code> schema is designed strictly for Chat/Completions models. Do not add embedding models (<code>text-embedding-3-small/large</code>) to <code>models.json</code>, as WorkBuddy will send chat messages to them instead of vector inputs. For embeddings, call <code>{baseUrl}/embeddings</code> via scripts or vector search services.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* VS Code Preset (Continue & Cline) */}
        {activePreset === 'vscode' && (
          <div className="space-y-6">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Connecting VS Code Extensions
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                Use your HKBU model quota in popular VS Code extensions like <strong>Continue</strong> or <strong>Cline</strong>:
              </p>
            </div>

            {/* Sub-tabs for VS Code */}
            <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2">
              <button
                type="button"
                onClick={() => setVscodeSubTab('continue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  vscodeSubTab === 'continue'
                    ? 'bg-hkbu-blue-100 dark:bg-hkbu-blue-900/60 text-hkbu-blue-800 dark:text-hkbu-blue-200'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Option A: Continue (~/.continue/config.json)
              </button>
              <button
                type="button"
                onClick={() => setVscodeSubTab('cline')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  vscodeSubTab === 'cline'
                    ? 'bg-hkbu-blue-100 dark:bg-hkbu-blue-900/60 text-hkbu-blue-800 dark:text-hkbu-blue-200'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Option B: Cline / Roo Code Settings
              </button>
            </div>

            {vscodeSubTab === 'continue' && (
              <div className="space-y-4 animate-fadeIn p-4 rounded-xl bg-slate-50 dark:bg-slate-850/40 border border-slate-200 dark:border-slate-800 text-xs">
                {/* Step 1 */}
                <div className="p-3.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <div className="flex items-center space-x-2 font-bold text-slate-800 dark:text-slate-200">
                    <span className="w-5 h-5 rounded-full bg-hkbu-blue-600 text-white flex items-center justify-center text-[11px]">1</span>
                    <span>Open config.json Directly in VS Code</span>
                  </div>
                  <p className="pl-7 text-[11px] text-slate-600 dark:text-slate-300">
                    Click the <strong>Continue</strong> icon on the left activity bar of VS Code, then click the gear icon (<strong>⚙️</strong>) in the bottom right corner of the Continue panel. VS Code will immediately open your <code>config.json</code> in the editor!
                  </p>
                  <p className="pl-7 font-mono text-[10px] text-slate-400">
                    File path: <code>~/.continue/config.json</code> (or <code>%USERPROFILE%\.continue\config.json</code> on Windows)
                  </p>
                </div>

                {/* Step 2 */}
                <div className="p-3.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center space-x-2 font-bold text-slate-800 dark:text-slate-200">
                    <span className="w-5 h-5 rounded-full bg-hkbu-blue-600 text-white flex items-center justify-center text-[11px]">2</span>
                    <span>Paste Pre-Configured JSON</span>
                  </div>
                  <div className="pl-7 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Includes all 13 chat models, autocomplete, and embeddings:</span>
                      <button
                        onClick={() => copyText(vscodeContinueJson, 'continue-json')}
                        className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1 cursor-pointer"
                      >
                        {copiedField === 'continue-json' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedField === 'continue-json' ? 'Copied' : 'Copy Continue Config'}</span>
                      </button>
                    </div>
                    <pre className="max-h-72 p-3.5 rounded-lg bg-slate-900 text-slate-100 font-mono text-xs overflow-y-auto overflow-x-auto border border-slate-800">
                      <code>{vscodeContinueJson}</code>
                    </pre>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="p-3.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                  <div className="flex items-center space-x-2 font-bold text-slate-800 dark:text-slate-200">
                    <span className="w-5 h-5 rounded-full bg-hkbu-blue-600 text-white flex items-center justify-center text-[11px]">3</span>
                    <span>Save (Instant Hot Reload)</span>
                  </div>
                  <p className="pl-7 text-[11px] text-slate-600 dark:text-slate-300">
                    Press <code>Cmd+S</code> (Mac) or <code>Ctrl+S</code> (Windows). Continue automatically hot-reloads with zero restart required.
                  </p>
                </div>
              </div>
            )}

            {vscodeSubTab === 'cline' && (
              <div className="space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Cline / Roo Code Provider Configuration:
                  </span>
                  <button
                    onClick={() => copyText(vscodeClineJson, 'cline-json')}
                    className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedField === 'cline-json' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'cline-json' ? 'Copied' : 'Copy Cline Settings'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                    <span className="font-semibold text-slate-500 block">API Provider</span>
                    <p className="font-mono text-slate-800 dark:text-slate-200">OpenAI Compatible</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                    <span className="font-semibold text-slate-500 block">Base URL</span>
                    <p className="font-mono text-slate-800 dark:text-slate-200 truncate">{baseUrl}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                    <span className="font-semibold text-slate-500 block">API Key</span>
                    <p className="font-mono text-slate-800 dark:text-slate-200 truncate">{effectiveKey}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                    <span className="font-semibold text-slate-500 block">Model ID</span>
                    <p className="font-mono text-slate-800 dark:text-slate-200">gpt-4.1 / gpt-5 / deepseek-v4-flash</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cursor Preset */}
        {activePreset === 'cursor' && (
          <div className="space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Connecting Cursor AI Editor
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Use your HKBU model quota directly inside Cursor for code completions and agent chat:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700 dark:text-slate-300 pl-1">
              <li>Open Cursor → <strong>Settings</strong> → <strong>Models</strong>.</li>
              <li>Toggle <strong>OpenAI API Key</strong> to Enabled.</li>
              <li>Enter your Gateway API Key: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-xs">{effectiveKey}</code></li>
              <li>Under <strong>Override OpenAI Base URL</strong>, check the box and enter: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-xs">{baseUrl}</code></li>
              <li>Add custom model names using the comma-separated list below.</li>
            </ol>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">All Supported Model IDs:</span>
                <button
                  onClick={() => copyText(chatModelNamesList, 'cursor-models')}
                  className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1 cursor-pointer"
                >
                  {copiedField === 'cursor-models' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedField === 'cursor-models' ? 'Copied' : 'Copy Model IDs'}</span>
                </button>
              </div>
              <p className="font-mono text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-750 break-all select-all">
                {chatModelNamesList}
              </p>
            </div>
          </div>
        )}

        {/* Cherry Studio / NextChat Preset */}
        {activePreset === 'nextchat' && (
          <div className="space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Connecting Cherry Studio & NextChat
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Modern multi-model desktop clients for productivity and research:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">API Host / Endpoint</span>
                  <button
                    onClick={() => copyText(baseUrl, 'nc-url')}
                    className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedField === 'nc-url' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedField === 'nc-url' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-750">
                  {baseUrl}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">API Key</span>
                  <button
                    onClick={() => copyText(effectiveKey, 'nc-key')}
                    className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedField === 'nc-key' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedField === 'nc-key' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-750">
                  {effectiveKey}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Custom Models String (Comma Separated):</span>
                <button
                  onClick={() => copyText(allModelNamesList, 'nc-models')}
                  className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1 cursor-pointer"
                >
                  {copiedField === 'nc-models' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedField === 'nc-models' ? 'Copied' : 'Copy Model List'}</span>
                </button>
              </div>
              <p className="font-mono text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-750 break-all select-all">
                {allModelNamesList}
              </p>
            </div>
          </div>
        )}

        {/* Chatbox Preset */}
        {activePreset === 'chatbox' && (
          <div className="space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Connecting Chatbox
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Chatbox is an easy-to-use desktop application for chatting with AI models.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Step 1: Settings</span>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Open Chatbox Settings → Model Provider → choose <strong>OpenAI API</strong>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">API Host / Base URL</span>
                  <button
                    onClick={() => copyText(baseUrl, 'chatbox-url')}
                    className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedField === 'chatbox-url' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedField === 'chatbox-url' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-750">
                  {baseUrl}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">API Key</span>
                  <button
                    onClick={() => copyText(effectiveKey, 'chatbox-key')}
                    className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedField === 'chatbox-key' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedField === 'chatbox-key' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-750">
                  {effectiveKey}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Step 3: Model</span>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Select or type any model: <code>gpt-4.1</code>, <code>gpt-5</code>, <code>deepseek-v4-flash</code>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Dify / Open WebUI Preset */}
        {activePreset === 'dify' && (
          <div className="space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Connecting Dify, LibreChat, or Open WebUI
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Add HKBU GenAI Gateway as an OpenAI-compatible provider:
            </p>
            <div className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs space-y-2 overflow-x-auto border border-slate-800">
              <p><span className="text-slate-400">Provider:</span> OpenAI Compatible</p>
              <p><span className="text-slate-400">API Base URL:</span> {baseUrl}</p>
              <p><span className="text-slate-400">API Key:</span> {effectiveKey}</p>
              <p><span className="text-slate-400">Models:</span> {chatModelNamesList}</p>
            </div>
          </div>
        )}

        {/* Python Preset */}
        {activePreset === 'python' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Python (Official OpenAI SDK)
              </h3>
              <button
                onClick={() =>
                  copyText(
                    `from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${baseUrl}",\n    api_key="${effectiveKey}",\n)\n\nresponse = client.chat.completions.create(\n    model="gpt-4.1",\n    messages=[{"role": "user", "content": "Hello, HKBU AI!"}],\n)\nprint(response.choices[0].message.content)\n`,
                    'py-code'
                  )
                }
                className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1 cursor-pointer"
              >
                {copiedField === 'py-code' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>{copiedField === 'py-code' ? 'Copied code' : 'Copy code snippet'}</span>
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
{`from openai import OpenAI

# Initialize client pointing to HKBU Gateway
client = OpenAI(
    base_url="${baseUrl}",
    api_key="${effectiveKey}",
)

# Call any supported model
response = client.chat.completions.create(
    model="gpt-4.1",
    messages=[{"role": "user", "content": "Hello, HKBU AI!"}],
)

print(response.choices[0].message.content)`}
            </pre>
          </div>
        )}

        {/* cURL Preset */}
        {activePreset === 'curl' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                cURL / Command Line
              </h3>
              <button
                onClick={() =>
                  copyText(
                    `curl ${baseUrl}/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${effectiveKey}" \\\n  -d '{\n    "model": "gpt-4.1",\n    "messages": [{"role": "user", "content": "Hello"}]\n  }'`,
                    'curl-code'
                  )
                }
                className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1 cursor-pointer"
              >
                {copiedField === 'curl-code' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>{copiedField === 'curl-code' ? 'Copied' : 'Copy cURL'}</span>
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
{`curl ${baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${effectiveKey}" \\
  -d '{
    "model": "gpt-4.1",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
