import sys
from pathlib import Path
import pytest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from workers.alerts import telegram


def test_unconfigured_alert_is_non_fatal(monkeypatch):
    monkeypatch.delenv("NOVA_TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("NOVA_TELEGRAM_CHAT_ID", raising=False)
    assert telegram.send_telegram_alert("test") is False


def test_unknown_event_is_rejected():
    with pytest.raises(ValueError):
        telegram.notify_event("arbitrary", "details")


def test_message_is_sent_with_configured_credentials(monkeypatch):
    seen={}
    class Response:
        status=200
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def read(self): return b'{"ok":true}'
    def fake_urlopen(request, timeout):
        seen["url"]=request.full_url
        seen["body"]=request.data.decode()
        return Response()
    monkeypatch.setattr(telegram.urllib.request,"urlopen",fake_urlopen)
    assert telegram.send_telegram_alert("broker disconnected",token="secret",chat_id="123") is True
    assert "secret" in seen["url"]
    assert "broker+disconnected" in seen["body"]
