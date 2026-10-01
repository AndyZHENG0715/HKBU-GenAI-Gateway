import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  Bot,
  User,
  Trash2,
  Key,
  Square,
  AlertCircle,
  Copy,
  Check,
  RotateCw,
  Edit3,
  Plus,
  MessageSquare,
  History,
  Sparkles,
  Zap,
  Folder,
  Terminal,
  Globe,
  Calculator,
  CheckCircle2,
  FolderPlus,
} from 'lucide-react';
import { SUPPORTED_MODELS } from '../lib/models';
import { streamChatCompletion, StreamChunk } from '../lib/api';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBox } from './ThinkingBox';
import { ToolCallCard } from './ToolCallCard';
import { ToolCallExecution } from '../lib/agent/types';
import { runAgentLoop } from '../lib/agent/loop';
import { getAllAvailableTools } from '../lib/agent/tools/registry';
import { probeCompanion } from '../lib/agent/tools/localCompanion';
import {
  getWorkspaceDirectoryName,
  promptSelectDirectory,
  isFileSystemAccessSupported,
} from '../lib/agent/tools/browserFs';

export interface PlaygroundMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoning?: string;
  isThinking?: boolean;
  error?: string;
  timestamp?: number;
  toolCalls?: ToolCallExecution[];
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: PlaygroundMessage[];
  isAgentMode?: boolean;
}

const STORAGE_KEY_SESSIONS = 'hkbu_playground_sessions_v2';
const STORAGE_KEY_ACTIVE = 'hkbu_playground_active_session_v2';

const createDefaultSession = (): ChatSession => ({
  id: `session-${Date.now()}`,
  title: 'New Conversation',
  model: 'gpt-4.1',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isAgentMode: true,
  messages: [
    {
      id: `msg-${Date.now()}-welcome`,
      role: 'assistant',
      content:
        'Hello! I am your HKBU GenAI Assistant. In Agent Mode, I can execute Python in your browser (via WebAssembly), analyze datasets, generate charts, and inspect local files—with zero server overhead. How can I assist you today?',
      timestamp: Date.now(),
    },
  ],
});

interface PlaygroundProps {
  currentApiKey: string;
}

