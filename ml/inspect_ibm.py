import pandas as pd

from preprocess import ML_DIR, clean_text
from train import load_split

EXT_DIR = ML_DIR / "datasets" / "email" / "external"

if __name__ == "__main__":
    ibm = pd.concat(
        [
            pd.read_parquet(EXT_DIR / "train-00000-of-00001.parquet"),
            pd.read_parquet(EXT_DIR / "test-00000-of-00001.parquet"),
        ],
        ignore_index=True,
    )
    ibm["text_clean"] = ibm["features"].apply(clean_text)

    print("IBM shape:", ibm.shape)
    print(ibm["target"].value_counts())

    # 1. What does each target mean?
    for t in [0, 1]:
        print(f"\n===== SAMPLES target = {t} =====")
        for text in ibm[ibm["target"] == t].sample(4, random_state=42)["text_clean"]:
            print("-", repr(text[:200]))

    # 2. Overlap with primary dataset
    primary = pd.concat([load_split(n) for n in ["train", "val", "test"]])
    primary_texts = set(primary["text_clean"])
    overlap = ibm["text_clean"].isin(primary_texts).sum()
    print(f"\nIBM rows also in primary dataset: {overlap} / {len(ibm)}")
    print("Duplicate texts inside IBM:", ibm.duplicated(subset=["text_clean"]).sum())