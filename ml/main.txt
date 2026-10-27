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

# Paths & Artifact Config
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
    """Startup par trained artifacts memory me load honge (Zero-training lag)"""
    artifacts["email_vectorizer"] = joblib.load(MODELS_DIR / f"{EMAIL_VERSION}_vectorizer.joblib")
    artifacts["email_model"] = joblib.load(MODELS_DIR / f"{EMAIL_VERSION}_model.joblib")
    artifacts["email_meta"] = load_json(MODELS_DIR / f"{EMAIL_VERSION}_meta.json")

    artifacts["sms_vectorizer"] = joblib.load(MODELS_DIR / f"{SMS_VERSION}_vectorizer.joblib")
    artifacts["sms_model"] = joblib.load(MODELS_DIR / f"{SMS_VERSION}_model.joblib")
    artifacts["sms_meta"] = load_json(MODELS_DIR / f"{SMS_VERSION}_meta.json")
    
    assert list(artifacts["sms_model"].classes_) == [0, 1, 2], "Unexpected SMS class order"
    yield
    artifacts.clear()

app = FastAPI(
    title="AI Shield Cyber Defense Engine",
    version="2.0.0",
    description="Multi-Signal Late Fusion Engine: ML Semantic Model + Deep URL Heuristics",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================================
# URL HEURISTICS & THREAT RANKING ENGINE
# =====================================================================
URL_REGEX = re.compile(r"https?://[^\s<>\"')]+", re.IGNORECASE)
KNOWN_SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "ow.ly"}
SUSPICIOUS_TLDS = (".xyz", ".top", ".click", ".tk", ".ml", ".ga", ".cf", ".gq", ".work", ".zip", ".surf", ".monster")
TARGETED_BRANDS = ["paypal", "google", "microsoft", "netflix", "amazon", "apple", "sbi", "hdfc", "icici"]

def analyze_and_sort_urls(text: str, external_urls: Optional[List[str]] = None):
    found_urls = set(URL_REGEX.findall(text))
    if external_urls:
        found_urls.update(external_urls)

    threat_reports: List[Dict[str, Any]] = []

    for raw in found_urls:
        url_str = raw.strip()
        parsed = urlparse(url_str)
        hostname = (parsed.hostname or "").lower()

        score = 0
        indicators = []

        # 1. Bare IP Check
        if re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", hostname):
            score += 45
            indicators.append("Direct IP-based destination (No verified DNS)")

        # 2. Obfuscated Shortener Check
        if hostname in KNOWN_SHORTENERS:
            score += 35
            indicators.append("Obfuscated URL shortener hiding target endpoint")

        # 3. Excessive Subdomain Depth
        dot_count = hostname.count(".")
        if dot_count >= 3:
            score += 25
            indicators.append(f"Excessive subdomain nesting ({dot_count} dots)")

        # 4. Punycode Cyrillic/Homograph spoofing
        if "xn--" in hostname:
            score += 40
            indicators.append("Punycode homograph domain spoofing (Lookalike characters)")

        # 5. High-Risk Abused TLDs
        if any(hostname.endswith(tld) for tld in SUSPICIOUS_TLDS):
            score += 30
            indicators.append("High-risk or disposable Top-Level Domain (TLD)")

        # 6. Brand Spoofing / Impersonation
        for brand in TARGETED_BRANDS:
            if brand in url_str.lower() and not hostname.endswith(f"{brand}.com"):
                score += 40
                indicators.append(f"Potential Brand Spoofing: Matches pattern '{brand.capitalize()}'")
                break

        # 7. Insecure HTTP
        if parsed.scheme == "http":
            score += 15
            indicators.append("Plaintext HTTP connection (No TLS encryption)")

        normalized_score = min(100, score)
        threat_level = "CRITICAL" if normalized_score >= 70 else ("WARNING" if normalized_score >= 35 else "CLEAN")

        threat_reports.append({
            "url": url_str,
            "hostname": hostname,
            "riskScore": normalized_score,
            "threatLevel": threat_level,
            "indicators": indicators if indicators else ["No structural anomalies found"]
        })

    # SORTING: Highest risk URL hamesha index 0 par aayegi (Worst threat first)
    threat_reports.sort(key=lambda x: x["riskScore"], reverse=True)
    worst_ratio = (threat_reports[0]["riskScore"] / 100.0) if threat_reports else 0.0

    return threat_reports, worst_ratio

# =====================================================================
# RISK FUSION ENGINE
# =====================================================================
URGENCY_KEYWORDS = [
    'urgent', 'immediately', 'suspended', 'verify credentials',
    'password reset', 'account termination', 'unauthorized login',
    'security alert', 'debit card', 'lottery', 'kyc expired'
]

