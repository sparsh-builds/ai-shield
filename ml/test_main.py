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

    assert client.post("/predict/sms", json={"text": ""}).status_code == 422
    assert client.post("/predict/email", json={"subject": "   ", "body": "   "}).status_code == 422
    assert client.post("/predict/sms", json={"text": "a" * (SMS_MAX_CHARS + 1)}).status_code == 422
    assert client.post("/predict/email", json={"body": "b" * (EMAIL_MAX_CHARS + 1)}).status_code == 422


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
    assert not any("Brand Spoofing" in r for r in legit["reasons"])

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
    assert any("Brand Spoofing" in r for r in spoofed["reasons"])


def test_safe_email_reasons_describe_what_was_checked(loaded_artifacts):
    artifacts["email_model"] = DummyEmailModel(prob=0.05)
    client = TestClient(app)
    res = client.post(
        "/predict/email",
        json={
            "subject": "Monthly Statement",
            "sender": "HDFC Bank <alerts@hdfcbank.com>",
            "body": "Your monthly account statement is available.",
        },
    ).json()
    assert res["riskLevel"] == "LOW"
    assert "Sender domain 'hdfcbank.com' does not match any protected brand" in res["reasons"]
    assert "No links found in the message" in res["reasons"]
    assert "No OTP, KYC, prize or APK-install pressure found" in res["reasons"]


def test_risky_sms_reasons_quote_the_matched_phrase_and_link(loaded_artifacts):
    client = TestClient(app)
    res = client.post(
        "/predict/sms",
        json={"text": "Alert: Your bank KYC is suspended. Update at bit.ly/kyc-now"},
    ).json()
    reasons = " | ".join(res["reasons"])
    assert "matched 'kyc'" in reasons
    assert "link 'bit.ly/kyc-now'" in reasons
    assert len(res["reasons"]) <= main.MAX_REASONS


def test_sms_safe_reasons_are_specific(loaded_artifacts):
    artifacts["sms_model"] = DummySMSModel(proba=(0.95, 0.03, 0.02))
    client = TestClient(app)
    res = client.post("/predict/sms", json={"text": "Your OTP for login is valid for 10 minutes."}).json()
    assert res["riskLevel"] == "LOW"
    assert "No links found in the message" in res["reasons"]
    assert "Text classifier scored it low (5% scam probability)" in res["reasons"]


def test_sms_spam_and_smishing_probabilities(loaded_artifacts):
    client = TestClient(app)

    res_smish = client.post(
        "/predict/sms",
        json={"text": "Alert: Your bank KYC is suspended. Update at bit.ly/kyc-now"},
    ).json()
    assert res_smish["smsClassification"] == "SMISHING"
    assert res_smish["spamProbability"] == pytest.approx(0.25)
    assert res_smish["smishingProbability"] == pytest.approx(0.65)
    assert res_smish["mlProbability"] == pytest.approx(0.90)

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
            "https://EVIL.XYZ/duplicate",
            "https://münchen.de/test",
            "http://[invalid-ipv6",
        ],
    )
    hostnames = [r["hostname"] for r in reports]
    assert hostnames.count("evil.xyz") == 1
    assert "xn--mnchen-3ya.de" in hostnames
    assert worst >= 0.60

    by_host = {r["hostname"]: r for r in reports}
    assert "Direct IP address URL (No verified DNS)" in by_host["192.168.1.1"]["indicators"]
    assert "Unencrypted HTTP link (No TLS)" in by_host["192.168.1.1"]["indicators"]
    assert "Obfuscated URL shortener hiding destination" in by_host["bit.ly"]["indicators"]
    assert "High-risk / disposable Top-Level Domain (TLD)" in by_host["evil.xyz"]["indicators"]
    assert "Punycode homograph domain spoofing" in by_host["xn--mnchen-3ya.de"]["indicators"]


def test_batch_input_limits(loaded_artifacts):
    client = TestClient(app)

    assert client.post("/predict/email/batch", json={"emails": []}).status_code == 422

    oversized_batch = [{"subject": "Hi", "body": "Test"} for _ in range(MAX_BATCH_SIZE + 1)]
    assert client.post("/predict/email/batch", json={"emails": oversized_batch}).status_code == 422

    valid_batch = [{"id": f"m_{i}", "subject": "Hello", "body": "Valid body"} for i in range(3)]
    res = client.post("/predict/email/batch", json={"emails": valid_batch})
    assert res.status_code == 200
    assert res.json()["count"] == 3


def test_missing_model_artifacts_startup_and_runtime(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "MODELS_DIR", tmp_path)
    artifacts.clear()

    with pytest.raises(RuntimeError, match="Missing required ML model artifact"):
        with TestClient(app):
            pass

    client = TestClient(app)
    assert client.get("/health").status_code == 503
    assert client.post("/predict/sms", json={"text": "Hello"}).status_code == 503
    assert client.post("/predict/email", json={"body": "Hello"}).status_code == 503