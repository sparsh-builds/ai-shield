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

MODELS_DIR = ML_DIR / "models"
EMAIL_VERSION = "email-v1.0"
EMAIL_THRESHOLD = 0.5
MAX_CHARS = 50000  # cap very long emails so one request cannot hang the server

artifacts = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs once at startup: load saved artifacts. No training here."""
    artifacts["email_vectorizer"] = joblib.load(MODELS_DIR / f"{EMAIL_VERSION}_vectorizer.joblib")
    artifacts["email_model"] = joblib.load(MODELS_DIR / f"{EMAIL_VERSION}_model.joblib")
    with open(MODELS_DIR / f"{EMAIL_VERSION}_meta.json") as f:
        artifacts["email_meta"] = json.load(f)
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
    return {"status": "ok", "loaded_models": [artifacts["email_meta"]["model_version"]]}


@app.post("/predict/email", response_model=PredictResponse)
def predict_email(req: PredictRequest):
    cleaned = clean_text(req.text)[:MAX_CHARS]
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