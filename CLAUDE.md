# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run dev      # Start dev server on port 3000 (includes localStorage polyfill for Node.js 25+)
npm run build    # Static export build (outputs to ./out)
npm run deploy   # Build + git push (triggers GitHub Pages deploy)
```

Note: No test suite is currently configured.

## Architecture Overview

**Good Days Dashboard** is a Next.js 15 mood tracking app with Firebase backend and localStorage fallback.

### Tech Stack
- **Framework**: Next.js 15 (App Router, static export)
- **UI**: React 19, Tailwind CSS v4, shadcn/ui (New York style), Framer Motion
- **Backend**: Firebase Realtime Database with localStorage fallback
- **AI**: Anthropic SDK for Claude-powered sentiment analysis

### Key Files
- `src/components/GoodDaysDashboard.tsx` - Main monolithic component (~1000 lines) containing Firebase init, data hooks, calendar UI, and all CRUD logic
- `src/app/api/analyze-sentiment/route.ts` - Claude API endpoint for monthly mood analysis
- `src/components/Celebration.tsx` - Post-save animation component
- `src/components/ThemeDrawer.tsx` - Theme (date ranges) management drawer

### Data Flow
The app uses three custom hooks in GoodDaysDashboard.tsx:
- `useAuth()` - Firebase Auth with Google sign-in
- `useEntries()` - Subscribes to mood entries, groups by date
- `useThemes()` - Subscribes to lifecycle themes (date ranges)

Firebase paths are root-level: `moodData/{YYYYMMDD}` and `themes/{id}`.

### Hydration Handling
Home page uses dynamic import with `ssr: false` to prevent hydration mismatches. The `isBrowser()` helper guards window/localStorage access.

### Date Handling
All dates use local timezone (not UTC). Key helpers:
- `isoLocal(date)` - Returns "YYYY-MM-DD"
- `isoToKey(iso)` - Returns "YYYYMMDD" for Firebase keys

## Deployment

Static export to GitHub Pages with custom domain (gooddays.dansalazar.org). The workflow in `.github/workflows/deploy.yml` builds and deploys on push to main.

## Environment Variables

- `ANTHROPIC_API_KEY` - Required for sentiment analysis endpoint (in `.env.local`)
- Firebase config is hardcoded (public keys)
