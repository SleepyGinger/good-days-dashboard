# Good Days Dashboard

A personal mood tracking application that helps you log daily entries, track patterns, and gain insights into your emotional well-being over time.

## Features

- Daily mood logging with customizable attributes (day quality, energy level, touch preference)
- Photo uploads for daily entries
- Interactive calendar view with visual indicators
- AI-powered sentiment analysis using Claude
- Theme tracking to mark important life periods
- Firebase authentication with Google sign-in
- Local storage fallback for offline use
- Static export for GitHub Pages deployment

## Tech Stack

- Next.js 15 (App Router, static export)
- React 19
- Tailwind CSS v4
- shadcn/ui components
- Firebase (Realtime Database, Authentication, Storage)
- Anthropic Claude API for sentiment analysis
- Framer Motion for animations

## Setup

### Prerequisites

- Node.js 20 or higher
- npm or yarn
- Firebase project
- Anthropic API key (optional, for sentiment analysis)

### Installation

1. Clone the repository

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file (copy from `.env.example`):
```bash
cp .env.example .env.local
```

4. Configure your environment variables in `.env.local`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Google Authentication in Firebase Authentication
3. Enable Realtime Database
4. Enable Storage
5. Configure security rules to restrict access to authenticated users

### Development

Run the development server:
```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Deployment

The app is configured for static export to GitHub Pages.

### Build

```bash
npm run build
```

This creates a static export in the `./out` directory.

### Deploy

Push to the `main` branch to trigger automatic deployment via GitHub Actions.

The deployment workflow is configured in `.github/workflows/deploy.yml`.

## Project Structure

- `src/app` - Next.js app router pages
- `src/components` - React components
  - `GoodDaysDashboard.tsx` - Main application component
  - `ThemeDrawer.tsx` - Theme management UI
  - `Celebration.tsx` - Post-save animation
  - `ui/` - shadcn/ui components
- `src/lib` - Utility functions and services
- `.env.example` - Environment variable template

## Configuration

See `CLAUDE.md` for detailed project configuration and architecture notes.

## License

Private project.
