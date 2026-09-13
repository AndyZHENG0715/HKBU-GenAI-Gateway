from dataclasses import dataclass


@dataclass(frozen=True)
class Model:
    id: str
    provider: str
    kind: str
    api_version: str | None


MODELS = (
    Model("gpt-5", "gpt", "chat", "2024-12-01-preview"),
    Model("gpt-5-mini", "gpt", "chat", "2024-12-01-preview"),
    Model("gpt-4.1", "gpt", "chat", "2024-12-01-preview"),
    Model("gpt-4.1-mini", "gpt", "chat", "2024-12-01-preview"),
    Model("o1", "gpt", "chat", "2024-12-01-preview"),
    Model("o3-mini", "gpt", "chat", "2024-12-01-preview"),
    Model("deepSeek-V4-Pro-hkbu", "deepseek", "chat", "2025-04-01-preview"),
    Model("deepseek-v4-flash", "deepseek", "chat", "2024-05-01-preview"),
    Model("gemini-2.5-pro", "gemini", "chat", None),
    Model("gemini-2.5-flash", "gemini", "chat", None),
    Model("qwen3-max", "qwen", "chat", "v1"),
    Model("qwen-plus", "qwen", "chat", "v1"),
    Model("llama-4-maverick", "llama", "chat", "20240723"),
    Model("text-embedding-3-large", "embeddings", "embedding", "2024-05-01-preview"),
    Model("text-embedding-3-small", "embeddings", "embedding", "2024-05-01-preview"),
)


def find_model(model_id: str) -> Model | None:
    return next((model for model in MODELS if model.id == model_id), None)
