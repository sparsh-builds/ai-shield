import json

import joblib
import pandas as pd
from sklearn.metrics import (
    brier_score_loss,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

from preprocess import ML_DIR, clean_text
from train import load_split

MODEL_VERSION = "email-v1.0"
MODELS_DIR = ML_DIR / "models"
REPORTS_DIR = ML_DIR / "reports"
EXT_DIR = ML_DIR / "datasets" / "email" / "external"

if __name__ == "__main__":
    # 1. Load IBM (train + test parts = one external set)
    ibm = pd.concat(
        [
            pd.read_parquet(EXT_DIR / "train-00000-of-00001.parquet"),
            pd.read_parquet(EXT_DIR / "test-00000-of-00001.parquet"),
        ],
        ignore_index=True,
    )
    ibm["text_clean"] = ibm["features"].apply(clean_text)
    ibm = ibm[ibm["text_clean"] != ""]
    n_start = len(ibm)

    # 2. Remove conflicting-label texts, then exact duplicates inside IBM
    nunique = ibm.groupby("text_clean")["target"].nunique()
    conflicts = nunique[nunique > 1].index
    ibm = ibm[~ibm["text_clean"].isin(conflicts)]
    ibm = ibm.drop_duplicates(subset=["text_clean"])
    n_after_dedup = len(ibm)

    # 3. Remove anything also present in primary (train/val/test)
    primary = pd.concat([load_split(n) for n in ["train", "val", "test"]])
    ibm = ibm[~ibm["text_clean"].isin(set(primary["text_clean"]))].reset_index(drop=True)
    n_final = len(ibm)

    print(f"IBM rows start              : {n_start}")
    print(f"After internal dedupe       : {n_after_dedup}")
    print(f"After removing primary overlap: {n_final}")
    print(ibm["target"].value_counts().rename({0: "SAFE", 1: "PHISHING"}))

    # 4. Load saved artifacts, predict (NO training here)
    vectorizer = joblib.load(MODELS_DIR / f"{MODEL_VERSION}_vectorizer.joblib")
    model = joblib.load(MODELS_DIR / f"{MODEL_VERSION}_model.joblib")

    X = vectorizer.transform(ibm["text_clean"])
    y_true = ibm["target"]
    y_pred = model.predict(X)
    y_prob = model.predict_proba(X)[:, 1]

    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    brier = brier_score_loss(y_true, y_prob)

    print(f"\n--- External validation ({MODEL_VERSION} on IBM, cleaned) ---")
    print(classification_report(y_true, y_pred, target_names=["SAFE", "PHISHING"], digits=4))
    print(f"Confusion matrix: TN={tn} FP={fp} FN={fn} TP={tp}")
    print(f"Brier score: {brier:.4f}")

    # 5. Save report
    REPORTS_DIR.mkdir(exist_ok=True)
    report = {
        "model_version": MODEL_VERSION,
        "external_dataset": "IBM (train+test combined)",
        "rows_start": int(n_start),
        "rows_after_internal_dedupe": int(n_after_dedup),
        "rows_final_after_primary_overlap_removal": int(n_final),
        "metrics": {
            "precision": round(float(precision_score(y_true, y_pred)), 4),
            "recall": round(float(recall_score(y_true, y_pred)), 4),
            "f1": round(float(f1_score(y_true, y_pred)), 4),
            "brier_score": round(float(brier), 4),
            "false_negatives": int(fn),
            "false_positives": int(fp),
        },
    }
    with open(REPORTS_DIR / f"{MODEL_VERSION}_external_metrics.json", "w") as f:
        json.dump(report, f, indent=2)
    print("\nSaved external report.")