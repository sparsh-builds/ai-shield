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
