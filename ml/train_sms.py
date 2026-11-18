import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, recall_score
from sklearn.model_selection import StratifiedKFold
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from preprocess_sms import PROCESSED_SMS_DIR, RANDOM_STATE

LABEL_NAMES = {0: "HAM", 1: "SPAM", 2: "SMISHING"}


SCAM_THRESHOLD = 0.5


def decide(proba: np.ndarray) -> tuple[float, str]:
    """proba = [P(HAM), P(SPAM), P(SMISHING)] in class-id order 0, 1, 2."""
    scam_prob = float(1.0 - proba[0])
    if scam_prob < SCAM_THRESHOLD:
        return scam_prob, "HAM"
    category = "SPAM" if proba[1] >= proba[2] else "SMISHING"
    return scam_prob, category


def load_sms_split(name: str) -> pd.DataFrame:
    """Load one processed SMS split: train / val / test."""
    return pd.read_csv(PROCESSED_SMS_DIR / f"sms_{name}.csv")


def build_sms_vectorizer() -> TfidfVectorizer:
    return TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True)


def build_sms_models() -> dict:
    return {
        "LogisticRegression": LogisticRegression(
            max_iter=1000, class_weight="balanced", random_state=RANDOM_STATE
        ),
        "LinearSVM": LinearSVC(class_weight="balanced", random_state=RANDOM_STATE),
        "NaiveBayes": MultinomialNB(),
    }


def fold_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """Metrics for one fold. Class ids: 0 = HAM, 1 = SPAM, 2 = SMISHING."""
    recalls = recall_score(y_true, y_pred, labels=[0, 1, 2], average=None)
    scam = y_true != 0
    ham = y_true == 0
    return {
        "macro_f1": f1_score(y_true, y_pred, average="macro"),
        "recall_HAM": recalls[0],
        "recall_SPAM": recalls[1],
        "recall_SMISH": recalls[2],
        "scam_as_HAM": ((y_pred == 0) & scam).sum() / scam.sum(),
        "ham_flagged": ((y_pred != 0) & ham).sum() / ham.sum(),
    }


if __name__ == "__main__":
    train_df = load_sms_split("train")
    X = train_df["text_clean"]
    y = train_df["label_id"].to_numpy()

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

    rows = []
    for name, clf in build_sms_models().items():
        per_fold = []
        for train_idx, test_idx in cv.split(X, y):
            pipe = Pipeline([("tfidf", build_sms_vectorizer()), ("clf", clf)])
            pipe.fit(X.iloc[train_idx], y[train_idx])
            y_pred = pipe.predict(X.iloc[test_idx])
            per_fold.append(fold_metrics(y[test_idx], y_pred))
        folds = pd.DataFrame(per_fold)
        row = {"model": name}
        for col in folds.columns:
            row[col] = f"{folds[col].mean():.3f}+/-{folds[col].std():.3f}"
        rows.append(row)
        print(f"done: {name}")

    print("\n--- 5-fold CV on SMS TRAIN ---")
    print(pd.DataFrame(rows).to_string(index=False))