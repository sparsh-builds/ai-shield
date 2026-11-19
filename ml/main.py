import json
import os
import re
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from preprocess import ML_DIR, clean_text
from train_sms import decide

MODELS_DIR = ML_DIR / "models"
EMAIL_VERSION = "email-v1.0"
SMS_VERSION = "sms-v1.0"
EMAIL_MAX_CHARS = 50000
SMS_MAX_CHARS = 5000
MAX_URLS_PER_REQUEST = 50
MAX_BATCH_SIZE = 50

artifacts: Dict[str, Any] = {}


def load_json(path):
    with open(path) as f:
        return json.load(f)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        artifacts["email_vectorizer"] = joblib.load(MODELS_DIR / f"{EMAIL_VERSION}_vectorizer.joblib")
        artifacts["email_model"] = joblib.load(MODELS_DIR / f"{EMAIL_VERSION}_model.joblib")
        artifacts["email_meta"] = load_json(MODELS_DIR / f"{EMAIL_VERSION}_meta.json")

        artifacts["sms_vectorizer"] = joblib.load(MODELS_DIR / f"{SMS_VERSION}_vectorizer.joblib")
        artifacts["sms_model"] = joblib.load(MODELS_DIR / f"{SMS_VERSION}_model.joblib")
        artifacts["sms_meta"] = load_json(MODELS_DIR / f"{SMS_VERSION}_meta.json")
    except FileNotFoundError as exc:
        raise RuntimeError(f"Missing required ML model artifact: {exc}") from exc

    assert list(artifacts["email_model"].classes_) == [0, 1], "Unexpected Email class mapping"
    assert list(artifacts["sms_model"].classes_) == [0, 1, 2], "Unexpected SMS class mapping"
    yield
    artifacts.clear()


app = FastAPI(title="AI Shield ML Engine", version="3.0.0", lifespan=lifespan)

raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:8081,http://localhost:19006,http://localhost:3000")
ALLOWED_ORIGINS = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# ----------------- SENDER SPOOFING ENGINE -----------------
PROTECTED_BRANDS = {
    "google": ["google.com", "gmail.com"],
    "microsoft": ["microsoft.com", "outlook.com", "office.com"],
    "netflix": ["netflix.com"],
    "amazon": ["amazon.com", "amazon.in"],
    "paypal": ["paypal.com"],
    "apple": ["apple.com", "icloud.com"],
    "hdfc": ["hdfcbank.com"],
    "sbi": ["sbi.co.in"],
    "icici": ["icicibank.com"],
    "paytm": ["paytm.com"],
    "phonepe": ["phonepe.com"],
}


def inspect_sender_spoofing(sender_raw: str) -> tuple[float, List[str]]:
    sender_lower = (sender_raw or "").lower().strip()
    if not sender_lower:
        return 0.0, []

    email_match = re.search(r"[\w\.-]+@([\w\.-]+)", sender_lower)
    actual_domain = email_match.group(1) if email_match else ""

    reasons = []
    penalty = 0.0
    for brand, legit_domains in PROTECTED_BRANDS.items():
        if brand in sender_lower and actual_domain:
            is_valid = any(actual_domain == d or actual_domain.endswith("." + d) for d in legit_domains)
            if not is_valid:
                penalty += 0.60
                reasons.append(
                    f"Brand Spoofing: '{brand.capitalize()}' claimed from unverified domain '{actual_domain}'"
                )
                break
    return penalty, reasons


# ----------------- SAFE URL HEURISTIC ENGINE -----------------
URL_REGEX = re.compile(
    r"(?:https?://)?(?:www\.)?(?:\d{1,3}(?:\.\d{1,3}){3}|bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly|ow\.ly|[a-zA-Z0-9-]+\.(?:com|in|xyz|top|click|tk|ml|ga|cf|gq|work|zip|net|org|co\.in))(?:/[^\s<>\"')]*)?",
    re.IGNORECASE,
)
KNOWN_SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "ow.ly"}
SUSPICIOUS_TLDS = (".xyz", ".top", ".click", ".tk", ".ml", ".ga", ".cf", ".gq", ".work", ".zip", ".surf", ".monster")


def _normalize_hostname(raw_host: str) -> str:
    host = (raw_host or "").strip().lower().rstrip(".")
    if not host:
        return ""
    try:
        return host.encode("idna").decode("ascii")
    except UnicodeError:
        return host


