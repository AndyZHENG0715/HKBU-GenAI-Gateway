from dataclasses import dataclass


from typing import Any
import time


@dataclass(frozen=True)
class Model:
    id: str
    provider: str
    kind: str
    api_version: str | None
    name: str = ""
    context_window: int = 128_000
    max_output: int = 4_096
    supports_tool_call: bool = True
    supports_reasoning: bool = False
    supports_vision: bool = False
    supports_structured_output: bool = True

    def to_dict(self, created: int | None = None) -> dict[str, Any]:
        display_name = self.name or self.id
        return {
            "id": self.id,
            "object": "model",
            "created": created or int(time.time()),
            "owned_by": self.provider,
            "name": display_name,
            "description": f"{display_name} via HKBU GenAI Platform",
            "type": self.kind,
            # WorkBuddy / Tencent agent properties
            "supportsToolCall": self.supports_tool_call,
            "supportsReasoning": self.supports_reasoning,
            "supportsVision": self.supports_vision,
            "contextWindow": self.context_window,
            "maxTokens": self.max_output,
            # models.dev / OpenCode standard specification
            "tool_call": self.supports_tool_call,
            "reasoning": self.supports_reasoning,
            "attachment": self.supports_vision,
            "structured_output": self.supports_structured_output,
            "limit": {
                "context": self.context_window,
                "output": self.max_output,
            },
            # OpenAI / LiteLLM capabilities schema
            "capabilities": {
                "tool_call": self.supports_tool_call,
                "tools": self.supports_tool_call,
                "function_calling": self.supports_tool_call,
                "reasoning": self.supports_reasoning,
                "vision": self.supports_vision,
                "structured_output": self.supports_structured_output,
            },
            "context_window": self.context_window,
            "max_output_tokens": self.max_output,
        }


MODELS = (
    Model("gpt-5", "gpt", "chat", "2024-12-01-preview", name="GPT-5", context_window=1047576, max_output=65536, supports_tool_call=True, supports_reasoning=True, supports_vision=True),
    Model("gpt-5-mini", "gpt", "chat", "2024-12-01-preview", name="GPT-5 mini", context_window=1047576, max_output=65536, supports_tool_call=True, supports_reasoning=True, supports_vision=True),
    Model("gpt-4.1", "gpt", "chat", "2024-12-01-preview", name="GPT-4.1", context_window=1047576, max_output=32768, supports_tool_call=True, supports_reasoning=False, supports_vision=True),
    Model("gpt-4.1-mini", "gpt", "chat", "2024-12-01-preview", name="GPT-4.1 mini", context_window=1047576, max_output=32768, supports_tool_call=True, supports_reasoning=False, supports_vision=True),
    Model("o1", "gpt", "chat", "2024-12-01-preview", name="o1", context_window=200000, max_output=100000, supports_tool_call=True, supports_reasoning=True, supports_vision=True),
    Model("o3-mini", "gpt", "chat", "2024-12-01-preview", name="o3-mini", context_window=200000, max_output=100000, supports_tool_call=True, supports_reasoning=True, supports_vision=False),
    Model("deepSeek-V4-Pro-hkbu", "deepseek", "chat", "2025-04-01-preview", name="DeepSeek V4 Pro", context_window=1000000, max_output=384000, supports_tool_call=True, supports_reasoning=True, supports_vision=False),
    Model("deepseek-v4-flash", "deepseek", "chat", "2024-05-01-preview", name="DeepSeek V4 Flash", context_window=1000000, max_output=384000, supports_tool_call=True, supports_reasoning=True, supports_vision=False),
    Model("gemini-2.5-pro", "gemini", "chat", None, name="Gemini 2.5 Pro", context_window=2000000, max_output=65536, supports_tool_call=True, supports_reasoning=True, supports_vision=True),
    Model("gemini-2.5-flash", "gemini", "chat", None, name="Gemini 2.5 Flash", context_window=1000000, max_output=65536, supports_tool_call=True, supports_reasoning=True, supports_vision=True),
    Model("qwen3-max", "qwen", "chat", "v1", name="Qwen3 Max", context_window=1000000, max_output=65536, supports_tool_call=True, supports_reasoning=True, supports_vision=False),
    Model("qwen-plus", "qwen", "chat", "v1", name="Qwen Plus", context_window=131072, max_output=8192, supports_tool_call=True, supports_reasoning=False, supports_vision=False),
    Model("llama-4-maverick", "llama", "chat", "20240723", name="Llama 4 Maverick", context_window=1000000, max_output=32768, supports_tool_call=True, supports_reasoning=False, supports_vision=False),
    Model("text-embedding-3-large", "embeddings", "embedding", "2024-05-01-preview", name="Text Embedding 3 Large", context_window=8191, max_output=3072, supports_tool_call=False, supports_reasoning=False, supports_vision=False),
    Model("text-embedding-3-small", "embeddings", "embedding", "2024-05-01-preview", name="Text Embedding 3 Small", context_window=8191, max_output=1536, supports_tool_call=False, supports_reasoning=False, supports_vision=False),
)


def find_model(model_id: str) -> Model | None:
    exact = next((model for model in MODELS if model.id == model_id), None)
    if exact:
        return exact
    return next((model for model in MODELS if model.id.lower() == model_id.lower()), None)
