# Life Brain

Tasks, calendar, notes, journal, habits and goals in one simple app, with an optional AI that looks for patterns. Everything stays on your phone. There's no account and no server.

## The five tabs

- **Home.** A 30-second look at the day, opened first. One line sums up the day, the calendar is drawn as a line that rises where the day is fuller (a sun marks open time, a clay dot marks now), and morning, afternoon and evening each get a sentence. Below: **Needs attention** (overdue and today's tasks, tomorrow's events, streaks not yet ticked, goals nearly done), **Already sorted** (what got done, habits kept, yesterday's journal) and up to two **Worth knowing** patterns. Tap any bold title to open it. Add your name in Settings and the headline uses it.
- **Today.** Today's tasks: type to add one, tap the circle to tick it off. Undated tasks sit under *Anytime*. Below them are your habits (tap to tick) and one journal box with a mood.
- **Calendar.** The month. Tap a day to see and add its tasks and events, and to read or write that day's journal. Swipe sideways to change month.
- **Notes.** Notes you can search and pin. The *Journal* switch lists every journal entry.
- **Progress.** The last 7 days in numbers, your habit streaks and goals, and **What you might be missing**: plain sentences the app finds in your own records, like a habit that goes with better days, one that slipped, or a task you keep moving. **Ask AI what it sees** sends the last month to an AI of your choice. You see exactly what will be sent first, and notes are left out unless you tick them.

Settings (the gear) has the theme (Auto, Light, true-black Dark), the colour, the AI key, and backups.

## AI

Paste any API key in Settings → AI. The app recognises the service (OpenRouter, OpenAI, Anthropic, Google Gemini, Groq, xAI, DeepSeek, Mistral, Perplexity, Together, Fireworks, Cerebras, Hugging Face, or your own OpenAI-compatible server), checks the key for free and picks a model. Keys stay in memory unless you tick *Keep keys on this phone*. They are never put in backups.

## Your data

- Stored in this browser on this phone (IndexedDB). A backup is made on the phone each day you open the app.
- **Export backup** saves a file. Keep one somewhere else now and then. **Import backup** reads it back. Backups from the earlier version of Life Brain are converted.
- The first time it opens, the app copies your own items from the earlier version (tasks, events, habits, memories as notes, day notes as journal entries). It leaves the example data behind and doesn't change the old data.

## Install

Open https://akashdeshmukh-git.github.io/life-brain/ in Chrome on Android, then menu (⋮) → **Install app**. It works offline after the first open.

## Rebuild and test

Inside `source`: `node build.mjs` writes `dist/pwa`. `python3 tests/run.py` runs the browser tests (needs Python Playwright with Chromium).

Inter and Fraunces are free fonts under the SIL Open Font License. Their licences are in `licenses/`.
