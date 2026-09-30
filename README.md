# AI Shield: AI-Powered Personal Fraud Detection & Warning Layer

AI Shield is an Android-first assistive cybersecurity product that monitors user-permitted digital interactions (notifications, SMS, shared URLs), detects social-engineering and scam patterns using a hybrid risk engine, explains the findings, and warns users before unsafe action.

---

## Architecture & Project Structure

The project is divided across three core components:
* **`android/`**: Kotlin, Jetpack Compose, NotificationListenerService, Room, Retrofit
* **`backend/`**: Java 17+, Spring Boot, Spring Security, JWT, PostgreSQL
* **`ml-service/`**: Python 3.10+, FastAPI, scikit-learn / PyTorch

---

## Git Setup & Workflow for Team Members

### 1. Initial Setup (First Time Only)

Clone the repository and switch to the development branch:

```bash
# Clone the repository
git clone [https://github.com/](https://github.com/)<your-org-or-username>/ai-shield.git

# Move into the project directory
cd ai-shield

# Ensure you have the latest remote tracking branches
git fetch origin

# Switch to the shared integration branch
git checkout develop



pip install fastapi uvicorn scikit-learn
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

REACT NATIVE Set UP

# 1. New Expo Project create karo
npx create-expo-app@latest ai-shield-app --template blank

# 2. Project folder mein jao
cd ai-shield-app

# 3. Axios install karo (API call ke liye)
npm install axios

# 4. App start karo
npx expo start



pytho virtual env set UP



python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install pandas scikit-learn fastapi uvicorn joblib beautifulsoup4 lxml