def analyze_urls(text: str, external_urls: Optional[List[str]] = None):
    candidates: List[str] = list(URL_REGEX.findall(text))
    if external_urls:
        candidates.extend(external_urls[:MAX_URLS_PER_REQUEST])

    seen_domains = set()
    reports = []

    for raw in candidates:
        if not isinstance(raw, str):
            continue
        url_str = raw.strip().rstrip(".,;)")
        if not url_str or len(url_str) > 2048 or "@" in url_str:
            continue

        has_explicit_http = url_str.lower().startswith("http://")
        parse_target = url_str if url_str.lower().startswith(("http://", "https://")) else f"http://{url_str}"

        try:
            parsed = urlparse(parse_target)
        except ValueError:
            continue

        hostname = _normalize_hostname(parsed.hostname or "")
        if not hostname or hostname in seen_domains:
            continue
        seen_domains.add(hostname)

        score = 0
        indicators = []

        if re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", hostname):
            score += 55
            indicators.append("Direct IP address URL (No verified DNS)")
        if hostname in KNOWN_SHORTENERS:
            score += 40
            indicators.append("Obfuscated URL shortener hiding destination")
        if hostname.count(".") >= 3:
            score += 25
            indicators.append(f"Excessive subdomain nesting ({hostname.count('.')} dots)")
        if "xn--" in hostname:
            score += 45
            indicators.append("Punycode homograph domain spoofing")
        if any(hostname.endswith(t) for t in SUSPICIOUS_TLDS):
            score += 35
            indicators.append("High-risk / disposable Top-Level Domain (TLD)")
        if has_explicit_http:
            score += 15
            indicators.append("Unencrypted HTTP link (No TLS)")

        norm_score = min(100, score)
        level = "CRITICAL" if norm_score >= 70 else ("WARNING" if norm_score >= 35 else "CLEAN")
        reports.append({
            "url": url_str,
            "hostname": hostname,
            "riskScore": norm_score,
            "threatLevel": level,
            "indicators": indicators or ["Verified standard domain structure"]
        })

    reports.sort(key=lambda x: x["riskScore"], reverse=True)
    worst_ratio = (reports[0]["riskScore"] / 100.0) if reports else 0.0
    return reports, worst_ratio


# ----------------- INTENT & SOCIAL ENGINEERING RULES -----------------
def analyze_intent_rules(text_lower: str) -> tuple[float, List[str]]:
    boost = 0.0
    triggers = []

    if re.search(r"\b(kyc|pan card|aadhaar|account blocked|account suspended|verify your account|reactivate)\b", text_lower):
        boost += 0.35
        triggers.append("Account/KYC suspension urgency trigger")

    if re.search(r"\b(share otp|enter otp|send otp|pin|password|cvv|card number)\b", text_lower):
        boost += 0.40
        triggers.append("Sensitive credential / OTP harvesting attempt")

    if re.search(r"\b(you have won|you won|claim your prize|lottery winner|jackpot|cash reward|claim free gift)\b", text_lower):
        boost += 0.30
        triggers.append("Unsolicited financial reward / lottery lure")

    if re.search(r"\b(save the internet settings|install apk|download apk|allow unknown sources)\b", text_lower):
        boost += 0.35
        triggers.append("Malicious configuration / APK sideload prompt")

    return min(0.60, boost), triggers


# ----------------- FUSION FORMULATION (ZERO CONTRADICTION) -----------------
def fuse_signals(
    item_id: str,
    text: str,
    ml_prob: float,
    sorted_urls: List[Dict[str, Any]],
    worst_url_ratio: float,
    sender_penalty: float,
    sender_reasons: List[str],
    model_ver: str,
    extra_fields: Optional[Dict[str, Any]] = None,
):
    text_lower = text.lower()
    rule_boost, rule_reasons = analyze_intent_rules(text_lower)

    # Weighted hybrid fusion
    composite = (ml_prob * 45.0) + (worst_url_ratio * 35.0) + (sender_penalty * 20.0) + (rule_boost * 40.0)

    # Hard escalation rules when strong technical indicators combine
    if (worst_url_ratio >= 0.55 or sender_penalty >= 0.50) and (ml_prob >= 0.25 or rule_boost >= 0.25):
        composite = max(composite, 84.0)
    elif worst_url_ratio >= 0.40 and rule_boost >= 0.25:
        composite = max(composite, 72.0)

    # Benign context dampener: college/hackathon/official notices without bad URLs or spoofing
    is_benign_event = bool(re.search(r"\b(hackathon|workshop|techfest|grand finale|problem statement|registration)\b", text_lower))
    if is_benign_event and worst_url_ratio == 0.0 and sender_penalty == 0.0 and rule_boost == 0.0:
        composite = min(composite, 24.0)

    final_score = int(round(max(1.0, min(99.0, composite))))

    tier = "HIGH" if final_score >= 70 else ("MEDIUM" if final_score >= 35 else "LOW")
    category = "PHISHING" if tier == "HIGH" else ("SUSPICIOUS" if tier == "MEDIUM" else "SAFE")

    # Build reasons strictly consistent with final tier
    reasons: List[str] = []
    if tier == "LOW":
        reasons.append("No malicious URLs, spoofing, or credential traps detected")
    else:
        reasons.extend(sender_reasons)
        if sorted_urls and sorted_urls[0]["riskScore"] > 0:
            target = sorted_urls[0]["url"]
            reasons.append(f"{sorted_urls[0]['indicators'][0]} ({target})")
            reasons.extend(sorted_urls[0]["indicators"][1:])
        reasons.extend(rule_reasons)
        if ml_prob >= 0.65:
            reasons.append(f"NLP classifier detected social-engineering patterns ({int(ml_prob * 100)}% confidence)")
        if not reasons:
            reasons.append("Elevated linguistic anomaly score — verify sender before clicking links")

    ordered_reasons = list(dict.fromkeys(reasons))

    result: Dict[str, Any] = {
        "id": item_id,
        "riskScore": final_score,
        "riskLevel": tier,
        "category": category,
        "mlProbability": round(ml_prob, 4),
        "reasons": ordered_reasons,
        "sortedThreatUrls": sorted_urls,
        "urlCount": len(sorted_urls),
        "modelVersion": model_ver,
    }
    if extra_fields:
        result.update(extra_fields)
    return result


