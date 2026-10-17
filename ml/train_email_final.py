import json
from datetime import date

import joblib
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    brier_score_loss,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.svm import LinearSVC

from train import RANDOM_STATE, ML_DIR, build_vectorizer, load_split

MODEL_VERSION = "email-v1.0"
MODELS_DIR = ML_DIR / "models"
REPORTS_DIR = ML_DIR / "reports"

if __name__ == "__main__":
    train_df = load_split("train")
    test_df = load_split("test")

    X_train, y_train = train_df["text_clean"], train_df["label_id"]
    X_test, y_test = test_df["text_clean"], test_df["label_id"]

    # 1. Fit vectorizer + calibrated SVM on TRAIN only
    vectorizer = build_vectorizer()
    X_train_vec = vectorizer.fit_transform(X_train)
    X_test_vec = vectorizer.transform(X_test)

    base_svm = LinearSVC(class_weight="balanced", random_state=RANDOM_STATE)
    model = CalibratedClassifierCV(base_svm, method="sigmoid", cv=5)
    model.fit(X_train_vec, y_train)

    # 2. One-time evaluation on TEST
    y_pred = model.predict(X_test_vec)
    y_prob = model.predict_proba(X_test_vec)[:, 1]  # P(PHISHING)
    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()

    print("--- Final test results (email-v1.0, Calibrated LinearSVM) ---")
    print(classification_report(y_test, y_pred, target_names=["SAFE", "PHISHING"], digits=4))
    print(f"Confusion matrix: TN={tn} FP={fp} FN={fn} TP={tp}")
    brier = brier_score_loss(y_test, y_prob)
    print(f"Brier score (lower = better calibrated): {brier:.4f}")
    print(f"Mean P(PHISHING) on true SAFE     : {y_prob[y_test == 0].mean():.4f}")
    print(f"Mean P(PHISHING) on true PHISHING : {y_prob[y_test == 1].mean():.4f}")

    # 3. Save artifacts
    MODELS_DIR.mkdir(exist_ok=True)
    REPORTS_DIR.mkdir(exist_ok=True)
    joblib.dump(vectorizer, MODELS_DIR / f"{MODEL_VERSION}_vectorizer.joblib")
    joblib.dump(model, MODELS_DIR / f"{MODEL_VERSION}_model.joblib")

    meta = {
        "model_version": MODEL_VERSION,
        "trained_on": str(date.today()),
        "algorithm": "TF-IDF + CalibratedClassifierCV(LinearSVC, sigmoid, cv=5)",
        "selection": "5-fold CV on train: SVM F1 0.9821 vs LR 0.9741",
        "labels": {"0": "SAFE", "1": "PHISHING"},
        "train_rows": int(len(train_df)),
        "test_metrics": {
            "precision": round(float(precision_score(y_test, y_pred)), 4),
            "recall": round(float(recall_score(y_test, y_pred)), 4),
            "f1": round(float(f1_score(y_test, y_pred)), 4),
            "brier_score": round(float(brier), 4),
            "false_negatives": int(fn),
            "false_positives": int(fp),
        },
    }
    with open(MODELS_DIR / f"{MODEL_VERSION}_meta.json", "w") as f:
        json.dump(meta, f, indent=2)
    with open(REPORTS_DIR / f"{MODEL_VERSION}_test_metrics.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nSaved artifacts in: {MODELS_DIR}")