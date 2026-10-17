import json
from datetime import date

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, f1_score

from preprocess import ML_DIR
from preprocess_sms import LABEL_ID_MAP, RANDOM_STATE
from train_sms import SCAM_THRESHOLD, build_sms_vectorizer, decide, load_sms_split

MODEL_VERSION = "sms-v1.0"
MODELS_DIR = ML_DIR / "models"
REPORTS_DIR = ML_DIR / "reports"

if __name__ == "__main__":
    train_df = load_sms_split("train")
    test_df = load_sms_split("test")
    y_train = train_df["label_id"].to_numpy()
    y_test = test_df["label_id"].to_numpy()

    # 1. Fit vectorizer + LR on TRAIN only
    vectorizer = build_sms_vectorizer()
    X_train_vec = vectorizer.fit_transform(train_df["text_clean"])
    X_test_vec = vectorizer.transform(test_df["text_clean"])

    model = LogisticRegression(
        max_iter=1000, class_weight="balanced", random_state=RANDOM_STATE
    )
    model.fit(X_train_vec, y_train)
    assert list(model.classes_) == [0, 1, 2], "class order must be HAM, SPAM, SMISHING"

    # 2. One-time evaluation on TEST using the same decision rule as the API
    proba = model.predict_proba(X_test_vec)
    decisions = [decide(p) for p in proba]
    y_pred = np.array([LABEL_ID_MAP[cat] for _, cat in decisions])

    names = ["HAM", "SPAM", "SMISHING"]
    print("--- Final test results (sms-v1.0, LogisticRegression) ---")
    print(classification_report(y_test, y_pred, target_names=names, digits=4))
    print("Confusion matrix (rows = actual, cols = predicted: HAM, SPAM, SMISHING):")
    print(confusion_matrix(y_test, y_pred, labels=[0, 1, 2]))

    is_scam = y_test != 0
    scam_as_ham = int(((y_pred == 0) & is_scam).sum())
    ham_flagged = int(((y_pred != 0) & ~is_scam).sum())
    print(f"\nScams marked HAM (dangerous)  : {scam_as_ham} / {int(is_scam.sum())}")
    print(f"HAM flagged as scam (false alarm): {ham_flagged} / {int((~is_scam).sum())}")

    # 3. Save artifacts
    MODELS_DIR.mkdir(exist_ok=True)
    REPORTS_DIR.mkdir(exist_ok=True)
    joblib.dump(vectorizer, MODELS_DIR / f"{MODEL_VERSION}_vectorizer.joblib")
    joblib.dump(model, MODELS_DIR / f"{MODEL_VERSION}_model.joblib")

    meta = {
        "model_version": MODEL_VERSION,
        "trained_on": str(date.today()),
        "algorithm": "TF-IDF + LogisticRegression (multinomial, class_weight=balanced)",
        "selection": "5-fold CV on train: LR macro-F1 0.892 vs SVM 0.898 (tie, std ~0.02); LR chosen by lower scam_as_HAM and native probabilities",
        "labels": {"0": "HAM", "1": "SPAM", "2": "SMISHING"},
        "scam_probability": "1 - P(HAM) = P(SPAM) + P(SMISHING)",
        "scam_threshold": SCAM_THRESHOLD,
        "train_rows": int(len(train_df)),
        "test_metrics": {
            "macro_f1": round(float(f1_score(y_test, y_pred, average="macro")), 4),
            "scams_marked_ham": scam_as_ham,
            "scams_total": int(is_scam.sum()),
            "ham_flagged": ham_flagged,
            "ham_total": int((~is_scam).sum()),
        },
    }
    for path in [MODELS_DIR / f"{MODEL_VERSION}_meta.json", REPORTS_DIR / f"{MODEL_VERSION}_test_metrics.json"]:
        with open(path, "w") as f:
            json.dump(meta, f, indent=2)

    print(f"\nSaved artifacts in: {MODELS_DIR}")