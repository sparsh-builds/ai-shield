import pandas as pd
from sklearn.model_selection import train_test_split

from preprocess import ML_DIR, clean_text

RAW_SMS_ZIP = ML_DIR / "datasets" / "sms" / "raw" / "Dataset_5971.zip"
PROCESSED_SMS_DIR = ML_DIR / "datasets" / "sms" / "processed"

LABEL_ID_MAP = {"HAM": 0, "SPAM": 1, "SMISHING": 2}
RANDOM_STATE = 42
SAVE_COLUMNS = ["text_clean", "label", "label_id", "url", "email", "phone"]


def load_raw_sms() -> pd.DataFrame:
    """Read the CSV directly from the zip. Raw zip never modified."""
    try:
        return pd.read_csv(RAW_SMS_ZIP, encoding="utf-8")
    except UnicodeDecodeError:
        return pd.read_csv(RAW_SMS_ZIP, encoding="latin-1")


def normalize_sms(df: pd.DataFrame) -> pd.DataFrame:
    """Rename columns, normalize labels to HAM/SPAM/SMISHING, add label_id."""
    df = df.rename(columns={"TEXT": "text", "URL": "url", "EMAIL": "email", "PHONE": "phone"})
    df["label"] = df["LABEL"].str.strip().str.upper()

    unknown = set(df["label"]) - set(LABEL_ID_MAP)
    if unknown:
        raise ValueError(f"Unknown labels: {unknown}")

    df["label_id"] = df["label"].map(LABEL_ID_MAP)
    df = df.drop(columns=["LABEL"])

    before = len(df)
    df = df.dropna(subset=["text"])
    df = df[df["text"].str.strip() != ""].reset_index(drop=True)
    print(f"Rows removed (missing/empty text): {before - len(df)}")
    return df


def add_clean_text(df: pd.DataFrame) -> pd.DataFrame:
    """Light cleaning only. Keep URLs, numbers, symbols, case."""
    df = df.copy()
    df["text_clean"] = df["text"].apply(clean_text)
    before = len(df)
    df = df[df["text_clean"] != ""].reset_index(drop=True)
    print(f"Rows removed (empty after cleaning): {before - len(df)}")
    return df


def remove_duplicates(df: pd.DataFrame) -> pd.DataFrame:
    """Drop conflicting-label texts first, then exact duplicates."""
    df = df.copy()
    n_start = len(df)

    label_sets = df.groupby("text_clean")["label"].agg(lambda s: tuple(sorted(set(s))))
    conflicts = label_sets[label_sets.apply(len) > 1]
    if len(conflicts) > 0:
        print("Conflicting label pairs (unique texts):")
        print(conflicts.value_counts().to_string())
    n_conflict_rows = df["text_clean"].isin(conflicts.index).sum()
    df = df[~df["text_clean"].isin(conflicts.index)]

    n_before = len(df)
    df = df.drop_duplicates(subset=["text_clean"], keep="first").reset_index(drop=True)

    print(f"Conflicting-label rows removed: {n_conflict_rows}")
    print(f"Exact duplicate rows removed  : {n_before - len(df)}")
    print(f"Rows: {n_start} -> {len(df)}")
    return df


def split_and_save(df: pd.DataFrame) -> None:
    """Stratified 70/15/15 split on the 3 classes. Save train/val/test CSVs."""
    train_df, temp_df = train_test_split(
        df,
        test_size=0.30,
        stratify=df["label_id"],
        random_state=RANDOM_STATE,
    )
    val_df, test_df = train_test_split(
        temp_df,
        test_size=0.50,
        stratify=temp_df["label_id"],
        random_state=RANDOM_STATE,
    )

    # Leakage check: no exact text shared between splits
    train_set = set(train_df["text_clean"])
    val_set = set(val_df["text_clean"])
    test_set = set(test_df["text_clean"])
    assert not (train_set & val_set), "Leakage: train/val overlap"
    assert not (train_set & test_set), "Leakage: train/test overlap"
    assert not (val_set & test_set), "Leakage: val/test overlap"

    PROCESSED_SMS_DIR.mkdir(parents=True, exist_ok=True)
    for name, part in {"train": train_df, "val": val_df, "test": test_df}.items():
        path = PROCESSED_SMS_DIR / f"sms_{name}.csv"
        part[SAVE_COLUMNS].to_csv(path, index=False)
        counts = part["label"].value_counts().to_dict()
        print(f"{name:5s}: {len(part):5d} rows | {counts} | saved -> {path.name}")
        
        
if __name__ == "__main__":
    df = load_raw_sms()
    df = normalize_sms(df)
    df = add_clean_text(df)
    df = remove_duplicates(df)

    print("\nOverall class share (%):")
    print((df["label"].value_counts(normalize=True) * 100).round(2).to_string())
    print()
    split_and_save(df)