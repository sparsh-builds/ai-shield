import re
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split 

# Paths
ML_DIR = Path(__file__).resolve().parent
RAW_EMAIL_PATH = ML_DIR / "datasets" / "email" / "raw" / "Phishing_Email.csv"
PROCESSED_EMAIL_DIR = ML_DIR / "datasets" / "email" / "processed"

# Label mapping
LABEL_MAP = {
    "Safe Email": "SAFE",
    "Phishing Email": "PHISHING",
}
LABEL_ID_MAP = {"SAFE": 0, "PHISHING": 1}  # PHISHING = positive class
RANDOM_STATE = 42
SAVE_COLUMNS = ["text_clean", "label", "label_id"]

# Regex for text cleaning
CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
MULTI_SPACE = re.compile(r"\s+")


def load_raw_email() -> pd.DataFrame:
    """Load raw email CSV. Raw file never modified."""
    df = pd.read_csv(RAW_EMAIL_PATH)
    return df


def select_and_drop_missing(df: pd.DataFrame) -> pd.DataFrame:
    """Keep only text + label columns, rename them, drop rows with missing text."""
    df = df[["Email Text", "Email Type"]].copy()
    df = df.rename(columns={"Email Text": "text", "Email Type": "label"})

    before = len(df)
    df = df.dropna(subset=["text"])
    df = df[df["text"].str.strip() != ""]
    df = df.reset_index(drop=True)
    print(f"Rows removed (missing/empty text): {before - len(df)}")
    return df


def normalize_labels(df: pd.DataFrame) -> pd.DataFrame:
    """Map raw labels to SAFE / PHISHING and add numeric label_id."""
    df = df.copy()
    df["label"] = df["label"].str.strip().map(LABEL_MAP)

    if df["label"].isna().any():
        bad = df[df["label"].isna()].shape[0]
        raise ValueError(f"{bad} rows have unknown label. Check LABEL_MAP.")

    df["label_id"] = df["label"].map(LABEL_ID_MAP)
    return df


def clean_text(text: str) -> str:
    """Light cleaning. Keep URLs, numbers, symbols, email addresses, case."""
    text = str(text)
    text = CONTROL_CHARS.sub(" ", text)   # invisible junk chars -> space
    text = MULTI_SPACE.sub(" ", text)     # many spaces/newlines/tabs -> one space
    return text.strip()


def add_clean_text(df: pd.DataFrame) -> pd.DataFrame:
    """Add text_clean column. Original text column kept for comparison."""
    df = df.copy()
    df["text_clean"] = df["text"].apply(clean_text)

    before = len(df)
    df = df[df["text_clean"] != ""].reset_index(drop=True)
    print(f"Rows removed (empty after cleaning): {before - len(df)}")
    return df


def remove_duplicates(df: pd.DataFrame) -> pd.DataFrame:
    """Remove exact duplicate texts. Drop texts with conflicting labels."""
    df = df.copy()
    n_start = len(df)

    # 1. Texts that appear with more than one distinct label
    label_count = df.groupby("text_clean")["label"].nunique()
    conflict_texts = label_count[label_count > 1].index
    n_conflict_rows = df["text_clean"].isin(conflict_texts).sum()
    df = df[~df["text_clean"].isin(conflict_texts)]

    # 2. Exact duplicates with same label: keep first
    n_before_dedup = len(df)
    df = df.drop_duplicates(subset=["text_clean"], keep="first")
    n_exact_dups = n_before_dedup - len(df)

    df = df.reset_index(drop=True)
    print(f"Conflicting-label rows removed: {n_conflict_rows}")
    print(f"Exact duplicate rows removed  : {n_exact_dups}")
    print(f"Rows: {n_start} -> {len(df)}")
    return df


def split_and_save(df: pd.DataFrame) -> None:
    """Stratified 70/15/15 split. Save train/val/test CSVs."""
    # Step A: 70% train, 30% temp
    train_df, temp_df = train_test_split(
        df,
        test_size=0.30,
        stratify=df["label_id"],
        random_state=RANDOM_STATE,
    )
    # Step B: temp -> 15% val, 15% test (half-half)
    val_df, test_df = train_test_split(
        temp_df,
        test_size=0.50,
        stratify=temp_df["label_id"],
        random_state=RANDOM_STATE,
    )

    # Leakage check: no text shared between splits
    train_set = set(train_df["text_clean"])
    val_set = set(val_df["text_clean"])
    test_set = set(test_df["text_clean"])
    assert not (train_set & val_set), "Leakage: train/val overlap"
    assert not (train_set & test_set), "Leakage: train/test overlap"
    assert not (val_set & test_set), "Leakage: val/test overlap"

    PROCESSED_EMAIL_DIR.mkdir(parents=True, exist_ok=True)
    splits = {"train": train_df, "val": val_df, "test": test_df}
    for name, part in splits.items():
        path = PROCESSED_EMAIL_DIR / f"email_{name}.csv"
        part[SAVE_COLUMNS].to_csv(path, index=False)
        ratio = part["label_id"].mean() * 100
        print(f"{name:5s}: {len(part):6d} rows | PHISHING {ratio:.2f}% | saved -> {path.name}")
        
        
if __name__ == "__main__":
    df = load_raw_email()
    df = select_and_drop_missing(df)
    df = normalize_labels(df)
    df = add_clean_text(df)
    df = remove_duplicates(df)

    print(f"\nOverall PHISHING %: {df['label_id'].mean() * 100:.2f}%")
    split_and_save(df)