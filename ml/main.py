import json
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

artifacts: Dict[str, Any] = {}

def load_json(path):
    with open(path) as f:
        return json.load(f)

@asynccontextmanager
async def lifespan(app: FastAPI):
    artifacts["email_vectorizer"] = joblib.load(MODELS_DIR / f"{EMAIL_VERSION}_vectorizer.joblib")
    artifacts["email_model"] = joblib.load(MODELS_DIR / f"{EMAIL_VERSION}_model.joblib")
    artifacts["email_meta"] = load_json(MODELS_DIR / f"{EMAIL_VERSION}_meta.json")

    artifacts["sms_vectorizer"] = joblib.load(MODELS_DIR / f"{SMS_VERSION}_vectorizer.joblib")
    artifacts["sms_model"] = joblib.load(MODELS_DIR / f"{SMS_VERSION}_model.joblib")
    artifacts["sms_meta"] = load_json(MODELS_DIR / f"{SMS_VERSION}_meta.json")
    
    assert list(artifacts["sms_model"].classes_) == [0, 1, 2], "Unexpected SMS class mapping"
    yield
    artifacts.clear()

app = FastAPI(title="AI Shield ML Engine", version="2.5.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
        if brand in sender_lower:
            is_valid = any(actual_domain == d or actual_domain.endswith("." + d) for d in legit_domains)
            if not is_valid:
                penalty += 0.50
                reasons.append(f"Sender Spoofing Alert: Claiming identity '{brand.capitalize()}' from unverified domain '{actual_domain}'")
                break
    return penalty, reasons

# ----------------- URL HEURISTIC ENGINE -----------------
URL_REGEX = re.compile(r"https?://[^\s<>\"')]+", re.IGNORECASE)
KNOWN_SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "ow.ly"}
SUSPICIOUS_TLDS = (".xyz", ".top", ".click", ".tk", ".ml", ".ga", ".cf", ".gq", ".work", ".zip", ".surf", ".monster")

def analyze_urls(text: str, external_urls: Optional[List[str]] = None):
    found = set(URL_REGEX.findall(text))
    if external_urls:
        found.update(external_urls)

    reports = []
    for raw in found:
        url_str = raw.strip()
        parsed = urlparse(url_str)
        hostname = (parsed.hostname or "").lower()
        score = 0
        indicators = []

        if re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", hostname):
            score += 45
            indicators.append("IP-based direct link (No verified DNS)")
        if hostname in KNOWN_SHORTENERS:
            score += 35
            indicators.append("Obfuscated URL shortener hiding target endpoint")
        if hostname.count(".") >= 3:
            score += 25
            indicators.append(f"Excessive subdomain nesting ({hostname.count('.')} dots)")
        if "xn--" in hostname:
            score += 40
            indicators.append("Punycode homograph domain spoofing")
        if any(hostname.endswith(t) for t in SUSPICIOUS_TLDS):
            score += 30
            indicators.append("High-risk or disposable Top-Level Domain (TLD)")
        if parsed.scheme == "http":
            score += 15
            indicators.append("Plaintext HTTP protocol (No TLS encryption)")

        norm_score = min(100, score)
        level = "CRITICAL" if norm_score >= 70 else ("WARNING" if norm_score >= 35 else "CLEAN")
        reports.append({
            "url": url_str,
            "hostname": hostname,
            "riskScore": norm_score,
            "threatLevel": level,
            "indicators": indicators or ["No structural anomalies found"]
        })

    reports.sort(key=lambda x: x["riskScore"], reverse=True)
    worst_ratio = (reports[0]["riskScore"] / 100.0) if reports else 0.0
    return reports, worst_ratio

# ----------------- FUSION FORMULATION -----------------
def fuse_signals(item_id, text, ml_prob, sorted_urls, worst_url_ratio, sender_penalty, sender_reasons, model_ver):
    composite = (ml_prob * 50.0) + (worst_url_ratio * 30.0) + (sender_penalty * 20.0)
    if (worst_url_ratio >= 0.60 or sender_penalty >= 0.50) and ml_prob >= 0.25:
        composite = max(composite, 82.0)

    final_score = int(round(max(0.0, min(100.0, composite))))
    reasons = list(sender_reasons)
    if sorted_urls and sorted_urls[0]["riskScore"] > 0:
        reasons.extend(sorted_urls[0]["indicators"])
    if ml_prob >= 0.60:
        reasons.append("High semantic probability of social engineering or coercion")
    if not reasons:
        reasons.append("No actionable malicious indicators found")

    tier = "HIGH" if final_score >= 70 else ("MEDIUM" if final_score >= 35 else "LOW")
    category = "PHISHING" if tier == "HIGH" else ("SUSPICIOUS" if tier == "MEDIUM" else "SAFE")

    return {
        "id": item_id,
        "riskScore": final_score,
        "riskLevel": tier,
        "category": category,
        "mlProbability": round(ml_prob, 4),
        "reasons": list(set(reasons)),
        "sortedThreatUrls": sorted_urls,
        "urlCount": len(sorted_urls),
        "modelVersion": model_ver
    }

class EmailRequest(BaseModel):
    id: str = "msg_001"
    subject: str = ""
    sender: str = ""
    body: str = ""
    urls: Optional[List[str]] = []

class SMSRequest(BaseModel):
    id: str = "sms_001"
    text: str = Field(min_length=1)

class BatchEmailRequest(BaseModel):
    emails: List[EmailRequest]

@app.get("/health")
def health():
    return {"status": "OPERATIONAL", "models": [artifacts["email_meta"]["model_version"], artifacts["sms_meta"]["model_version"]]}

@app.post("/predict/email")
def predict_email(req: EmailRequest):
    raw_full = f"{req.subject} {req.body}".strip()
    cleaned = clean_text(raw_full)[:EMAIL_MAX_CHARS]
    if not cleaned:
        raise HTTPException(status_code=422, detail="Text empty")

    vec = artifacts["email_vectorizer"].transform([cleaned])
    ml_prob = float(artifacts["email_model"].predict_proba(vec)[0, 1])
    sorted_urls, worst_ratio = analyze_urls(raw_full, req.urls)
    s_pen, s_reasons = inspect_sender_spoofing(req.sender)

    return fuse_signals(req.id, raw_full, ml_prob, sorted_urls, worst_ratio, s_pen, s_reasons, artifacts["email_meta"]["model_version"])

@app.post("/predict/sms")
def predict_sms(req: SMSRequest):
    cleaned = clean_text(req.text)[:SMS_MAX_CHARS]
    if not cleaned:
        raise HTTPException(status_code=422, detail="SMS empty")

    vec = artifacts["sms_vectorizer"].transform([cleaned])
    proba = artifacts["sms_model"].predict_proba(vec)[0]
    scam_prob, _ = decide(proba)
    sorted_urls, worst_ratio = analyze_urls(req.text)

    return fuse_signals(req.id, req.text, scam_prob, sorted_urls, worst_ratio, 0.0, [], artifacts["sms_meta"]["model_version"])

@app.post("/predict/email/batch")
def predict_email_batch(req: BatchEmailRequest):
    return {"count": len(req.emails), "results": [predict_email(m) for m in req.emails]}