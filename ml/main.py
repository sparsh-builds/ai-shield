import joblib
from fastapi import FastAPI
from pydantic import BaseModel
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

app = FastAPI(title="AI Shield ML Engine")

# Prototype quick-fit training data
TRAIN_TEXTS = [
    "Your account is locked. Verify your credentials immediately or access will be terminated",
    "Dear user, your bank security requires updating your password within 24 hours at this link",
    "Urgent notification: unauthorized login attempt detected, verify identity now",
    "Meeting agenda for tomorrow discussion and project timeline updates",
    "Please find attached the quarterly status report and meeting minutes",
    "Hey Sparsh, are we still meeting today at the library for group study?",
]
TRAIN_LABELS = [1, 1, 1, 0, 0, 0]  # 1 = Phishing, 0 = Safe

vectorizer = TfidfVectorizer(stop_words="english")
X = vectorizer.fit_transform(TRAIN_TEXTS)
model = LogisticRegression()
model.fit(X, TRAIN_LABELS)


class EmailPayload(BaseModel):
  email_text: str


@app.post("/predict")
def predict_phishing(payload: EmailPayload):
  vec = vectorizer.transform([payload.email_text])
  prob = float(model.predict_proba(vec)[0][1])
  category = "PHISHING" if prob >= 0.5 else "SAFE"
  return {
      "scam_probability": round(prob, 4),
      "category": category,
      "model_version": "v1.0-fastapi",
}