"""No-model tests for local music-engine preflight."""
from check_local_music_engines import probe_ace_step


def test_ace_step_disabled_does_not_connect():
    assert probe_ace_step("http://127.0.0.1:8001", False)["state"] == "disabled"


def test_ace_step_remote_url_not_probed():
    assert probe_ace_step("https://example.org", True)["state"] == "unsupported"


def test_ace_step_missing_loopback_port():
    assert probe_ace_step("http://127.0.0.1:1", True)["state"] == "unavailable"


def test_ace_step_credentials_in_url_rejected():
    assert probe_ace_step("http://user:pass@127.0.0.1:8001", True)["state"] == "unsupported"
