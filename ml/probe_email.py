import joblib

from preprocess import ML_DIR, clean_text

MODEL_VERSION = "email-v1.0"
MODELS_DIR = ML_DIR / "models"

SAMPLES = [
    ("PHISHING", "Security alert: unusual sign-in to your account. Verify your identity within 24 hours or your account will be suspended. Click here: http://secure-login-verify.example.com"),
    ("PHISHING", "Dear customer, your KYC has expired. Update your details now to avoid account block: http://bank-kyc-update.example.net"),
    ("PHISHING", "Your package could not be delivered. Pay a small redelivery fee of Rs 29 here: http://track-parcel.example.org"),
    ("PHISHING", "Congratulations! You are selected for a work from home job. Earn 5000 per day. Send your bank details to claim."),
    ("SAFE", "Hi team, reminder that the project review meeting is tomorrow at 11 am in room 204. Please bring your progress reports."),
    ("SAFE", "Hi Tamanna, I have attached the notes from today's lecture. Let me know if you need the slides as well."),
    ("SAFE", "Your order has been shipped and will arrive on Friday. Thank you for shopping with us."),
    ("SAFE", "Please find the invoice for last month attached. Let me know if anything looks incorrect."),
]

if __name__ == "__main__":
    vectorizer = joblib.load(MODELS_DIR / f"{MODEL_VERSION}_vectorizer.joblib")
    model = joblib.load(MODELS_DIR / f"{MODEL_VERSION}_model.joblib")

    for expected, text in SAMPLES:
        vec = vectorizer.transform([clean_text(text)])
        prob = model.predict_proba(vec)[0, 1]
        predicted = "PHISHING" if prob >= 0.5 else "SAFE"
        flag = "OK " if predicted == expected else "MISS"
        print(f"{flag} expected={expected:8s} P(PHISHING)={prob:.3f} | {text[:60]}...")