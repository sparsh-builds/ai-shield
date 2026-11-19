import numpy as np
import pytest
from fastapi.testclient import TestClient

import main
from main import (
    EMAIL_MAX_CHARS,
    MAX_BATCH_SIZE,
    SMS_MAX_CHARS,
    analyze_urls,
    app,
    artifacts,
)


class DummyVectorizer:
    def transform(self, texts):
        return texts


class DummyEmailModel:
    def __init__(self, prob=0.85, classes=(0, 1)):
        self.prob = prob
        self.classes_ = list(classes)

    def predict_proba(self, vec):
        return np.array([[1.0 - self.prob, self.prob] for _ in vec])


class DummySMSModel:
    def __init__(self, proba=(0.1, 0.2, 0.7), classes=(0, 1, 2)):
        self.proba = np.array(proba, dtype=float)
        self.classes_ = list(classes)

    def predict_proba(self, vec):
        return np.array([self.proba for _ in vec])


@pytest.fixture
def loaded_artifacts():
    artifacts.clear()
    artifacts["email_vectorizer"] = DummyVectorizer()
    artifacts["email_model"] = DummyEmailModel(prob=0.80)
    artifacts["email_meta"] = {"model_version": "email-v1.0"}
    artifacts["sms_vectorizer"] = DummyVectorizer()
    artifacts["sms_model"] = DummySMSModel(proba=(0.10, 0.25, 0.65))
    artifacts["sms_meta"] = {"model_version": "sms-v1.0"}
    yield artifacts
    artifacts.clear()


def test_empty_and_oversized_inputs(loaded_artifacts):
    client = TestClient(app)

    # Empty SMS
    res_empty_sms = client.post("/predict/sms", json={"text": ""})
    assert res_empty_sms.status_code == 422

    # Whitespace-only email
    res_empty_email = client.post("/predict/email", json={"subject": "   ", "body": "   "})
    assert res_empty_email.status_code == 422

    # Oversized SMS
    res_big_sms = client.post("/predict/sms", json={"text": "a" * (SMS_MAX_CHARS + 1)})
    assert res_big_sms.status_code == 422

    # Oversized Email body
    res_big_email = client.post("/predict/email", json={"body": "b" * (EMAIL_MAX_CHARS + 1)})
    assert res_big_email.status_code == 422


def test_legitimate_vs_spoofed_sender(loaded_artifacts):
    client = TestClient(app)

    legit = client.post(
        "/predict/email",
        json={
            "subject": "Monthly Statement",
            "sender": "HDFC Bank <alerts@hdfcbank.com>",
            "body": "Your monthly account statement is available.",
        },
    ).json()
    assert not any("Sender Spoofing Alert" in r for r in legit["reasons"])

    spoofed = client.post(
        "/predict/email",
        json={
            "subject": "Urgent KYC Update",
            "sender": "HDFC Security <support@hdfc-verify.xyz>",
            "body": "Verify your account immediately.",
        },
    ).json()
    assert spoofed["riskScore"] >= 82
    assert spoofed["riskLevel"] == "HIGH"
    assert any("Sender Spoofing Alert" in r for r in spoofed["reasons"])


def test_sms_spam_and_smishing_probabilities(loaded_artifacts):
    client = TestClient(app)

    # Smishing dominant (P(HAM)=0.10, P(SPAM)=0.25, P(SMISHING)=0.65)
    res_smish = client.post(
        "/predict/sms",
        json={"text": "Alert: Your bank KYC is suspended. Update at bit.ly/kyc-now"},
    ).json()
    assert res_smish["smsClassification"] == "SMISHING"
    assert res_smish["spamProbability"] == pytest.approx(0.25)
    assert res_smish["smishingProbability"] == pytest.approx(0.65)
    assert res_smish["mlProbability"] == pytest.approx(0.90)

    # Spam dominant (P(HAM)=0.15, P(SPAM)=0.70, P(SMISHING)=0.15)
    artifacts["sms_model"] = DummySMSModel(proba=(0.15, 0.70, 0.15))
    res_spam = client.post(
        "/predict/sms",
        json={"text": "Congratulations! You won a free gift voucher!"},
    ).json()
    assert res_spam["smsClassification"] == "SPAM"
    assert res_spam["spamProbability"] == pytest.approx(0.70)
    assert res_spam["smishingProbability"] == pytest.approx(0.15)


def test_url_heuristics_and_malformed_unicode_dedup():
    reports, worst = analyze_urls(
        "Visit http://192.168.1.1/login and bit.ly/test and https://evil.xyz/auth",
        external_urls=[
            "https://EVIL.XYZ/duplicate",  # duplicate domain, different path/case
            "https://münchen.de/test",  # Unicode IDN domain
            "http://[invalid-ipv6",  # malformed URL should not crash
        ],
    )
    hostnames = [r["hostname"] for r in reports]
    assert hostnames.count("evil.xyz") == 1
    assert "xn--mnchen-3ya.de" in hostnames
    assert worst >= 0.60

    by_host = {r["hostname"]: r for r in reports}
    assert "IP-based direct link (No verified DNS)" in by_host["192.168.1.1"]["indicators"]
    assert "Plaintext HTTP protocol (No TLS encryption)" in by_host["192.168.1.1"]["indicators"]
    assert "Obfuscated URL shortener hiding target endpoint" in by_host["bit.ly"]["indicators"]
    assert "High-risk or disposable Top-Level Domain (TLD)" in by_host["evil.xyz"]["indicators"]
    assert "Punycode homograph domain spoofing" in by_host["xn--mnchen-3ya.de"]["indicators"]


def test_batch_input_limits(loaded_artifacts):
    client = TestClient(app)

    # Empty batch rejected
    assert client.post("/predict/email/batch", json={"emails": []}).status_code == 422

    # Exceeding MAX_BATCH_SIZE rejected
    oversized_batch = [{"subject": "Hi", "body": "Test"} for _ in range(MAX_BATCH_SIZE + 1)]
    assert client.post("/predict/email/batch", json={"emails": oversized_batch}).status_code == 422

    # Valid batch succeeds
    valid_batch = [{"id": f"m_{i}", "subject": "Hello", "body": "Valid body"} for i in range(3)]
    res = client.post("/predict/email/batch", json={"emails": valid_batch})
    assert res.status_code == 200
    assert res.json()["count"] == 3


def test_missing_model_artifacts_startup_and_runtime(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "MODELS_DIR", tmp_path)
    artifacts.clear()

    # Startup lifespan fails fast when artifacts are missing
    with pytest.raises(RuntimeError, match="Missing required ML model artifact"):
        with TestClient(app):
            pass

    # Direct endpoint call without loaded artifacts returns 503
    client = TestClient(app)
    assert client.get("/health").status_code == 503
    assert client.post("/predict/sms", json={"text": "Hello"}).status_code == 503
    assert client.post("/predict/email", json={"body": "Hello"}).status_code == 503