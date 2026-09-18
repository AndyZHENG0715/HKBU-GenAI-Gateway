import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Trash2, Key, Square, AlertCircle, Copy, Check } from 'lucide-react';
import { SUPPORTED_MODELS } from '../lib/models';
import { streamChatCompletion, ChatMessage } from '../lib/api';

interface PlaygroundProps {
  currentApiKey: string;
}

export const Playground: React.FC<PlaygroundProps> = ({ currentApiKey }) => {
  const [apiKey, setApiKey] = useState(currentApiKey || '');
  const [selectedModel, setSelectedModel] = useState('gpt-4.1');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hello! I am connected to the HKBU GenAI Gateway. You can chat with me directly to test out any model without installing external software. What would you like to explore today?',
    },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync API key if updated externally
  useEffect(() => {
    if (currentApiKey) {
      setApiKey(currentApiKey);
    }
  }, [currentApiKey]);

  // Auto scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isStreaming) return;

    if (!apiKey.trim()) {
      setError('Please enter or generate a Gateway API Key first.');
      return;
    }

    setError(null);
    const userMsg: ChatMessage = { role: 'user', content: text };
    const newMessages: ChatMessage[] = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    // Prepare assistant placeholder
    const assistantMsgIndex = newMessages.length;
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Filter out initial welcome message if we want, or pass conversation
    const history = newMessages.map((m) => ({ role: m.role, content: m.content }));

    let streamedText = '';

    await streamChatCompletion({
      model: selectedModel,
      messages: history,
      gatewayKey: apiKey,
      signal: controller.signal,
      onChunk: (chunk) => {
        streamedText += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[assistantMsgIndex]) {
            updated[assistantMsgIndex] = {
              ...updated[assistantMsgIndex],
              content: streamedText,
            };
          }
          return updated;
        });
      },
      onError: (err) => {
        setError(err.message);
        setIsStreaming(false);
      },
      onFinish: () => {
        setIsStreaming(false);
        abortControllerRef.current = null;
      },
    });
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleClear = () => {
    handleStop();
    setMessages([
      {
        role: 'assistant',
        content: 'Conversation cleared. Select a model and send a message whenever you are ready!',
      },
    ]);
    setError(null);
  };

  const handleCopyMessage = (index: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const quickPrompts = [
    'Explain quantum computing in simple terms for a non-science student.',
    'Help me brainstorm 3 essay topics on the ethics of artificial intelligence.',
    'Write a polite email asking a professor for an assignment extension.',
    'Summarize the main differences between qualitative and quantitative research.',
  ];

  const chatModels = SUPPORTED_MODELS.filter((m) => m.kind === 'chat');

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col h-[750px] max-h-[85vh] transition-all">
      {/* Playground Top Bar */}
      <div className="p-4 sm:px-6 bg-slate-50/80 dark:bg-slate-850 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-hkbu-blue-100 dark:bg-hkbu-blue-900/60 text-hkbu-blue-700 dark:text-hkbu-blue-300 flex items-center justify-center font-bold text-xs">
            AI
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Interactive Chat Playground
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Test any HKBU model directly in your browser
            </p>
          </div>
        </div>

        {/* Model Selector & Key Settings */}
        <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto">
          {/* Model Dropdown */}
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isStreaming}
            className="text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-hkbu-blue-500 shadow-sm cursor-pointer"
          >
            {chatModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.provider})
              </option>
            ))}
          </select>

          {/* Clear Button */}
          <button
            onClick={handleClear}
            disabled={isStreaming || messages.length <= 1}
            title="Clear conversation"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-750 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Gateway Key Bar if key is missing or to allow manual entry */}
      <div className="px-4 sm:px-6 py-2 bg-hkbu-blue-50/50 dark:bg-hkbu-blue-950/20 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-300 font-medium">
          <Key className="w-3.5 h-3.5 text-hkbu-gold-500" />
          <span>Active Key:</span>
          {apiKey ? (
            <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
              {apiKey.slice(0, 15)}...
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">No key provided</span>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste hkbu-gw-... key"
            className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono w-40 sm:w-56 focus:outline-none focus:ring-1 focus:ring-hkbu-blue-500"
          />
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="px-4 sm:px-6 py-2.5 bg-red-50 dark:bg-red-950/60 border-b border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={index}
              className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
                  isUser
                    ? 'bg-hkbu-blue-700 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-hkbu-blue-700 dark:text-hkbu-blue-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Content */}
              <div
                className={`group relative max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 sm:p-4 text-sm leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-hkbu-blue-700 text-white rounded-tr-none'
                    : 'bg-slate-50 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-tl-none'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{msg.content || (isStreaming && index === messages.length - 1 ? <span className="inline-block w-2 h-4 bg-hkbu-blue-500 animate-pulse ml-1 align-middle"></span> : '')}</div>

                {/* Copy helper on assistant responses */}
                {!isUser && msg.content && (
                  <button
                    onClick={() => handleCopyMessage(index, msg.content)}
                    className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 p-1 rounded bg-white/80 dark:bg-slate-700/80 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-opacity"
                    title="Copy response"
                  >
                    {copiedIndex === index ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts (Only if message count is low) */}
      {messages.length <= 2 && (
        <div className="px-4 sm:px-6 py-2 bg-slate-50/50 dark:bg-slate-850/50 border-t border-slate-100 dark:border-slate-800/80">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
            Suggested Prompts
          </span>
          <div className="flex items-center space-x-2 overflow-x-auto pb-1">
            {quickPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSend(prompt)}
                disabled={isStreaming}
                className="whitespace-nowrap px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-slate-600 dark:text-slate-300 hover:border-hkbu-blue-400 hover:text-hkbu-blue-600 dark:hover:text-hkbu-blue-400 transition-all flex-shrink-0 cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat Input Bar */}
      <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message ${selectedModel}...`}
            disabled={isStreaming}
            className="flex-1 px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-hkbu-blue-500/30 focus:border-hkbu-blue-500 text-slate-900 dark:text-white placeholder-slate-400 transition-all"
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="p-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm transition-all cursor-pointer"
              title="Stop generating"
            >
              <Square className="w-4 h-4 fill-white" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="p-2.5 rounded-xl bg-hkbu-blue-700 hover:bg-hkbu-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-sm transition-all cursor-pointer"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