ACTION_DIRECTIVES = {
    "HIGH": "DO NOT INTERACT. Malicious payload detected. Report and purge from mailbox immediately.",
    "MEDIUM": "EXERCISE CAUTION. Suspicious elements flagged. Verify via secondary authentic channels.",
    "LOW": "SECURE. Minimal risk profile identified. Normal security vigilance applies."
}

def fuse_threat_signals(
    item_id: str,
    text: str,
    ml_probability: float,
    sorted_urls: List[Dict[str, Any]],
    worst_url_ratio: float,
    model_version: str
) -> Dict[str, Any]:
    # Weighted Fusion: 60% Semantic Intent + 40% URL Heuristics
    composite_score = (ml_probability * 60.0) + (worst_url_ratio * 40.0)

    # Critical Threat Override: Agar link dangerous hai toh text chahe jitna polite ho, alert high hoga
    if worst_url_ratio >= 0.60 and ml_probability >= 0.30:
        composite_score = max(composite_score, 82.0)

    final_score = int(round(max(0.0, min(100.0, composite_score))))

    # Explainability Reasons Generation
    reasons = []
    if sorted_urls and sorted_urls[0]["riskScore"] > 0:
        reasons.extend(sorted_urls[0]["indicators"])

    if ml_probability >= 0.60:
        reasons.append("High semantic probability of social engineering or deception")

    urgent_hits = [w for w in URGENCY_KEYWORDS if w in text.lower()]
    if urgent_hits and "Urgent coercion patterns detected" not in reasons:
        reasons.append(f"Urgency coercion markers found: {', '.join(urgent_hits[:2])}")

    if not reasons:
        reasons.append("No actionable malicious indicators found")

    risk_tier = "HIGH" if final_score >= 70 else ("MEDIUM" if final_score >= 35 else "LOW")
    category = "PHISHING" if risk_tier == "HIGH" else ("SUSPICIOUS" if risk_tier == "MEDIUM" else "SAFE")

    return {
        "id": item_id,
        "riskScore": final_score,
        "riskLevel": risk_tier,
        "category": category,
        "mlProbability": round(ml_probability, 4),
        "reasons": list(set(reasons)),
        "recommendedAction": ACTION_DIRECTIVES[risk_tier],
        "sortedThreatUrls": sorted_urls,
        "urlCount": len(sorted_urls),
        "modelVersion": model_version
    }

# =====================================================================
# API CONTRACTS & ROUTES
# =====================================================================
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
    return {
        "status": "OPERATIONAL",
        "models": [
            artifacts["email_meta"]["model_version"],
            artifacts["sms_meta"]["model_version"],
        ],
    }

@app.post("/predict/email")
def predict_email(req: EmailRequest):
    full_text = f"{req.subject} {req.body}".strip()
    cleaned = clean_text(full_text)[:EMAIL_MAX_CHARS]
    if not cleaned:
        raise HTTPException(status_code=422, detail="Text payload is empty after cleaning")

    # Step 1: Model Prediction via Tamanna's Calibrated Linear SVM
    vec = artifacts["email_vectorizer"].transform([cleaned])
    ml_prob = float(artifacts["email_model"].predict_proba(vec)[0, 1])

    # Step 2: Deep URL Analysis & Sorting
    sorted_urls, worst_ratio = analyze_and_sort_urls(full_text, req.urls)

    # Step 3: Late Fusion
    return fuse_threat_signals(
        item_id=req.id,
        text=full_text,
        ml_probability=ml_prob,
        sorted_urls=sorted_urls,
        worst_url_ratio=worst_ratio,
        model_version=artifacts["email_meta"]["model_version"]
    )

@app.post("/predict/sms")
def predict_sms(req: SMSRequest):
    cleaned = clean_text(req.text)[:SMS_MAX_CHARS]
    if not cleaned:
        raise HTTPException(status_code=422, detail="SMS payload is empty after cleaning")

    # Step 1: Model Prediction via Tamanna's Logistic Regression (HAM, SPAM, SMISHING)
    vec = artifacts["sms_vectorizer"].transform([cleaned])
    proba = artifacts["sms_model"].predict_proba(vec)[0]
    scam_prob, _ = decide(proba)

    # Step 2: Deep URL Analysis
    sorted_urls, worst_ratio = analyze_and_sort_urls(req.text)

    # Step 3: Late Fusion
    return fuse_threat_signals(
        item_id=req.id,
        text=req.text,
        ml_probability=scam_prob,
        sorted_urls=sorted_urls,
        worst_url_ratio=worst_ratio,
        model_version=artifacts["sms_meta"]["model_version"]
    )

@app.post("/predict/email/batch")
def predict_email_batch(req: BatchEmailRequest):
    """React Native Inbox open hote hi background auto-scan ke liye"""
    results = [predict_email(item) for item in req.emails]
    return {"count": len(results), "results": results}