class EmailRequest(BaseModel):
    id: str = Field(default="msg_001", max_length=128)
    subject: str = Field(default="", max_length=1000)
    sender: str = Field(default="", max_length=320)
    body: str = Field(default="", max_length=EMAIL_MAX_CHARS)
    urls: List[str] = Field(default_factory=list, max_length=MAX_URLS_PER_REQUEST)


class SMSRequest(BaseModel):
    id: str = Field(default="sms_001", max_length=128)
    text: str = Field(min_length=1, max_length=SMS_MAX_CHARS)


class BatchEmailRequest(BaseModel):
    emails: List[EmailRequest] = Field(min_length=1, max_length=MAX_BATCH_SIZE)


@app.get("/health")
def health():
    if "email_meta" not in artifacts or "sms_meta" not in artifacts:
        raise HTTPException(status_code=503, detail="Models not loaded")
    return {
        "status": "OPERATIONAL",
        "models": [artifacts["email_meta"]["model_version"], artifacts["sms_meta"]["model_version"]],
    }


@app.post("/predict/email")
def predict_email(req: EmailRequest):
    if "email_vectorizer" not in artifacts or "email_model" not in artifacts:
        raise HTTPException(status_code=503, detail="Email model unavailable")

    raw_full = f"{req.subject} {req.body}".strip()
    cleaned = clean_text(raw_full)[:EMAIL_MAX_CHARS]
    if not cleaned:
        raise HTTPException(status_code=422, detail="Text empty")

    vec = artifacts["email_vectorizer"].transform([cleaned])
    ml_prob = float(artifacts["email_model"].predict_proba(vec)[0, 1])
    sorted_urls, worst_ratio = analyze_urls(raw_full, req.urls)
    s_pen, s_reasons = inspect_sender_spoofing(req.sender)

    return fuse_signals(
        req.id,
        raw_full,
        ml_prob,
        sorted_urls,
        worst_ratio,
        s_pen,
        s_reasons,
        artifacts["email_meta"]["model_version"],
    )


@app.post("/predict/sms")
def predict_sms(req: SMSRequest):
    if "sms_vectorizer" not in artifacts or "sms_model" not in artifacts:
        raise HTTPException(status_code=503, detail="SMS model unavailable")

    cleaned = clean_text(req.text)[:SMS_MAX_CHARS]
    if not cleaned:
        raise HTTPException(status_code=422, detail="SMS empty")

    vec = artifacts["sms_vectorizer"].transform([cleaned])
    proba = artifacts["sms_model"].predict_proba(vec)[0]
    scam_prob, sms_sub_category = decide(proba)
    sorted_urls, worst_ratio = analyze_urls(req.text)

    extra = {
        "smsClassification": sms_sub_category,
        "spamProbability": round(float(proba[1]), 4),
        "smishingProbability": round(float(proba[2]), 4),
    }

    return fuse_signals(
        req.id,
        req.text,
        scam_prob,
        sorted_urls,
        worst_ratio,
        0.0,
        [],
        artifacts["sms_meta"]["model_version"],
        extra_fields=extra,
    )


@app.post("/predict/email/batch")
def predict_email_batch(req: BatchEmailRequest):
    return {"count": len(req.emails), "results": [predict_email(m) for m in req.emails]}