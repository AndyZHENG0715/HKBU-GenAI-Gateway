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
  X,
  Download,
} from 'lucide-react';
import { SUPPORTED_MODELS } from '../lib/models';
import { streamChatCompletion, StreamChunk } from '../lib/api';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBox } from './ThinkingBox';
import { ToolCallCard } from './ToolCallCard';
import { ModelDropdown } from './ModelDropdown';
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
  const [showHelperModal, setShowHelperModal] = useState<boolean>(false);

  useEffect(() => {
    probeCompanion().then((res) => {
      if (res.connected) setCompanionConnected(true);
    });
  }, []);

  const handleOpenHelperModal = async () => {
    setShowHelperModal(true);
    const res = await probeCompanion();
    setCompanionConnected(res.connected);
  };

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
  const userMessageCount = useMemo(() => {
    return (currentSession?.messages || []).filter((m) => m.role === 'user').length;
  }, [currentSession?.messages]);

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
    // Include messages before the assistant placeholder that have non-empty content or executed tools
    const historyCandidates = allMessages
      .filter((m) => m.id !== assistantMsgId)
      .filter((m) => {
        if (m.role === 'user') {
          return Boolean(m.content && m.content.trim());
        }
        if (m.role === 'assistant') {
          return Boolean(
            (m.content && m.content.trim()) ||
            (m.toolCalls && m.toolCalls.length > 0)
          );
        }
        return false;
      });

    const firstUserIdx = historyCandidates.findIndex((m) => m.role === 'user');
    const validHistory = firstUserIdx >= 0 ? historyCandidates.slice(firstUserIdx) : historyCandidates;

    const payloadMessages = validHistory.map((m) => {
      let text = (m.content || '').trim();
      if (!text && m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        const names = m.toolCalls.map((t) => t.toolName).join(', ');
        text = `(Executed tools: ${names})`;
      }
      return {
        role: m.role,
        content: text || ' ',
      };
    });

    if (isAgentMode) {
      setAgentProgress('Initializing agent...');
      const accumulatedToolCalls: ToolCallExecution[] = [];
      let accumulatedReasoning = '';
      let latestAnswer = '';

      const upsertToolCall = (tc: ToolCallExecution, stepIndex?: number) => {
        const enriched: ToolCallExecution = {
          ...tc,
          stepIndex: tc.stepIndex ?? stepIndex,
        };
        const idx = accumulatedToolCalls.findIndex((t) => t.callId === enriched.callId);
        if (idx >= 0) {
          accumulatedToolCalls[idx] = { ...accumulatedToolCalls[idx], ...enriched };
        } else {
          accumulatedToolCalls.push(enriched);
        }
      };

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
        onStepChunk: (stepIndex, chunk) => {
          let stepReasoning = chunk.reasoning_content || '';
          let stepContent = chunk.content || '';

          if (stepContent.includes('<think>')) {
            if (stepContent.includes('</think>')) {
              const parts = stepContent.split('</think>');
              const thinkPart = parts[0].replace('<think>', '').trim();
              const afterPart = parts.slice(1).join('</think>').trimStart();
              stepReasoning = [stepReasoning, thinkPart].filter(Boolean).join('\n\n');
              stepContent = afterPart;
            } else {
              const thinkPart = stepContent.replace('<think>', '').trimStart();
              stepReasoning = [stepReasoning, thinkPart].filter(Boolean).join('\n\n');
              stepContent = '';
            }
          }

          if (chunk.toolCalls && chunk.toolCalls.length > 0) {
            for (const tc of chunk.toolCalls) {
              upsertToolCall(tc, stepIndex);
            }
          }

          if (stepContent) {
            latestAnswer = stepContent;
          }

          const currentTotalReasoning = stepReasoning
            ? (accumulatedReasoning ? `${accumulatedReasoning}\n\n---\n**Step ${stepIndex} Thought:**\n${stepReasoning}` : stepReasoning)
            : accumulatedReasoning;

          const currentlyThinking = Boolean(stepReasoning && !stepContent);

          updateCurrentSession((session) => ({
            ...session,
            updatedAt: Date.now(),
            messages: session.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: latestAnswer || stepContent,
                    reasoning: currentTotalReasoning,
                    toolCalls: [...accumulatedToolCalls],
                    isThinking: currentlyThinking,
                  }
                : m
            ),
          }));
        },
        onToolStart: (stepIndex, tc) => {
          upsertToolCall(tc, stepIndex);
          setAgentProgress(`Step ${stepIndex}/10: Running ${tc.toolName}...`);
          updateCurrentSession((session) => ({
            ...session,
            messages: session.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    toolCalls: [...accumulatedToolCalls],
                  }
                : m
            ),
          }));
        },
        onToolFinish: (stepIndex, tc) => {
          upsertToolCall(tc, stepIndex);
          setAgentProgress(`Step ${stepIndex}/10: Completed ${tc.toolName}`);
          updateCurrentSession((session) => ({
            ...session,
            messages: session.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    toolCalls: [...accumulatedToolCalls],
                  }
                : m
            ),
          }));
        },
        onStepFinish: (stepIndex, step) => {
          if (step.reasoning) {
            const prefix = stepIndex > 1 ? `\n\n---\n**Step ${stepIndex} Thought:**\n` : '';
            accumulatedReasoning = accumulatedReasoning
              ? `${accumulatedReasoning}${prefix}${step.reasoning}`
              : step.reasoning;
          }
          if (step.content) {
            latestAnswer = step.content;
          }
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (const tc of step.toolCalls) {
              upsertToolCall(tc, stepIndex);
            }
          }
        },
        onError: (err) => {
          const errorMsg = err.message || 'Agent encountered an error';
          setError(errorMsg);
          setIsStreaming(false);
          setAgentProgress(null);
          updateCurrentSession((session) => ({
            ...session,
            messages: session.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    isThinking: false,
                    error: errorMsg,
                    toolCalls: [...accumulatedToolCalls],
                    reasoning: accumulatedReasoning,
                  }
                : m
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
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: latestAnswer || m.content,
                    reasoning: accumulatedReasoning || m.reasoning,
                    toolCalls: [...accumulatedToolCalls],
                    isThinking: false,
                  }
                : m
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

  const chatHeroCards = [
    {
      icon: '🧠',
      title: 'Explain Complex Concept',
      desc: 'Break down transformer attention mechanisms with intuitive analogies',
      prompt: 'Explain how the self-attention mechanism works in Transformer models using an intuitive real-world analogy.',
    },
    {
      icon: '💡',
      title: 'Brainstorm Research Ideas',
      desc: 'Propose novel research angles on AI alignment and educational technology',
      prompt: 'Brainstorm 3 novel and actionable research hypotheses regarding AI assistance in higher education curricula.',
    },
    {
      icon: '✍️',
      title: 'Academic Writing Polish',
      desc: 'Critique and refine an abstract paragraph for formal tone and conciseness',
      prompt: 'Please critique and polish this research abstract draft to ensure formal academic tone and clarity: ',
    },
    {
      icon: '⚖️',
      title: 'Methodology Comparison',
      desc: 'Compare qualitative vs quantitative research approaches for user sentiment',
      prompt: 'Compare the advantages and trade-offs of qualitative user interviews versus quantitative surveys for studying AI adoption.',
    },
  ];

  const agentHeroCards = [
    {
      icon: '📊',
      title: 'Analyze Local Dataset',
      desc: 'Inspect workspace CSV/Excel files, compute statistics, and render charts',
      prompt: 'Inspect the CSV data files in my workspace directory, calculate descriptive statistics, and plot visual trend charts using Python.',
    },
    {
      icon: '🐍',
      title: 'Run Python Simulation',
      desc: 'Execute Python 3.12 in browser WebAssembly to solve computational problems',
      prompt: 'Write and run a Python script to simulate the Monty Hall problem with 10,000 trials, and plot the empirical winning probabilities.',
    },
    {
      icon: '🌐',
      title: 'Web Literature Research',
      desc: 'Retrieve web documentation, compare benchmarks, and synthesize findings',
      prompt: 'Search and summarize recent architectural benchmarks and advancements in autonomous LLM agent execution loops.',
    },
    {
      icon: '📁',
      title: 'Audit Project Files',
      desc: 'Scan workspace markdown files and extract high-level architecture',
      prompt: 'Read and inspect the files in my selected workspace folder, and generate a concise technical summary of the project architecture.',
    },
  ];

  const chatQuickPrompts = [
    'Explain how Large Language Models work in simple words.',
    'Brainstorm 3 creative research topics about AI ethics.',
    'Write a polite email asking a professor for a project meeting.',
    'Compare the pros and cons of qualitative vs quantitative research.',
  ];

  const agentQuickPrompts = [
    'Inspect my workspace directory and list all files.',
    'Run a Python script to calculate descriptive statistics of my dataset.',
    'Search and summarize the latest advancements in LLM agent tool use.',
    'Plot a Gaussian distribution curve using Matplotlib.',
  ];

  const heroCards = isAgentMode ? agentHeroCards : chatHeroCards;
  const quickPrompts = isAgentMode ? agentQuickPrompts : chatQuickPrompts;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const chatModels = SUPPORTED_MODELS.filter((m) => m.kind === 'chat');

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xl overflow-hidden flex-1 min-h-0 h-full flex flex-col transition-all">
      {/* Playground Top Bar */}
      <div className="relative px-3 sm:px-4 py-2.5 bg-slate-50/90 dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
        {/* Left: Sidebar Toggle & Session Name */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 z-10">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
              showSidebar
                ? 'bg-hkbu-blue-50 dark:bg-hkbu-blue-900/40 text-hkbu-blue-700 dark:text-hkbu-blue-300 border-hkbu-blue-200 dark:border-hkbu-blue-800'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
            title={showSidebar ? 'Hide History Sidebar' : 'Show History Sidebar'}
          >
            <History className="w-4 h-4" />
          </button>

          <div className="hidden sm:flex items-center space-x-2 min-w-0">
            <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
              {currentSession.title}
            </span>
          </div>
        </div>

        {/* Center: Mathematically Centered Segmented Control [ Chat | Agent ] */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-auto">
          <div className="inline-flex p-0.5 rounded-xl bg-slate-200/90 dark:bg-slate-800 border border-slate-300/70 dark:border-slate-700/80 shadow-inner">
            <button
              type="button"
              onClick={() => {
                if (isAgentMode) handleToggleAgentMode();
              }}
              disabled={isStreaming}
              className={`flex items-center space-x-1.5 px-3.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                !isAgentMode
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!isAgentMode) handleToggleAgentMode();
              }}
              disabled={isStreaming}
              className={`flex items-center space-x-1.5 px-3.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                isAgentMode
                  ? 'bg-hkbu-blue-700 dark:bg-hkbu-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${isAgentMode ? 'fill-current' : ''}`} />
              <span>Agent</span>
            </button>
          </div>
        </div>

        {/* Right: Model Selector + New Chat + Local Node Trigger */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0 z-10">
          <ModelDropdown
            models={chatModels}
            selectedModelId={selectedModel}
            onSelect={handleModelChange}
            disabled={isStreaming}
          />

          <button
            onClick={handleNewChat}
            disabled={isStreaming}
            title="Start new conversation"
            className="p-1 sm:px-2.5 sm:py-1 rounded-lg text-xs font-medium bg-hkbu-blue-50 dark:bg-hkbu-blue-950/60 text-hkbu-blue-700 dark:text-hkbu-blue-300 hover:bg-hkbu-blue-100 dark:hover:bg-hkbu-blue-900/60 border border-hkbu-blue-200 dark:border-hkbu-blue-800/80 flex items-center space-x-1 cursor-pointer transition-colors shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Chat</span>
          </button>

          {isAgentMode && (
            <button
              onClick={handleOpenHelperModal}
              className={`p-1 sm:px-2 sm:py-1 rounded-lg text-xs font-medium flex items-center space-x-1 transition-all cursor-pointer shadow-2xs border ${
                companionConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
              title="Local Node companion status and download"
            >
              <span className={`w-2 h-2 rounded-full ${companionConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
              <span className="hidden md:inline">{companionConnected ? 'Node Online' : 'Local Node'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Gateway Key Compact Banner */}
      <div className="px-3 sm:px-4 py-1.5 bg-hkbu-blue-50/40 dark:bg-hkbu-blue-950/20 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between gap-2 text-xs shrink-0">
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
            className="px-2 py-0.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono w-36 sm:w-56 focus:outline-none focus:ring-1 focus:ring-hkbu-blue-500"
          />
        </div>
      </div>

      {/* Agent Capabilities & Workspace Toolbar with smooth slide/fade transition */}
      <div
        className={`border-b transition-all duration-300 ease-in-out overflow-hidden shrink-0 ${
          isAgentMode
            ? 'max-h-24 opacity-100 py-1.5 px-3 sm:px-4 bg-slate-100/80 dark:bg-slate-900/90 border-slate-200/80 dark:border-slate-800'
            : 'max-h-0 opacity-0 py-0 px-3 sm:px-4 border-transparent pointer-events-none'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
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
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium shadow-xs"
                title="Connected to local companion node (127.0.0.1:9001). Host terminal execution active."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Host Terminal (9001)</span>
              </span>
            ) : (
              <button
                onClick={handleOpenHelperModal}
                className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[11px] text-slate-500 dark:text-slate-400 hover:text-hkbu-blue-600 dark:hover:text-hkbu-blue-400 transition-colors cursor-pointer"
                title="View local companion guide and launcher"
              >
                <span>+ Local Node (Optional)</span>
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
                className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-medium text-[11px] transition-colors cursor-pointer shadow-2xs"
                title="Select a local workspace directory for file reading and writing"
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
      </div>

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
          {userMessageCount === 0 ? (
            /* Centered Hero View (Cherry Studio / OpenWebUI style) */
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 sm:p-8 overflow-y-auto">
              <div className="max-w-2xl w-full text-center space-y-6 animate-fadeIn">
                <div className="space-y-2">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-hkbu-blue-100 dark:bg-hkbu-blue-900/60 text-hkbu-blue-700 dark:text-hkbu-blue-300 flex items-center justify-center font-bold text-lg shadow-sm transition-all duration-300">
                    {isAgentMode ? (
                      <Zap className="w-6 h-6 text-hkbu-gold-500 fill-current animate-fadeIn" />
                    ) : (
                      <Bot className="w-6 h-6 text-hkbu-blue-600 dark:text-hkbu-blue-400 animate-fadeIn" />
                    )}
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    What would you like to explore today?
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto transition-opacity duration-300">
                    {isAgentMode
                      ? 'Agent Mode active · In-browser Python, local file processing, and web search'
                      : 'Chat Mode active · Pure conversational intelligence and multi-turn reasoning'}
                  </p>
                </div>

                {/* Hero Centered Capsule Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="relative max-w-xl mx-auto"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      isAgentMode
                        ? `Ask ${selectedModel} or give an agent task...`
                        : `Message ${selectedModel}...`
                    }
                    disabled={isStreaming}
                    className="w-full pl-4 pr-12 py-3.5 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-hkbu-blue-500/40 focus:border-hkbu-blue-500 text-slate-900 dark:text-white placeholder-slate-400 shadow-sm transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isStreaming}
                    className="absolute right-2 top-2 p-2 rounded-xl bg-hkbu-blue-700 hover:bg-hkbu-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-sm transition-all cursor-pointer flex items-center justify-center"
                    title="Send"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>

                {/* Inspiration Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-left max-w-xl mx-auto">
                  {heroCards.map((card, i) => (
                    <button
                      key={`${isAgentMode ? 'agent' : 'chat'}-${i}`}
                      type="button"
                      onClick={() => handleSend(card.prompt)}
                      disabled={isStreaming}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:border-hkbu-blue-400 dark:hover:border-hkbu-blue-600 hover:shadow-sm transition-all duration-200 text-left group cursor-pointer animate-fadeIn"
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-base">{card.icon}</span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-hkbu-blue-600 dark:group-hover:text-hkbu-blue-400 transition-colors">
                          {card.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {card.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
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
                <div className="px-4 sm:px-6 py-2 bg-slate-50/50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800/80 shrink-0 transition-colors">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Suggested Prompts
                  </span>
                  <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                    {quickPrompts.map((prompt, i) => (
                      <button
                        key={`${isAgentMode ? 'agent' : 'chat'}-${i}`}
                        onClick={() => handleSend(prompt)}
                        disabled={isStreaming}
                        className="whitespace-nowrap px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-slate-600 dark:text-slate-300 hover:border-hkbu-blue-400 hover:text-hkbu-blue-600 dark:hover:text-hkbu-blue-400 transition-all flex-shrink-0 cursor-pointer animate-fadeIn"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat Input Bar */}
              <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex items-end space-x-2"
                >
                  <textarea
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      isAgentMode
                        ? `Ask ${selectedModel} or instruct the agent... (Enter to send, Shift+Enter for newline)`
                        : `Message ${selectedModel}... (Enter to send, Shift+Enter for newline)`
                    }
                    disabled={isStreaming}
                    className="flex-1 max-h-32 min-h-[42px] px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-hkbu-blue-500/30 focus:border-hkbu-blue-500 text-slate-900 dark:text-white placeholder-slate-400 resize-none transition-all leading-relaxed"
                  />

                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="p-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm transition-all cursor-pointer flex items-center justify-center shrink-0 mb-0.5"
                      title="Stop generating"
                    >
                      <Square className="w-4 h-4 fill-white" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim() || isStreaming}
                      className="p-2.5 rounded-xl bg-hkbu-blue-700 hover:bg-hkbu-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-sm transition-all cursor-pointer flex items-center justify-center shrink-0 mb-0.5"
                      title="Send message"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                </form>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Local Companion Helper Modal */}
      {showHelperModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-hkbu-blue-100 dark:bg-hkbu-blue-900/60 text-hkbu-blue-700 dark:text-hkbu-blue-300 flex items-center justify-center font-bold">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Local Node Companion
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Host terminal execution & zero-setup client guide
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHelperModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Zero Setup Highlight for Non-Devs */}
            <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-xs space-y-1.5">
              <div className="flex items-center space-x-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Zero Installation Required for Most Tasks!</span>
              </div>
              <p className="text-emerald-700/90 dark:text-emerald-400/90 leading-relaxed text-[11px]">
                This web application includes built-in <strong>WebAssembly Python 3.12</strong> (with NumPy, Pandas, and Matplotlib) and direct in-browser access to local folders. Data analysis, chart rendering, and academic research work <strong>out-of-the-box with zero environment setup</strong>.
              </p>
            </div>

            {/* Current Status */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                127.0.0.1:9001 Node Status:
              </span>
              <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 rounded-full ${companionConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></span>
                <span className={`font-semibold ${companionConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {companionConnected ? 'Connected (Host CLI active)' : 'Not connected (Host CLI disabled)'}
                </span>
              </div>
            </div>

            {/* Download and Launch for Power Users */}
            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-slate-800 dark:text-slate-200">
                Need System Terminal Execution (Git / CLI tools / Native Compilers)?
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Download the lightweight companion daemon (pure Python standard library, zero pip packages required) and run it locally:
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <a
                  href="/api/companion/download"
                  download="hkbu_genai_companion.py"
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 flex items-center justify-center space-x-1.5 font-semibold text-[11px] shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-hkbu-blue-600 dark:text-hkbu-blue-400" />
                  <span>Download companion.py</span>
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await probeCompanion();
                    setCompanionConnected(res.connected);
                    if (res.connected) {
                      alert('Connected successfully to local companion node at 127.0.0.1:9001!');
                    } else {
                      alert('Local companion not detected. Please verify that the companion script is running on port 9001.');
                    }
                  }}
                  className="p-2.5 rounded-lg border border-hkbu-blue-200 dark:border-hkbu-blue-800 bg-hkbu-blue-50 dark:bg-hkbu-blue-950/60 hover:bg-hkbu-blue-100 text-hkbu-blue-700 dark:text-hkbu-blue-300 flex items-center justify-center space-x-1.5 font-semibold text-[11px] shadow-2xs cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Probe Connection</span>
                </button>
              </div>

              <div className="pt-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                  Or launch directly in terminal:
                </span>
                <code className="block p-2 rounded bg-slate-100 dark:bg-slate-950 font-mono text-[10px] text-slate-700 dark:text-slate-300 break-all select-all">
                  python companion/hkbu_genai_companion.py
                </code>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelperModal(false)}
                className="px-4 py-1.5 bg-hkbu-blue-700 hover:bg-hkbu-blue-800 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer shadow-xs"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
