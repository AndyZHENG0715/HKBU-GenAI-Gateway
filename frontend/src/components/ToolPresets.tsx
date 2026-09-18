import React, { useState } from 'react';
import { Copy, Check, MessageSquare, Code2, Terminal, Layers, Cpu } from 'lucide-react';
import { getBaseUrl } from '../lib/api';

interface ToolPresetsProps {
  apiKey: string;
}

export const ToolPresets: React.FC<ToolPresetsProps> = ({ apiKey }) => {
  const [activePreset, setActivePreset] = useState<'chatbox' | 'nextchat' | 'cursor' | 'dify' | 'python' | 'curl'>('chatbox');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const baseUrl = getBaseUrl();
  const effectiveKey = apiKey || 'your-gateway-api-key';

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
          Select your tool below to view exact setup instructions with your pre-filled credentials.
        </p>

        {/* Preset Selector Tabs */}
        <div className="mt-6 flex items-center space-x-2 overflow-x-auto pb-2">
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
            onClick={() => setActivePreset('nextchat')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activePreset === 'nextchat'
                ? 'bg-hkbu-blue-700 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>NextChat / Cherry Studio</span>
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
            <span>Cursor / VS Code</span>
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
                    className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1"
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
                    className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1"
                  >
                    {copiedField === 'chatbox-key' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedField === 'chatbox-key' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-750 truncate">
                  {effectiveKey}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Model Name</span>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Type in any model name like <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded font-mono">gpt-4.1</code> or <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded font-mono">deepseek-v4-flash</code>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* NextChat / Cherry Studio Preset */}
        {activePreset === 'nextchat' && (
          <div className="space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Connecting NextChat or Cherry Studio
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              In NextChat or Cherry Studio, select OpenAI as the model provider and enter:
            </p>
            <div className="space-y-3 pt-2">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 block">OpenAI Endpoint / Base URL</span>
                  <span className="font-mono text-xs text-slate-900 dark:text-white font-medium">{baseUrl}</span>
                </div>
                <button
                  onClick={() => copyText(baseUrl, 'nc-url')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 inline-flex items-center space-x-1"
                >
                  {copiedField === 'nc-url' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'nc-url' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 block">API Key</span>
                  <span className="font-mono text-xs text-slate-900 dark:text-white font-medium truncate max-w-xs block">{effectiveKey}</span>
                </div>
                <button
                  onClick={() => copyText(effectiveKey, 'nc-key')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 inline-flex items-center space-x-1"
                >
                  {copiedField === 'nc-key' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'nc-key' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
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
              <li>Enter your Gateway API Key: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-xs">{effectiveKey.slice(0, 14)}...</code></li>
              <li>Under <strong>Override OpenAI Base URL</strong>, check the box and enter: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-xs">{baseUrl}</code></li>
              <li>Add custom model names: <code className="font-mono text-xs">gpt-4.1</code>, <code className="font-mono text-xs">deepseek-v4-flash</code>.</li>
            </ol>
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
            <div className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs space-y-2 overflow-x-auto">
              <p><span className="text-slate-400">Provider:</span> OpenAI Compatible</p>
              <p><span className="text-slate-400">API Base URL:</span> {baseUrl}</p>
              <p><span className="text-slate-400">API Key:</span> {effectiveKey}</p>
              <p><span className="text-slate-400">Models:</span> gpt-4.1, gpt-5, deepseek-v4-flash, gemini-2.5-pro, qwen3-max</p>
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
                className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1"
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
                className="text-xs text-hkbu-blue-600 dark:text-hkbu-blue-400 font-medium hover:underline inline-flex items-center space-x-1"
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
