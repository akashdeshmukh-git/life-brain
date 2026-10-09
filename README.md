# Life Brain

Tasks, calendar, notes, habits and goals in one simple app, with an optional AI that looks for patterns. Everything stays on your phone. There's no account and no server.

## The six screens

Everything is in the menu: tap **☰** at the top left, or swipe in from the left edge. Each item says what it's for, and Settings is at the bottom. The first time you open the app, **How it works** explains each screen. It's in the menu too, whenever you want it again.

- **Home.** A 30-second look at the day, opened first. One line sums up the day, the calendar is drawn as a line that rises where the day is fuller (a sun marks open time, a clay dot marks now), and morning, afternoon and evening each get a sentence. Below that:
  - **Where you're heading.** One sentence on the thing most worth knowing about your goals (a goal that will miss its date at this pace, one that hasn't moved in 10 days or more, or how much of your work isn't toward any goal). Under it, a bar showing how the tasks you finished in the last 4 weeks split across your goals, and one row per goal with its state. Tap a row to open the goal. With no goals yet, it asks for one.
  - **Fixes for you.** Up to four specific changes, each one tap with Undo: put a stalled goal's next step on tomorrow, move the newest loose tasks off a day that's fuller than you usually manage (tasks tied to goals stay), and, with AI set up, plan steps for a goal that has none, plan the week when a goal is behind, break down a task you keep moving, or tie loose tasks to goals. **Not now** hides a fix for a week. Suggestions your AI prepared by itself wait here too.
  - **Needs attention** (overdue and today's tasks, tomorrow's events, habits you usually do but haven't ticked, counting goals nearly done, a backup reminder when one is due) and **Already sorted** (what got done, habits kept, goals reached).

  Tap any bold title to open it. Add your name in Settings and the headline uses it.
- **Today.** Today's tasks: type to add one, tap the circle to tick it off. Undated tasks sit under *Anytime*. Below them are your habits (tap to tick). Type a date word at the end, like "Call mom tomorrow" or "Pay rent friday", and the task lands on that day.
- **Calendar.** The month. Tap a day to see and add its tasks and events, and to open notes written that day. Swipe sideways to change month.
- **Goals.** What you want, why, and by when. Only the name is needed. A goal can count something (12 books) or be finished by its steps (Finish Paper 2). Adding one takes you straight to its first step, and steps you add there are tasks tied to the goal. Each goal shows how far along it is and whether it's on track, behind its date at the current pace, stalled, or missing a next step. Tasks and habits can also be tied to a goal from their own sheet. To start, tap **+ Goal** on Home or open Goals from the menu, which has a few examples to start from.
- **Notes.** For keeping track of why things happened: decisions, reasons, what worked. Each note belongs to a day, today unless you pick another (there's a Tomorrow button). It shows on that day in Calendar, and Home brings up notes you left for today or tomorrow. Search and pin them. In Calendar, **+ Note** writes one for the day you're looking at.
- **Organise a note.** Brain-dump in a note, then tap **Organise**. The AI reads that one note and suggests tasks (with dates), events (with times), habits and goals, and ties each task or habit to the goal it serves. You see exactly what is sent first, then check the list: untick, retitle, change a date or a kind. **Add** puts each item where it belongs, and Undo takes them all back. Items you already have start unticked. The note stays as the reason behind them.
- **Progress.** The last 7 days in numbers, your habits over 4 weeks, and **What you might be missing**: plain sentences the app finds in your own records, like a habit that goes with better days, one that slipped, or a task you keep moving. **Ask AI what it sees** sends the last month to an AI of your choice. You see exactly what will be sent first, and notes are left out unless you tick them.

Every screen shares Home's look: warm paper and ink, serif titles, thin lines instead of boxes, and one clay accent. Dark is true black.

Settings (last in the menu) has your name, the theme (Auto, Light, Dark), the accent colour, the AI key, and backups.

## AI

Every ✦ button works in one tap: it asks your AI straight away and shows the answer. Anything it suggests changing is listed with tick boxes, so nothing changes until you tap Apply or Add, and one Undo reverses the lot. Each sheet has **See what is sent** if you want to check exactly what left the phone. With Automatic on, a button opens the suggestion your AI already prepared instead of asking again. When you have goals, each request includes every goal's reason, date and current state, so the answers are about what you said you want.

- **Organise** (in a note): turns a brain dump into tasks, events, habits and goals, tied to your goals.
- **Plan steps** (in a goal, or a fix on Home): 3 to 6 next steps toward the goal, never past its date.
- **Tie to goals** (a fix on Home): matches your open tasks to the goals they serve, so Where you're heading is accurate.
- **Break down** (in a task): 3 to 6 small steps with dates, never past the task's due date. It can replace the big task, and the steps keep its goal.
- **Plan week** (top of Today): spreads open tasks over the next 7 days, sized to how many you actually finish a day, with steps for goals that are behind first.
- **Sort out** (next to overdue tasks on Today): do today, move, split or delete, for each one.
- **What matters today?** (Home): one sentence about today under the headline, kept until midnight.
- **Weekly look back** (Progress, and on Home on Sundays and Mondays): done, slipped, one thing to try. Save it as a note.
- **Ask** (Notes): ask a question and get an answer from your notes, with links to the notes it used.
- **Ask AI what it sees** (Progress): patterns in your last month.

**Automatic** (Settings, off until you switch it on): the AI does its thinking by itself while the app is open and online. That covers a line about today on your first open each day, ideas for overdue tasks once a day when two or more are overdue, organising a note when you close it, a weekly look back on Sunday or Monday (saved to Notes), and a plan for the week on Mondays. You can switch each one off on its own. Anything that would change your tasks waits on Home under Fixes for you as a "✦" item until you open it and tap Apply, or Not now. It sends the same things the buttons send. Settings shows exactly what the last automatic run sent, and any failure. It needs **Keep keys on this phone** on, or it stops when the app closes.

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
