from hkbu_gateway.registry import find_model
from hkbu_gateway.protocol import ChatCompletionRequest


def test_registry_contains_documented_models():
    assert find_model("gpt-4.1").provider == "gpt"
    assert find_model("text-embedding-3-small").kind == "embedding"


def test_chat_request_keeps_openai_shape():
    request = ChatCompletionRequest(
        model="deepseek-v4-flash",
        messages=[{"role": "user", "content": "hello"}],
        stream=True,
    )
    assert request.model == "deepseek-v4-flash"
    assert request.messages[0].content == "hello"
