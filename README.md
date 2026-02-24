# My Daily Tasks (Android)

A premium, AI-powered daily task manager with native Android features.

## Features
- **Outlook-style Timeline View**: Visualize your day.
- **AI Quick Add**: Type "Gym at 5pm" and let AI format it.
- **Camera Schedule Import**: Snap a photo of your calendar to auto-create tasks.
- **Theme Switcher**: Dark/Light mode support.
- **Local Storage**: Data stays on your device.

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Setup**:
    Create a `.env` file in the root:
    ```env
    VITE_GEMINI_API_KEY=your_api_key_here
    ```

3.  **Run on Web**:
    ```bash
    npm run dev
    ```

4.  **Build for Android**:
    ```bash
    npm run build
    npx cap add android
    npx cap sync
    npx cap open android
    ```
    (Then click "Run" in Android Studio to sideload to your device).

## Tech Stack
- React + Vite
- TailwindCSS
- Capacitor (Native Runtime)
- Google Generative AI (Gemini)