export const Playground: React.FC<PlaygroundProps> = ({ currentApiKey }) => {
  const [apiKey, setApiKey] = useState(currentApiKey || '');
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SESSIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return [createDefaultSession()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    try {
      const savedActive = localStorage.getItem(STORAGE_KEY_ACTIVE);
      if (savedActive && sessions.some((s) => s.id === savedActive)) {
        return savedActive;
      }
    } catch {
      // ignore
    }
    return sessions[0]?.id || '';
  });

  const [showSidebar, setShowSidebar] = useState(true);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentProgress, setAgentProgress] = useState<string | null>(null);
  const [workspaceDir, setWorkspaceDir] = useState<string>(() => getWorkspaceDirectoryName());
  const [companionConnected, setCompanionConnected] = useState<boolean>(false);

  useEffect(() => {
    probeCompanion().then((res) => {
      if (res.connected) setCompanionConnected(true);
    });
  }, []);

  // Message action states
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Active Session helper
  const currentSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || sessions[0];
  }, [sessions, activeSessionId]);

  const selectedModel = currentSession?.model || 'gpt-4.1';
  const isAgentMode = currentSession?.isAgentMode ?? true;

  const handleToggleAgentMode = () => {
    updateCurrentSession((s) => ({
      ...s,
      isAgentMode: !(s.isAgentMode ?? true),
      updatedAt: Date.now(),
    }));
  };

  const handleSelectDirectory = async () => {
    try {
      const name = await promptSelectDirectory();
      setWorkspaceDir(name);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Could not select local directory');
      }
    }
  };

  // Persist sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    } catch {
      // ignore
    }
  }, [sessions]);

  // Persist active session ID
  useEffect(() => {
    if (activeSessionId) {
      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE, activeSessionId);
      } catch {
        // ignore
      }
    }
  }, [activeSessionId]);

  // Sync API key if updated externally
  useEffect(() => {
    if (currentApiKey) {
      setApiKey(currentApiKey);
    }
  }, [currentApiKey]);

  // Auto scroll - strictly scroll ONLY the inner messages container, never dragging the window
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [currentSession?.messages, isStreaming]);

  const updateCurrentSession = (updater: (session: ChatSession) => ChatSession) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === currentSession.id ? updater(s) : s))
    );
  };

  const handleModelChange = (newModel: string) => {
    updateCurrentSession((s) => ({ ...s, model: newModel, updatedAt: Date.now() }));
  };

  const handleNewChat = () => {
    if (isStreaming) handleStop();
    const newSession = createDefaultSession();
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setInput('');
    setError(null);
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStreaming && sessionId === activeSessionId) {
      handleStop();
    }
    const remaining = sessions.filter((s) => s.id !== sessionId);
    if (remaining.length === 0) {
      const fresh = createDefaultSession();
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
    } else {
      setSessions(remaining);
      if (sessionId === activeSessionId) {
        setActiveSessionId(remaining[0].id);
      }
    }
  };

  const handleClearAllSessions = () => {
    if (window.confirm('Are you sure you want to clear all conversation history?')) {
      handleStop();
      const fresh = createDefaultSession();
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
      setError(null);
    }
  };

  const executeCompletion = async (
    allMessages: PlaygroundMessage[],
    assistantMsgId: string,
    modelToUse: string
  ) => {
    if (!apiKey.trim()) {
      setError('Please enter or generate a Gateway API Key first.');
      setIsStreaming(false);
      return;
    }

    setError(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Filter valid conversation history to send upstream
    // Include messages before the assistant placeholder that have non-empty content
    const historyCandidates = allMessages
      .filter((m) => m.id !== assistantMsgId)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim());

    const firstUserIdx = historyCandidates.findIndex((m) => m.role === 'user');
    const validHistory = firstUserIdx >= 0 ? historyCandidates.slice(firstUserIdx) : historyCandidates;

    const payloadMessages = validHistory.map((m) => ({
      role: m.role,
      content: m.content || '',
    }));

    if (isAgentMode) {
      setAgentProgress('Initializing agent...');
      await runAgentLoop({
        model: modelToUse,
        messages: payloadMessages,
        tools: getAllAvailableTools(companionConnected),
        gatewayKey: apiKey,
        maxIterations: 10,
        signal: controller.signal,
        onStepStart: (stepIndex) => {
          setAgentProgress(`Step ${stepIndex}/10: Reasoning and selecting tools...`);
        },
        onStepChunk: (_stepIndex, chunk) => {
          let parsedReasoning = chunk.reasoning_content || '';
          let parsedContent = chunk.content || '';
          let currentlyThinking = Boolean(parsedReasoning && !parsedContent);

          if (parsedContent.includes('<think>')) {
            if (parsedContent.includes('</think>')) {
              const parts = parsedContent.split('</think>');
              const thinkPart = parts[0].replace('<think>', '').trim();
              const afterPart = parts.slice(1).join('</think>').trimStart();
              parsedReasoning = [parsedReasoning, thinkPart].filter(Boolean).join('\n\n');
              parsedContent = afterPart;
              currentlyThinking = false;
            } else {
              const thinkPart = parsedContent.replace('<think>', '').trimStart();
              parsedReasoning = [parsedReasoning, thinkPart].filter(Boolean).join('\n\n');
              parsedContent = '';
              currentlyThinking = true;
            }
          }

          updateCurrentSession((session) => ({
            ...session,
            updatedAt: Date.now(),
            messages: session.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: parsedContent,
                    reasoning: parsedReasoning,
                    toolCalls: chunk.toolCalls || m.toolCalls,
                    isThinking: currentlyThinking,
                  }
                : m
            ),
          }));
        },
        onToolStart: (stepIndex, tc) => {
          setAgentProgress(`Step ${stepIndex}/10: Running ${tc.toolName}...`);
          updateCurrentSession((session) => ({
            ...session,
            messages: session.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    toolCalls: (m.toolCalls || []).map((t) => (t.callId === tc.callId ? { ...tc } : t)),
                  }
                : m
            ),
          }));
        },
        onToolFinish: (stepIndex, tc) => {
          setAgentProgress(`Step ${stepIndex}/10: Completed ${tc.toolName}`);
          updateCurrentSession((session) => ({
            ...session,
            messages: session.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    toolCalls: (m.toolCalls || []).map((t) => (t.callId === tc.callId ? { ...tc } : t)),
                  }
                : m
            ),
          }));
        },
        onError: (err) => {
          const errorMsg = err.message || 'Agent encountered an error';
          setError(errorMsg);
          setIsStreaming(false);
          setAgentProgress(null);
          updateCurrentSession((session) => ({
            ...session,
            messages: session.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, isThinking: false, error: errorMsg } : m
            ),
          }));
        },
        onFinish: () => {
          setIsStreaming(false);
          setAgentProgress(null);
          abortControllerRef.current = null;
          updateCurrentSession((session) => ({
            ...session,
            messages: session.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, isThinking: false } : m
            ),
          }));
        },
      });
      return;
    }

    let rawReasoning = '';
    let rawContent = '';

    await streamChatCompletion({
      model: modelToUse,
      messages: payloadMessages,
      gatewayKey: apiKey,
      signal: controller.signal,
      onChunk: (chunk: StreamChunk) => {
        if (chunk.reasoning_content) {
          rawReasoning += chunk.reasoning_content;
        }
        if (chunk.content) {
          rawContent += chunk.content;
        }

        // Check if content contains <think> tags (DeepSeek raw output)
        let parsedReasoning = rawReasoning;
        let parsedContent = rawContent;
        let currentlyThinking = false;

        if (rawContent.includes('<think>')) {
          if (rawContent.includes('</think>')) {
            const parts = rawContent.split('</think>');
            const thinkPart = parts[0].replace('<think>', '').trim();
            const afterPart = parts.slice(1).join('</think>').trimStart();
            parsedReasoning = [rawReasoning, thinkPart].filter(Boolean).join('\n\n');
            parsedContent = afterPart;
            currentlyThinking = false;
          } else {
            const thinkPart = rawContent.replace('<think>', '').trimStart();
            parsedReasoning = [rawReasoning, thinkPart].filter(Boolean).join('\n\n');
            parsedContent = '';
            currentlyThinking = true;
          }
        } else {
          if (rawReasoning && !rawContent) {
            currentlyThinking = true;
          } else {
            currentlyThinking = false;
          }
        }

        updateCurrentSession((session) => ({
          ...session,
          updatedAt: Date.now(),
          messages: session.messages.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: parsedContent,
                  reasoning: parsedReasoning,
                  isThinking: currentlyThinking,
                  error: undefined,
                }
              : m
          ),
        }));
      },
      onError: (err) => {
        const errorMsg = err.message || 'Failed to complete request';
        setError(errorMsg);
        setIsStreaming(false);
        updateCurrentSession((session) => ({
          ...session,
          messages: session.messages.map((m) =>
            m.id === assistantMsgId
              ? { ...m, isThinking: false, error: errorMsg }
              : m
          ),
        }));
      },
      onFinish: () => {
        setIsStreaming(false);
        abortControllerRef.current = null;
        updateCurrentSession((session) => ({
          ...session,
          messages: session.messages.map((m) =>
            m.id === assistantMsgId ? { ...m, isThinking: false } : m
          ),
        }));
      },
    });
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isStreaming) return;

    setError(null);
    const userMsg: PlaygroundMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const assistantMsgId = `msg-${Date.now() + 1}-assistant`;
    const assistantMsg: PlaygroundMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      isThinking: selectedModel.toLowerCase().includes('deepseek'),
      timestamp: Date.now(),
    };

    const isFirstUserMessage = !currentSession.messages.some((m) => m.role === 'user');
    const newTitle = isFirstUserMessage
      ? text.slice(0, 30) + (text.length > 30 ? '...' : '')
      : currentSession.title;

    const newMessages = [...currentSession.messages, userMsg, assistantMsg];

    updateCurrentSession((s) => ({
      ...s,
      title: newTitle,
      updatedAt: Date.now(),
      messages: newMessages,
    }));

    setInput('');
    await executeCompletion(newMessages, assistantMsgId, selectedModel);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setAgentProgress(null);
    updateCurrentSession((session) => ({
      ...session,
      messages: session.messages.map((m) => ({ ...m, isThinking: false })),
    }));
  };

  // Retry / Regenerate assistant message
  const handleRetry = async (assistantMsgIndex: number, modelOverride?: string) => {
    if (isStreaming) return;

    const msgs = [...currentSession.messages];
    let precedingUserIdx = assistantMsgIndex - 1;
    while (precedingUserIdx >= 0 && msgs[precedingUserIdx].role !== 'user') {
      precedingUserIdx--;
    }

    if (precedingUserIdx < 0) {
      // If no preceding user message, find the last user message in the list
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') {
          precedingUserIdx = i;
          break;
        }
      }
    }

    if (precedingUserIdx < 0) return;

    const targetModel = modelOverride || selectedModel;

    const truncated = msgs.slice(0, precedingUserIdx + 1);
    const newAssistantMsgId = `msg-${Date.now()}-assistant`;
    const newAssistantMsg: PlaygroundMessage = {
      id: newAssistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      isThinking: targetModel.toLowerCase().includes('deepseek'),
      timestamp: Date.now(),
    };

    const updatedMessages = [...truncated, newAssistantMsg];

    updateCurrentSession((s) => ({
      ...s,
      model: targetModel,
      updatedAt: Date.now(),
      messages: updatedMessages,
    }));

    setError(null);
    await executeCompletion(updatedMessages, newAssistantMsgId, targetModel);
  };

  // Edit user message
  const handleStartEdit = (msg: PlaygroundMessage) => {
    if (isStreaming) return;
    setEditingMsgId(msg.id);
    setEditInput(msg.content);
  };

  const handleSaveEdit = async (msgIndex: number) => {
    if (!editInput.trim() || isStreaming) return;

    const msgs = [...currentSession.messages];
    const userMsg = msgs[msgIndex];
    if (!userMsg || userMsg.role !== 'user') return;

    const truncated = msgs.slice(0, msgIndex);
    const updatedUserMsg: PlaygroundMessage = {
      ...userMsg,
      content: editInput.trim(),
      timestamp: Date.now(),
    };

    const assistantMsgId = `msg-${Date.now()}-assistant`;
    const assistantMsg: PlaygroundMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      isThinking: selectedModel.toLowerCase().includes('deepseek'),
      timestamp: Date.now(),
    };

    const updatedMessages = [...truncated, updatedUserMsg, assistantMsg];

    setEditingMsgId(null);
    setEditInput('');

    updateCurrentSession((s) => ({
      ...s,
      updatedAt: Date.now(),
      messages: updatedMessages,
    }));

    setError(null);
    await executeCompletion(updatedMessages, assistantMsgId, selectedModel);
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch {
      // ignore
    }
  };

  const quickPrompts = [
    'Explain how Large Language Models work in simple words.',
    'Brainstorm 3 creative research topics about AI ethics.',
    'Write a polite email asking a professor for a project meeting.',
    'Compare the pros and cons of qualitative vs quantitative research.',
  ];

  const chatModels = SUPPORTED_MODELS.filter((m) => m.kind === 'chat');

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col h-[780px] max-h-[85vh] transition-all">
      {/* Playground Top Bar */}
      <div className="p-3 sm:px-5 bg-slate-50/90 dark:bg-slate-850 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Toggle History Sidebar */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              showSidebar
                ? 'bg-hkbu-blue-50 dark:bg-hkbu-blue-900/40 text-hkbu-blue-700 dark:text-hkbu-blue-300 border-hkbu-blue-200 dark:border-hkbu-blue-800'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
            title={showSidebar ? 'Hide History Sidebar' : 'Show History Sidebar'}
          >
            <History className="w-4 h-4" />
          </button>

          <div className="w-8 h-8 rounded-lg bg-hkbu-blue-100 dark:bg-hkbu-blue-900/60 text-hkbu-blue-700 dark:text-hkbu-blue-300 flex items-center justify-center font-bold text-xs">
            AI
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
              Interactive Chat Playground
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              HKBU multi-turn conversational testing
            </p>
          </div>
        </div>

        {/* Model Selector & Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto">
          {/* Mode Switcher Button */}
          <button
            onClick={handleToggleAgentMode}
            disabled={isStreaming}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs ${
              isAgentMode
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold'
                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
            }`}
            title={isAgentMode ? 'Switch to Standard Chat' : 'Enable Autonomous Agent Mode'}
          >
            <Zap className={`w-3.5 h-3.5 ${isAgentMode ? 'fill-current' : ''}`} />
            <span>{isAgentMode ? 'Agent Mode' : 'Chat Mode'}</span>
          </button>

          {/* Model Dropdown */}
          <select
            value={selectedModel}
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={isStreaming}
            className="text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-hkbu-blue-500 shadow-sm cursor-pointer"
          >
            {chatModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.provider})
              </option>
            ))}
          </select>

          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            disabled={isStreaming}
            title="Start new conversation"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-hkbu-blue-50 dark:bg-hkbu-blue-950/60 text-hkbu-blue-700 dark:text-hkbu-blue-300 hover:bg-hkbu-blue-100 border border-hkbu-blue-200 dark:border-hkbu-blue-800/80 flex items-center space-x-1 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Chat</span>
          </button>
        </div>
      </div>

      {/* Gateway Key Banner */}
      <div className="px-4 sm:px-6 py-2 bg-hkbu-blue-50/50 dark:bg-hkbu-blue-950/20 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-300 font-medium">
          <Key className="w-3.5 h-3.5 text-hkbu-gold-500" />
          <span>Active Key:</span>
          {apiKey ? (
            <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
              {apiKey.slice(0, 14)}...
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

      {/* Agent Capabilities & Workspace Toolbar */}
      {isAgentMode && (
        <div className="px-4 sm:px-6 py-2 bg-slate-100/70 dark:bg-slate-850/80 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Active tools badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1">
              Tools:
            </span>
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium">
              <Terminal className="w-3 h-3 text-emerald-500" />
              <span>Python (Wasm)</span>
            </span>
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-[11px] font-medium">
              <Globe className="w-3 h-3 text-sky-500" />
              <span>Web Fetch</span>
            </span>
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px] font-medium">
              <Calculator className="w-3 h-3 text-purple-500" />
              <span>Calculator</span>
            </span>
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-medium">
              <Folder className="w-3 h-3 text-amber-500" />
              <span>File System</span>
            </span>
            {companionConnected ? (
              <span
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px] font-medium shadow-xs"
                title="Connected to local companion node (127.0.0.1:9001). Host terminal execution active."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Host Terminal (Node 9001)</span>
              </span>
            ) : (
              <button
                onClick={async () => {
                  const res = await probeCompanion();
                  setCompanionConnected(res.connected);
                  if (!res.connected) {
                    alert('Local Companion not detected on 127.0.0.1:9001.\n\nTo enable local host terminal execution, run:\npython companion/hkbu_genai_companion.py');
                  }
                }}
                className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[11px] text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer"
                title="Connect local terminal companion daemon"
              >
                <span>+ Local Node</span>
              </button>
            )}
          </div>

          {/* Local Directory Selector or Agent Step Progress */}
          <div className="flex items-center space-x-2">
            {agentProgress && (
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-medium text-[11px] animate-pulse">
                <Sparkles className="w-3 h-3 text-blue-500 animate-spin" />
                <span>{agentProgress}</span>
              </div>
            )}

            {isFileSystemAccessSupported() && (
              <button
                onClick={handleSelectDirectory}
                disabled={isStreaming}
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-medium text-[11px] transition-colors cursor-pointer shadow-xs"
                title="Select a local workspace folder for the agent to inspect or edit"
              >
                {workspaceDir ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300 truncate max-w-[130px]">
                      {workspaceDir}
                    </span>
                  </>
                ) : (
                  <>
                    <FolderPlus className="w-3.5 h-3.5 text-slate-500" />
                    <span>Select Local Folder</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error Alert Banner with prominent Retry Button */}
      {error && (
        <div className="px-4 sm:px-6 py-2.5 bg-red-50 dark:bg-red-950/70 border-b border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="break-words font-medium">{error}</span>
          </div>
          <div className="flex items-center space-x-2 ml-auto">
            <button
              onClick={() => handleRetry(currentSession.messages.length - 1)}
              disabled={isStreaming}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md text-[11px] font-semibold flex items-center space-x-1 shadow-sm transition-colors cursor-pointer"
            >
              <RotateCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 font-bold px-1.5 py-0.5 cursor-pointer"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Main Container: Sidebar + Chat Stream */}
      <div className="flex-1 flex overflow-hidden">
        {/* History Sidebar */}
        {showSidebar && (
          <div className="w-60 sm:w-64 border-r border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex flex-col flex-shrink-0 transition-all">
            {/* Sidebar Top: New Chat button */}
            <div className="p-3 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
              <button
                onClick={handleNewChat}
                disabled={isStreaming}
                className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-hkbu-blue-700 hover:bg-hkbu-blue-800 text-white shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Conversation</span>
              </button>
            </div>

            {/* Sidebar List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.map((sess) => {
                const isActive = sess.id === activeSessionId;
                return (
                  <div
                    key={sess.id}
                    onClick={() => {
                      if (isStreaming) handleStop();
                      setActiveSessionId(sess.id);
                      setError(null);
                    }}
                    className={`group flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                      isActive
                        ? 'bg-hkbu-blue-100/70 dark:bg-hkbu-blue-900/50 text-hkbu-blue-900 dark:text-white font-medium border border-hkbu-blue-200 dark:border-hkbu-blue-800/80 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate mr-1">
                      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                      <span className="truncate">{sess.title}</span>
                    </div>

                    <button
                      onClick={(e) => handleDeleteSession(sess.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-950 text-slate-400 hover:text-red-600 transition-opacity"
                      title="Delete chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Sidebar Bottom: Clear All History */}
            <div className="p-2.5 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
              <button
                onClick={handleClearAllSessions}
                className="w-full flex items-center justify-center space-x-1 py-1 px-2 text-[11px] text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear All History</span>
              </button>
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
          {/* Messages Scroll Area */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 overscroll-contain"
          >
            {currentSession.messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const isEditing = editingMsgId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex items-start space-x-3 ${
                    isUser ? 'flex-row-reverse space-x-reverse' : 'flex-row'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5 ${
                      isUser
                        ? 'bg-hkbu-blue-700 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-hkbu-blue-700 dark:text-hkbu-blue-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  {/* Message Bubble + Action Toolbar Container */}
                  <div className={`max-w-[88%] sm:max-w-[80%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    {/* Bubble */}
                    <div
                      className={`w-full rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${
                        isUser
                          ? 'bg-hkbu-blue-700 text-white rounded-tr-none'
                          : 'bg-slate-50 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-tl-none'
                      }`}
                    >
                      {/* Inline User Editing Mode */}
                      {isEditing ? (
                        <div className="space-y-2 min-w-[260px] sm:min-w-[340px]">
                          <textarea
                            value={editInput}
                            onChange={(e) => setEditInput(e.target.value)}
                            rows={3}
                            className="w-full text-xs sm:text-sm p-2.5 rounded-lg bg-white dark:bg-slate-850 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-1 focus:ring-hkbu-blue-500"
                          />
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => setEditingMsgId(null)}
                              className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveEdit(index)}
                              className="px-3 py-1 text-xs font-semibold bg-hkbu-gold-500 hover:bg-hkbu-gold-400 text-slate-950 rounded shadow-sm transition-colors cursor-pointer"
                            >
                              Save & Submit
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Thinking Process Accordion for DeepSeek / Reasoning models */}
                          {!isUser && (msg.reasoning || msg.isThinking) && (
                            <ThinkingBox
                              reasoning={msg.reasoning || ''}
                              isThinking={msg.isThinking}
                            />
                          )}

                          {/* Tool Calls Rendering */}
                          {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
                            <div className="my-2 space-y-1.5 w-full">
                              {msg.toolCalls.map((tc) => (
                                <ToolCallCard key={tc.callId} toolCall={tc} />
                              ))}
                            </div>
                          )}

                          {/* Message Content with Rich Markdown Rendering */}
                          {isUser ? (
                            <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                          ) : (
                            <div>
                              {msg.content ? (
                                <MarkdownRenderer content={msg.content} />
                              ) : msg.isThinking ? (
                                <div className="text-xs text-slate-400 dark:text-slate-500 italic flex items-center space-x-1.5 py-1">
                                  <Sparkles className="w-3.5 h-3.5 animate-spin text-hkbu-gold-500" />
                                  <span>Generating reasoning thoughts...</span>
                                </div>
                              ) : isStreaming && index === currentSession.messages.length - 1 ? (
                                <span className="inline-block w-2 h-4 bg-hkbu-blue-500 animate-pulse ml-1 align-middle"></span>
                              ) : null}

                              {/* Error Box inside Assistant bubble if generation failed */}
                              {msg.error && (
                                <div className="mt-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/80 text-xs text-red-700 dark:text-red-300 space-y-2">
                                  <div className="flex items-start space-x-2">
                                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                      <p className="font-semibold">{msg.error}</p>
                                      <p className="text-[11px] text-red-600/90 dark:text-red-400/90 mt-0.5">
                                        {selectedModel.toLowerCase().includes('deepseek')
                                          ? 'HKBU DeepSeek deployment may be overloaded. Click Retry or switch to Gemini 2.5 Flash below.'
                                          : 'You can retry this prompt now.'}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <button
                                      onClick={() => handleRetry(index)}
                                      disabled={isStreaming}
                                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white flex items-center space-x-1 shadow-sm transition-colors cursor-pointer"
                                    >
                                      <RotateCw className="w-3 h-3" />
                                      <span>Retry Message</span>
                                    </button>
                                    {selectedModel.toLowerCase().includes('deepseek') && (
                                      <button
                                        onClick={() => {
                                          handleModelChange('gemini-2.5-flash');
                                          handleRetry(index, 'gemini-2.5-flash');
                                        }}
                                        disabled={isStreaming}
                                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 flex items-center space-x-1 transition-colors cursor-pointer shadow-xs"
                                      >
                                        <Zap className="w-3 h-3 text-hkbu-gold-500" />
                                        <span>Try Gemini 2.5 Flash</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Prominent Action Toolbar placed cleanly below each bubble */}
                    {!isEditing && (
                      <div className="mt-1.5 flex items-center space-x-2 text-xs">
                        {isUser ? (
                          /* User Actions: Edit & Copy */
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleStartEdit(msg)}
                              disabled={isStreaming}
                              type="button"
                              className="px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-500 hover:text-hkbu-blue-700 dark:text-slate-400 dark:hover:text-hkbu-blue-300 bg-slate-100/80 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs"
                              title="Edit prompt"
                            >
                              <Edit3 className="w-3 h-3 text-hkbu-blue-600 dark:text-hkbu-blue-400" />
                              <span>Edit</span>
                            </button>

                            <button
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              type="button"
                              className="px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100/80 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs"
                              title="Copy prompt"
                            >
                              {copiedMsgId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-500" />
                                  <span className="text-emerald-500">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          /* Assistant Actions: Retry & Copy */
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleRetry(index)}
                              disabled={isStreaming}
                              type="button"
                              className="px-2.5 py-0.5 rounded-md text-[11px] font-medium text-slate-600 hover:text-hkbu-blue-700 dark:text-slate-300 dark:hover:text-hkbu-blue-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs"
                              title="Regenerate this response"
                            >
                              <RotateCw className="w-3 h-3 text-hkbu-blue-600 dark:text-hkbu-blue-400" />
                              <span>Retry</span>
                            </button>

                            <button
                              onClick={() => handleCopyMessage(msg.id, msg.content || msg.reasoning || '')}
                              type="button"
                              className="px-2.5 py-0.5 rounded-md text-[11px] font-medium text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs"
                              title="Copy response"
                            >
                              {copiedMsgId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-500" />
                                  <span className="text-emerald-500">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Prompts if conversation is fresh */}
          {currentSession.messages.length <= 2 && (
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
                  className="p-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm transition-all cursor-pointer flex items-center justify-center"
                  title="Stop generating"
                >
                  <Square className="w-4 h-4 fill-white" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || isStreaming}
                  className="p-2.5 rounded-xl bg-hkbu-blue-700 hover:bg-hkbu-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-sm transition-all cursor-pointer flex items-center justify-center"
                  title="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
