import json

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

from inspect_uci import load_uci
from preprocess import ML_DIR
from preprocess_sms import add_clean_text, load_raw_sms, normalize_sms
from train_sms import decide

MODEL_VERSION = "sms-v1.0"
MODELS_DIR = ML_DIR / "models"
REPORTS_DIR = ML_DIR / "reports"

if __name__ == "__main__":
    # 1. Load UCI, remove conflicts and internal duplicates
    uci = load_uci()
    uci = uci[uci["text_clean"] != ""]
    n_start = len(uci)

    nunique = uci.groupby("text_clean")["label"].nunique()
    conflicts = nunique[nunique > 1].index
    uci = uci[~uci["text_clean"].isin(conflicts)]
    uci = uci.drop_duplicates(subset=["text_clean"])
    n_after_dedupe = len(uci)

    # 2. Remove anything present in the FULL primary data
    primary = add_clean_text(normalize_sms(load_raw_sms()))
    uci = uci[~uci["text_clean"].isin(set(primary["text_clean"]))].reset_index(drop=True)
    n_final = len(uci)

    print(f"\nUCI rows start                 : {n_start}")
    print(f"After internal dedupe          : {n_after_dedupe}")
    print(f"After removing primary overlap : {n_final}")
    print(uci["label"].value_counts().to_string())

    # 3. Load saved artifacts, predict (NO training)
    vectorizer = joblib.load(MODELS_DIR / f"{MODEL_VERSION}_vectorizer.joblib")
    model = joblib.load(MODELS_DIR / f"{MODEL_VERSION}_model.joblib")
    assert list(model.classes_) == [0, 1, 2]

    proba = model.predict_proba(vectorizer.transform(uci["text_clean"]))
    decisions = [decide(p) for p in proba]
    scam_probs = np.array([p for p, _ in decisions])
    cats = pd.Series([c for _, c in decisions])

    # 4. Binary evaluation: HAM vs scam (UCI SPAM = scam)
    y_true = (uci["label"] == "SPAM").astype(int).to_numpy()
    y_pred = (cats != "HAM").astype(int).to_numpy()
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    brier = brier_score_loss(y_true, scam_probs)

    print(f"\n--- External validation ({MODEL_VERSION} on UCI, binary HAM vs scam) ---")
    print(f"Scam precision: {precision_score(y_true, y_pred):.4f}")
    print(f"Scam recall   : {recall_score(y_true, y_pred):.4f}")
    print(f"Scam F1       : {f1_score(y_true, y_pred):.4f}")
    print(f"Confusion: TN={tn} FP={fp} FN={fn} TP={tp}")
    print(f"Scams marked HAM (dangerous)     : {fn} / {fn + tp}")
    print(f"HAM flagged as scam (false alarm): {fp} / {fp + tn}")
    print(f"Brier score: {brier:.4f}")
    print("\nTrue UCI SPAM -> predicted category:")
    print(cats[y_true == 1].value_counts().to_string())

    # 5. Save report
    REPORTS_DIR.mkdir(exist_ok=True)
    report = {
        "model_version": MODEL_VERSION,
        "external_dataset": "UCI SMS Spam Collection (binary HAM vs scam only)",
        "note": "UCI has no SMISHING class. 85% of UCI was already in primary data; only independent rows scored.",
        "rows_start": int(n_start),
        "rows_after_internal_dedupe": int(n_after_dedupe),
        "rows_final_after_primary_overlap_removal": int(n_final),
        "metrics": {
            "scam_precision": round(float(precision_score(y_true, y_pred)), 4),
            "scam_recall": round(float(recall_score(y_true, y_pred)), 4),
            "scam_f1": round(float(f1_score(y_true, y_pred)), 4),
            "brier_score": round(float(brier), 4),
            "scams_marked_ham": int(fn),
            "scams_total": int(fn + tp),
            "ham_flagged": int(fp),
            "ham_total": int(fp + tn),
        },
    }
    with open(REPORTS_DIR / f"{MODEL_VERSION}_external_metrics.json", "w") as f:
        json.dump(report, f, indent=2)
    print("\nSaved external report.")