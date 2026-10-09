import csv
import zipfile

import pandas as pd

from preprocess import ML_DIR, clean_text
from preprocess_sms import add_clean_text, load_raw_sms, normalize_sms

UCI_ZIP = ML_DIR / "datasets" / "sms" / "external" / "sms+spam+collection.zip"


def load_uci() -> pd.DataFrame:
    """Read SMSSpamCollection (tab-separated, no header) straight from the zip."""
    with zipfile.ZipFile(UCI_ZIP) as z:
        with z.open("SMSSpamCollection") as f:
            df = pd.read_csv(
                f,
                sep="\t",
                header=None,
                names=["label", "text"],
                quoting=csv.QUOTE_NONE,
                encoding="latin-1",
            )
    df["label"] = df["label"].str.strip().str.upper()
    df["text_clean"] = df["text"].apply(clean_text)
    return df


if __name__ == "__main__":
    uci = load_uci()
    print("UCI shape:", uci.shape)
    print(uci["label"].value_counts())
    print("Duplicate texts inside UCI:", uci.duplicated(subset=["text_clean"]).sum())

    # Overlap with the FULL primary data (before dedupe, so dropped rows count too)
    primary = add_clean_text(normalize_sms(load_raw_sms()))
    primary_texts = set(primary["text_clean"])
    in_primary = uci["text_clean"].isin(primary_texts)

    print(f"\nUCI rows also in primary: {in_primary.sum()} / {len(uci)}")
    print(uci[in_primary]["label"].value_counts())