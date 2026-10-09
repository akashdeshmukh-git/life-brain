# Life Brain

Tasks, calendar, notes, habits and goals in one simple app, with an optional AI that looks for patterns. Everything stays on your phone. There's no account and no server.

## The five tabs

- **Home.** A 30-second look at the day, opened first. One line sums up the day, the calendar is drawn as a line that rises where the day is fuller (a sun marks open time, a clay dot marks now), and morning, afternoon and evening each get a sentence. Below: **Needs attention** (overdue and today's tasks, tomorrow's events, habits you usually do but haven't ticked, goals nearly done, a backup reminder when one is due), **Already sorted** (what got done, habits kept) and up to two **Worth knowing** patterns. Tap any bold title to open it. Add your name in Settings and the headline uses it.
- **Today.** Today's tasks: type to add one, tap the circle to tick it off. Undated tasks sit under *Anytime*. Below them are your habits (tap to tick). Type a date word at the end, like "Call mom tomorrow" or "Pay rent friday", and the task lands on that day.
- **Calendar.** The month. Tap a day to see and add its tasks and events, and to open notes written that day. Swipe sideways to change month.
- **Notes.** For keeping track of why things happened: decisions, reasons, what worked. Each note belongs to a day, today unless you pick another (there's a Tomorrow button). It shows on that day in Calendar, and Home brings up notes you left for today or tomorrow. Search and pin them. In Calendar, **+ Note** writes one for the day you're looking at.
- **Organise a note.** Brain-dump in a note, then tap **Organise**. The AI reads that one note and suggests tasks (with dates), events (with times), habits and goals. You see exactly what is sent first, then check the list: untick, retitle, change a date or a kind. **Add** puts each item where it belongs, and Undo takes them all back. Items you already have start unticked. The note stays as the reason behind them.
- **Progress.** The last 7 days in numbers, your habit streaks and goals, and **What you might be missing**: plain sentences the app finds in your own records, like a habit that goes with better days, one that slipped, or a task you keep moving. **Ask AI what it sees** sends the last month to an AI of your choice. You see exactly what will be sent first, and notes are left out unless you tick them.

Every screen shares Home's look: warm paper and ink, serif titles, thin lines instead of boxes, and one clay accent. Dark is true black.

Settings (the gear) has your name, the theme (Auto, Light, Dark), the accent colour, the AI key, and backups.

## AI

Paste any API key in Settings → AI. The app recognises the service (OpenRouter, OpenAI, Anthropic, Google Gemini, Groq, xAI, DeepSeek, Mistral, Perplexity, Together, Fireworks, Cerebras, Hugging Face, or your own OpenAI-compatible server), checks the key for free and picks a model. Keys stay in memory unless you tick *Keep keys on this phone*. They are never put in backups.

## Your data

- Stored in this browser on this phone (IndexedDB). A backup is made on the phone each day you open the app.
- **Export backup** saves a file. Keep one somewhere else now and then. **Import backup** reads it back. Backups from the earlier version of Life Brain are converted.
- The first time it opens, the app copies your own items from the earlier version (tasks, events, habits, memories as notes, day notes as dated notes). Entries from the old journal also become dated notes. It leaves the example data behind and doesn't change the old data.

## Install

Open https://akashdeshmukh-git.github.io/life-brain/ in Chrome on Android, then menu (⋮) → **Install app**. It works offline after the first open.

## Rebuild and test

Inside `source`: `node build.mjs` writes `dist/pwa`. `python3 tests/run.py` runs the browser tests (needs Python Playwright with Chromium).

Inter and Fraunces are free fonts under the SIL Open Font License. Their licences are in `licenses/`.
