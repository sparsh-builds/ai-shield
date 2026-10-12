from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score
from sklearn.naive_bayes import MultinomialNB
from sklearn.svm import LinearSVC

ML_DIR = Path(__file__).resolve().parent
PROCESSED_EMAIL_DIR = ML_DIR / "datasets" / "email" / "processed"
RANDOM_STATE = 42
REPORTS_DIR = ML_DIR / "reports"

def load_split(name: str) -> pd.DataFrame:
    """Load one processed split: train / val / test."""
    return pd.read_csv(PROCESSED_EMAIL_DIR / f"email_{name}.csv")


def build_vectorizer() -> TfidfVectorizer:
    return TfidfVectorizer(
        ngram_range=(1, 2),
        min_df=2,
        max_features=50000,
        sublinear_tf=True,
    )


def build_models() -> dict:
    return {
        "LogisticRegression": LogisticRegression(
            max_iter=1000, class_weight="balanced", random_state=RANDOM_STATE
        ),
        "LinearSVM": LinearSVC(
            class_weight="balanced", random_state=RANDOM_STATE
        ),
        "NaiveBayes": MultinomialNB(),
    }


if __name__ == "__main__":
    train_df = load_split("train")
    val_df = load_split("val")

    X_train, y_train = train_df["text_clean"], train_df["label_id"]
    X_val, y_val = val_df["text_clean"], val_df["label_id"]

    # TF-IDF: fit ONLY on train, shared by all models
    vectorizer = build_vectorizer()
    X_train_vec = vectorizer.fit_transform(X_train)
    X_val_vec = vectorizer.transform(X_val)

    rows = []
    for name, model in build_models().items():
        model.fit(X_train_vec, y_train)
        y_pred = model.predict(X_val_vec)
        tn, fp, fn, tp = confusion_matrix(y_val, y_pred).ravel()
        rows.append(
            {
                "model": name,
                "precision": precision_score(y_val, y_pred),
                "recall": recall_score(y_val, y_pred),
                "f1": f1_score(y_val, y_pred),
                "FN": fn,
                "FP": fp,
            }
        )

    results = pd.DataFrame(rows).sort_values("recall", ascending=False)
    print("--- Validation results (positive class = PHISHING) ---")
    print(results.to_string(index=False, float_format=lambda x: f"{x:.4f}"))
    
    REPORTS_DIR.mkdir(exist_ok=True)
    out_path = REPORTS_DIR / "email_model_comparison_val.csv"
    results.to_csv(out_path, index=False)
    print(f"\nSaved -> {out_path}")