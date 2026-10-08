# Life Brain

Life Brain compares the day you planned with the day you actually had, and learns from the gap. Everything stays in your browser on your device. There is no account and no server.

**Open it:** https://akashdeshmukh-git.github.io/life-brain/

To install it on Android, open that link in Chrome, then tap the menu (⋮) and choose **Install app** (or **Add to Home screen**). After it has opened once, it works with no internet connection.

## How it works

The **Board** screen runs one loop.

1. **Morning: plan.** It proposes today's tasks, sized to what you really get done. That's the median of your last closed days, not the hours you wish you had. Any rules you've kept are applied. Change the picks, then commit.
2. **During the day: start and finish.** Tap Start when you begin a task and Done when it's finished, or just tap a task to tick it off. "Not now" asks why, in one tap.
3. **Evening: close the day.** For each planned task, say whether it happened, and if not, why. It takes about 30 seconds. Misses move on or get let go.
4. **Once a week: review.** You see how much of the plan happened and the most common reasons it didn't. The app suggests one change aimed at the top reason: at most N tasks a day, a first step for every task, smaller tasks, honest estimates, asking early, or only planning what serves a goal. Start it, and your plans follow it for 7 days.
5. **Verdict.** After at least five closed days, the experiment is compared with the two weeks before it. Keep it and it becomes a rule that shapes every plan from then on. Drop it and it's remembered as tried. Rules live in Memory, where you can pause or remove them.

Below the plan, **What you're not seeing** lists what your own records show and you may be missing: values nothing you do serves, tasks you keep putting off and the reason you give, plans you don't keep, time optimism, goals that stopped moving.

If you can't remember a day, mark it unknown. It's left out of every number instead of guessed.

This repository is the app itself: the files at the top level are what GitHub Pages serves, and `source` holds the code and tests if you want to change or rebuild it.

## Host your own copy

Fork this repository, then open **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save. Any static host works the same way, as long as it serves the files over `https://`, which offline mode needs.

## Your data

- Data is stored per browser and per device. The Claude-hosted copy and your self-hosted copy do not share data. To move data, use **Settings → Data → Export backup** on one and **Import backup** on the other.
- A backup is made on the device once a day and before every import or restore. Those backups live in the same browser storage, so also export a file now and then.
- **Delete everything** in Settings erases all records, backups and the stored API key.

## AI

Paste any API key in **Settings → AI**. The app recognises the service from the key, checks it without spending anything, lists that service's models, and picks a sensible one. You can connect several services and switch between them.

Recognised automatically: OpenRouter (`sk-or-`), Anthropic (`sk-ant-`), Google Gemini (`AIza`), Groq (`gsk_`), xAI (`xai-`), Perplexity (`pplx-`), Cerebras (`csk-`), Hugging Face (`hf_`), Fireworks (`fw_`), OpenAI (`sk-proj-` and older `sk-` keys), Together. DeepSeek and Mistral keys have no unique prefix, so the app guesses and asks you to confirm. Ollama, LM Studio, or any OpenAI-compatible server work too: choose it under Service and give its address.

- OpenRouter keys also show how much credit is left when you press **Check key**.
- Each service is spoken to in its own format (OpenAI-style, Anthropic Messages, Gemini generateContent).
- **Claude (built in)** works only in the copy hosted inside Claude, with no key. Claude blocks outside services, so your own keys need the self-hosted copy.
- Some services refuse requests sent straight from a browser. If one keeps saying "Could not reach…", put a small proxy in front of it and enter the proxy's address under Address.
- Keys stay in memory unless you turn on **Remember keys on this device** (Settings → AI → Advanced). Any key kept in a browser can be read by someone with the device or by a malicious extension, so use keys with a spending limit. Keys are never exported, and each key is only ever sent to its own service.
- Nothing goes to an AI until you press Send. The preview shows exactly what will leave the device, and you choose which parts to include.

## Neurath X font

Titles, your direction statement and the brand are set in **Neurath X** by René Bieder. It is a paid font, so it is not included. Until you add it, those places use Inter, the app's Helvetica-style face.

1. Buy a **web font licence** for Neurath X on MyFonts (Regular, SemiBold and Bold are the weights used). The licence covers one domain, such as `YOUR-USERNAME.github.io`.
2. Rename the `.woff2` files to `NeurathX-Regular.woff2`, `NeurathX-SemiBold.woff2` and `NeurathX-Bold.woff2`.
3. Put them in a folder called `fonts` next to `index.html` and upload it with the rest.

If Neurath X is installed on a device, both copies of the app use it there automatically. Read the font's web licence before putting the files in a public repository; some licences don't allow that.

## Look

The app is styled after Day Board, a calendar built like New York subway signage. Each screen opens with a black sign with a thick white rule, a big bold title and small-caps labels. Black mode is true black, so on an AMOLED phone the screen's edges disappear. White mode keeps the black signs and puts the board on paper.

**Lines.** Each life area is a line with a letter and a subway colour, like H for Health in green. Every task wears its line's bullet, found through its project and goal. The Lines tab lists your lines, how many tasks each has today, and how many planned tasks on each line you actually kept in the last two weeks. Tap the ⋯ on a line to rename it or change its letter and colour.

**The board.** Today's plan reads like departures: each task, the time it would start if you go in order, and how long until then. Tap **Start** when you begin one. It becomes the yellow LIVE row, with minutes left and a progress bar. When you tap Done, the app records how long it really took, so the "took about" step in the evening isn't needed.

**Highlight.** Yellow is the one highlight colour, used for the live row, the current tab and your picks. Settings offers six others.

Inter is a free font under the SIL Open Font License. It's built into the app, and its licence is in `licenses` and `source/src/fonts`.

## Rebuild and test (optional)

Inside `source`: `node build.mjs` writes `dist/pwa` (the files at the top of this repository) and `dist/artifact`. `python3 tests/run.py` runs the browser test suite (needs Python Playwright with Chromium).
