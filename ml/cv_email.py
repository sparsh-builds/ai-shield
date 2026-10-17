import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from train import RANDOM_STATE, build_vectorizer, load_split

if __name__ == "__main__":
    train_df = load_split("train")
    X, y = train_df["text_clean"], train_df["label_id"]

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

    candidates = {
        "LogisticRegression": LogisticRegression(
            max_iter=1000, class_weight="balanced", random_state=RANDOM_STATE
        ),
        "LinearSVM": LinearSVC(class_weight="balanced", random_state=RANDOM_STATE),
    }

    rows = []
    for name, clf in candidates.items():
        pipe = Pipeline([("tfidf", build_vectorizer()), ("clf", clf)])
        scores = cross_validate(
            pipe, X, y, cv=cv, scoring=["precision", "recall", "f1"]
        )
        row = {"model": name}
        for metric in ["precision", "recall", "f1"]:
            vals = scores[f"test_{metric}"]
            row[metric] = f"{vals.mean():.4f} +/- {vals.std():.4f}"
        rows.append(row)
        print(f"done: {name}")

    print("\n--- 5-fold CV on TRAIN (positive class = PHISHING) ---")
    print(pd.DataFrame(rows).to_string(index=False))