# import joblib
# from fastapi import FastAPI
# from pydantic import BaseModel
# from sklearn.feature_extraction.text import TfidfVectorizer
# from sklearn.linear_model import LogisticRegression

# app = FastAPI(title="AI Shield ML Engine")

# # Prototype quick-fit training data
# TRAIN_TEXTS = [
#     "Your account is locked. Verify your credentials immediately or access will be terminated",
#     "Dear user, your bank security requires updating your password within 24 hours at this link",
#     "Urgent notification: unauthorized login attempt detected, verify identity now",
#     "Meeting agenda for tomorrow discussion and project timeline updates",
#     "Please find attached the quarterly status report and meeting minutes",
#     "Hey Sparsh, are we still meeting today at the library for group study?",
# ]
# TRAIN_LABELS = [1, 1, 1, 0, 0, 0]  # 1 = Phishing, 0 = Safe

# vectorizer = TfidfVectorizer(stop_words="english")
# X = vectorizer.fit_transform(TRAIN_TEXTS)
# model = LogisticRegression()
# model.fit(X, TRAIN_LABELS)


# class EmailPayload(BaseModel):
#   email_text: str


# @app.post("/predict")
# def predict_phishing(payload: EmailPayload):
#   vec = vectorizer.transform([payload.email_text])
#   prob = float(model.predict_proba(vec)[0][1])
#   category = "PHISHING" if prob >= 0.5 else "SAFE"
#   return {
#       "scam_probability": round(prob, 4),
#       "category": category,
#       "model_version": "v1.0-fastapi",
# }


import json
from contextlib import asynccontextmanager

import joblib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from preprocess import ML_DIR, clean_text
from train_sms import decide  # same decision rule used in evaluation

MODELS_DIR = ML_DIR / "models"
EMAIL_VERSION = "email-v1.0"
SMS_VERSION = "sms-v1.0"
EMAIL_THRESHOLD = 0.5
EMAIL_MAX_CHARS = 50000  # cap very long emails so one request cannot hang the server
SMS_MAX_CHARS = 5000

artifacts = {}


def load_json(path):
    with open(path) as f:
        return json.load(f)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs once at startup: load saved artifacts. No training here."""
    artifacts["email_vectorizer"] = joblib.load(MODELS_DIR / f"{EMAIL_VERSION}_vectorizer.joblib")
    artifacts["email_model"] = joblib.load(MODELS_DIR / f"{EMAIL_VERSION}_model.joblib")
    artifacts["email_meta"] = load_json(MODELS_DIR / f"{EMAIL_VERSION}_meta.json")

    artifacts["sms_vectorizer"] = joblib.load(MODELS_DIR / f"{SMS_VERSION}_vectorizer.joblib")
    artifacts["sms_model"] = joblib.load(MODELS_DIR / f"{SMS_VERSION}_model.joblib")
    artifacts["sms_meta"] = load_json(MODELS_DIR / f"{SMS_VERSION}_meta.json")
    # decide() assumes class order HAM, SPAM, SMISHING = 0, 1, 2
    assert list(artifacts["sms_model"].classes_) == [0, 1, 2], "unexpected SMS class order"
    yield
    artifacts.clear()


app = FastAPI(title="AI Shield ML Service", lifespan=lifespan)


class PredictRequest(BaseModel):
    text: str = Field(min_length=1)


class PredictResponse(BaseModel):
    scam_probability: float
    category: str
    model_version: str


@app.get("/health")
def health():
    return {
        "status": "ok",
        "loaded_models": [
            artifacts["email_meta"]["model_version"],
            artifacts["sms_meta"]["model_version"],
        ],
    }


@app.post("/predict/email", response_model=PredictResponse)
def predict_email(req: PredictRequest):
    cleaned = clean_text(req.text)[:EMAIL_MAX_CHARS]
    if not cleaned:
        raise HTTPException(status_code=422, detail="text is empty after cleaning")

    vec = artifacts["email_vectorizer"].transform([cleaned])
    prob = float(artifacts["email_model"].predict_proba(vec)[0, 1])  # P(PHISHING)
    category = "PHISHING" if prob >= EMAIL_THRESHOLD else "SAFE"

    return PredictResponse(
        scam_probability=round(prob, 4),
        category=category,
        model_version=artifacts["email_meta"]["model_version"],
    )


@app.post("/predict/sms", response_model=PredictResponse)
def predict_sms(req: PredictRequest):
    cleaned = clean_text(req.text)[:SMS_MAX_CHARS]
    if not cleaned:
        raise HTTPException(status_code=422, detail="text is empty after cleaning")

    vec = artifacts["sms_vectorizer"].transform([cleaned])
    proba = artifacts["sms_model"].predict_proba(vec)[0]  # [P(HAM), P(SPAM), P(SMISHING)]
    scam_prob, category = decide(proba)

    return PredictResponse(
        scam_probability=round(scam_prob, 4),
        category=category,
        model_version=artifacts["sms_meta"]["model_version"],
    )