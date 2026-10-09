# AI Shield: ML Service Setup

Python FastAPI service that serves the trained phishing/scam classifiers.
The service loads saved model files. It does **not** train on startup.

## Requirements

- Python 3.10
- Packages pinned in `requirements.txt` (the saved `.joblib` files need scikit-learn 1.6.1)

## Install

```cmd
cd ml
pip install -r requirements.txt
```

## Run the API

Run from inside the `ml` folder:

```cmd
cd ml
python -m uvicorn main:app --reload
```

- Interactive docs: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/health

## Endpoints

### POST /predict/email

Request:

```json
{ "text": "email text here" }
```

Response:

```json
{
  "scam_probability": 0.97,
  "category": "PHISHING",
  "model_version": "email-v1.0"
}
```

- `scam_probability` is P(PHISHING), between 0 and 1.
- `category` is `PHISHING` if probability >= 0.5, else `SAFE`.
- Empty text returns HTTP 422.

### POST /predict/sms

Request:

```json
{ "text": "sms text here" }
```

Response:

```json
{
  "scam_probability": 0.91,
  "category": "SMISHING",
  "model_version": "sms-v1.0"
}
```

- `scam_probability` = P(SPAM) + P(SMISHING) = 1 - P(HAM).
- `category` is `HAM` if `scam_probability` < 0.5. Otherwise it is `SPAM` or `SMISHING`, whichever has the higher probability.
- Use `scam_probability` for the warning. SPAM vs SMISHING overlap in the source data, so treat `category` as a hint.
- Empty text returns HTTP 422.

## Model files (`ml/models/`)

| File | Purpose |
|---|---|
| `email-v1.0_vectorizer.joblib` | Fitted TF-IDF vectorizer |
| `email-v1.0_model.joblib` | Calibrated Linear SVM |
| `email-v1.0_meta.json` | Version, training date, test metrics |
| `sms-v1.0_vectorizer.joblib` | Fitted TF-IDF vectorizer (SMS) |
| `sms-v1.0_model.joblib` | Logistic Regression, 3 classes (HAM, SPAM, SMISHING) |
| `sms-v1.0_meta.json` | Version, training date, test metrics |

Model files are small (about 4 MB) and committed to the repo.
Only load `.joblib` files from this repo. They are pickles and can execute code.

## Reproduce the data and model (optional)

Datasets are not committed. Put the raw files in `ml/datasets/` (see `.gitignore` for the layout), then:

```cmd
cd ml
python preprocess.py
python train.py
python train_email_final.py
python eval_email_external.py
```

## Email model results (email-v1.0)

Metrics are in `reports/` and `models/email-v1.0_meta.json`.
Known limitation: both email datasets come from related public sources, so real-world performance can differ.
Transactional mails (for example order shipped notices) can score close to the threshold.

## SMS model results (sms-v1.0)

- Test set (n = 870): macro-F1 0.906. Scams marked HAM: 8 / 144. HAM flagged as scam: 6 / 726.
- External check on UCI SMS Spam Collection (n = 683 independent rows, binary HAM vs scam): scam recall 0.992, scam precision 0.981.
- Limitations:
  - SPAM and SMISHING overlap (34 texts carry both labels in the source data). Category is less reliable than `scam_probability`.
  - UCI has no SMISHING class, so the SMISHING class is not validated externally.
  - 85% of UCI was already in the primary dataset, so the external set is small.