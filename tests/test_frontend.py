from fastapi.testclient import TestClient

from hkbu_gateway.app import app


def test_frontend_root_served(monkeypatch, tmp_path):
    monkeypatch.setenv("HKBU_DATABASE_PATH", str(tmp_path / "test.db"))
    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == 200
        assert "HKBU GenAI Gateway" in response.text
        assert "assets/index" in response.text


def test_frontend_hkbuapi4agent_html_served(monkeypatch, tmp_path):
    monkeypatch.setenv("HKBU_DATABASE_PATH", str(tmp_path / "test.db"))
    with TestClient(app) as client:
        response = client.get("/hkbuapi4agent.html")
        assert response.status_code == 200
        assert "HKBU GenAI Gateway" in response.text
