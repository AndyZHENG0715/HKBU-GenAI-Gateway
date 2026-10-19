from __future__ import annotations

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
    native_tool_call: bool = True
    supports_temperature: bool = True
    supports_parallel_tools: bool = True
    reasoning_efforts: tuple[str, ...] = ()

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
            "tool_call_emulated": not self.native_tool_call if self.kind == "chat" else False,
            "native_tool_call": self.native_tool_call,
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
            "supports_temperature": self.supports_temperature,
            "reasoning_efforts": list(self.reasoning_efforts),
        }


# Canonical REST v1 model IDs and capabilities, from the HKBU "Models & capabilities"
# table (2026-10-20). Context and output limits are not published, so these are
# conservative defaults rather than provider maxima.
def _chat(
    model_id: str,
    provider: str,
    name: str,
    *,
    vision: bool,
    temperature: bool,
    parallel: bool = True,
    json_mode: bool = True,
    efforts: tuple[str, ...] = (),
) -> Model:
    return Model(
        model_id,
        provider,
        "chat",
        None,
        name=name,
        context_window=128_000,
        max_output=16_384,
        supports_tool_call=True,
        supports_reasoning=bool(efforts),
        supports_vision=vision,
        supports_structured_output=json_mode,
        native_tool_call=True,
        supports_temperature=temperature,
        supports_parallel_tools=parallel,
        reasoning_efforts=efforts,
    )


MODELS = (
    _chat("gpt-6-luna", "gpt", "GPT-6 Luna", vision=True, temperature=False, efforts=("none", "low", "medium", "high", "xhigh", "max")),
    _chat("gpt-5.6-terra", "gpt", "GPT-5.6 Terra", vision=True, temperature=False, efforts=("low", "medium", "high")),
    _chat("gpt-6.1-sol", "gpt", "GPT-6.1 Sol", vision=True, temperature=False, efforts=("low", "medium", "high", "xhigh", "max")),
    _chat("gpt-6-astra", "gpt", "GPT-6 Astra", vision=True, temperature=False, efforts=("low", "medium", "high", "xhigh", "max")),
    _chat("gemini-3.1-pro-preview", "gemini", "Gemini 3.1 Pro Preview", vision=True, temperature=True, efforts=("low", "high")),
    _chat("gemini-3.8-flash", "gemini", "Gemini 3.8 Flash", vision=True, temperature=False, efforts=("low", "medium", "high")),
    _chat("grok-4.6", "grok", "Grok 4.6", vision=True, temperature=True, json_mode=False, efforts=("low", "medium", "high", "xhigh")),
    _chat("kimi-k3", "moonshot", "Kimi K3", vision=True, temperature=False, json_mode=False),
    _chat("glm-5.2", "glm", "GLM-5.2", vision=False, temperature=True, parallel=False, efforts=("none", "minimal", "low", "medium", "high", "xhigh", "max")),
    _chat("qwen3.8-max", "qwen", "Qwen3.8 Max", vision=False, temperature=True, efforts=("none", "high")),
    _chat("qwen3.7-plus", "qwen", "Qwen3.7 Plus", vision=True, temperature=True, efforts=("none", "high")),
    _chat("deepseek-v4-flash-0731", "deepseek", "DeepSeek V4 Flash", vision=False, temperature=True, efforts=("high", "max")),
    _chat("deepSeek-V4-Pro-hkbu", "deepseek", "DeepSeek V4 Pro", vision=False, temperature=True, efforts=("high", "max")),
    Model("text-embedding-3-large", "embeddings", "embedding", None, name="Text Embedding 3 Large", context_window=8191, max_output=3072, supports_tool_call=False, supports_reasoning=False, supports_vision=False, native_tool_call=False),
    Model("text-embedding-3-small", "embeddings", "embedding", None, name="Text Embedding 3 Small", context_window=8191, max_output=1536, supports_tool_call=False, supports_reasoning=False, supports_vision=False, native_tool_call=False),
)


def _normalize_name(name: str) -> str:
    return name.lower().replace("-", "").replace("_", "").replace(" ", "")


# IDs retired by the 2026-10 platform update, mapped to their closest successor so
# existing client configs keep working. Upstream silently answers unknown IDs with
# gpt-6-luna, which would hide the change from users.
LEGACY_ALIASES = {
    "gpt-5": "gpt-6-luna",
    "gpt-5-mini": "gpt-6-luna",
    "gpt-4.1": "gpt-6-luna",
    "gpt-4.1-mini": "gpt-6-luna",
    "o1": "gpt-6-luna",
    "o3-mini": "gpt-6-luna",
    "gemini-2.5-pro": "gemini-3.1-pro-preview",
    "gemini-2.5-flash": "gemini-3.8-flash",
    "qwen3-max": "qwen3.8-max",
    "qwen-plus": "qwen3.7-plus",
    "deepseek-v4-flash": "deepseek-v4-flash-0731",
}


def find_model(model_id: str) -> Model | None:
    model_id = LEGACY_ALIASES.get(model_id.lower(), model_id)
    exact = next((model for model in MODELS if model.id == model_id), None)
    if exact:
        return exact
    case_insensitive = next((model for model in MODELS if model.id.lower() == model_id.lower()), None)
    if case_insensitive:
        return case_insensitive
    norm = _normalize_name(model_id)
    return next(
        (
            model
            for model in MODELS
            if _normalize_name(model.id) == norm or _normalize_name(model.name) == norm
        ),
        None,
    )
