"""Life Brain test suite (Playwright, Chromium). Run: python3 tests/run.py
Serves dist/pwa on :8765, a Claude-like wrapper of dist/artifact on :8766, and a mock AI provider on :8799."""
import json, os, sys, threading, time, tempfile, traceback, datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler, BaseHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'http://localhost:8765'
ART = 'http://localhost:8766'
AI_BASE = 'http://localhost:8799'
TESTS, RESULTS = [], []
AI_LOG = []

class Blocked(Exception): pass

# ---------- servers ----------
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

class MockAI(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', self.headers.get('Access-Control-Request-Headers', 'Content-Type, Authorization'))
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()
    def reply(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self.cors(); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(body)
    def log(self, body=None):
        AI_LOG.append({'method': self.command, 'path': self.path, 'auth': self.headers.get('Authorization'), 'headers': {k.lower(): v for k, v in self.headers.items()}, 'body': body})
    def do_GET(self):
        self.log(); kind = self.path.split('/')[1]
        if self.path.endswith('/models'):
            if kind == 'auth': return self.reply(401, {'error': {'message': 'invalid key'}})
            if kind == 'gemini': return self.reply(200, {'models': [{'name': 'models/gemini-2.5-flash', 'displayName': 'Gemini 2.5 Flash', 'supportedGenerationMethods': ['generateContent']}, {'name': 'models/text-embedding-004', 'supportedGenerationMethods': ['embedContent']}]})
            if kind == 'anthropic': return self.reply(200, {'data': [{'id': 'claude-haiku-test', 'display_name': 'Haiku'}, {'id': 'claude-sonnet-test', 'display_name': 'Sonnet'}]})
            if kind == 'openrouter': return self.reply(200, {'data': [{'id': 'openrouter/auto', 'name': 'Auto Router', 'pricing': {'prompt': '-1', 'completion': '-1'}}, {'id': 'meta/llama-free', 'name': 'Llama (free)', 'pricing': {'prompt': '0', 'completion': '0'}}, {'id': 'text-embedding-3', 'name': 'Embed'}]})
            return self.reply(200, {'data': [{'id': 'test-model'}, {'id': 'gpt-x-mini'}, {'id': 'whisper-1'}]})
        if self.path.endswith('/key') and kind == 'openrouter':
            return self.reply(200, {'data': {'label': 'k', 'limit': 10, 'limit_remaining': 4.2, 'usage': 5.8, 'is_free_tier': False}})
        self.reply(404, {'error': {'message': 'no route'}})
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(n).decode() or '{}'); self.log(body)
        kind = self.path.split('/')[1]
        if kind == 'anthropic': return self.reply(200, {'content': [{'type': 'text', 'text': 'Anthropic says **hi**'}]})
        if kind == 'gemini': return self.reply(200, {'candidates': [{'content': {'parts': [{'text': 'Gemini says hi'}]}, 'finishReason': 'STOP'}]})
        if kind in ('ok', 'openrouter'):
            return self.reply(200, {'choices': [{'message': {'content': '**H1** looks strongest.\n- Try planning to 80%\n<script>window.__xss2=1</script><img src=x onerror="window.__xss3=1">'}}]})
        if kind == 'fail': return self.reply(500, {'error': {'message': 'boom'}})
        if kind == 'auth': return self.reply(401, {'error': {'message': 'bad key'}})
        if kind == 'credits': return self.reply(402, {'error': {'message': 'Insufficient credits'}})
        if kind == 'empty': return self.reply(200, {'choices': []})
        if kind == 'slow':
            time.sleep(8)
            try: return self.reply(200, {'choices': [{'message': {'content': 'late'}}]})
            except Exception: return
        self.reply(404, {'error': {'message': 'no route'}})

def serve(handler, port):
    s = ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s

# ---------- harness ----------
def test(category, name, **opts):
    def deco(fn):
        TESTS.append((category, name, fn, opts)); return fn
    return deco

def open_app(pg, h='', base=BASE):
    pg.goto(base + '/' + ('#' + h if h else ''))
    pg.wait_for_selector('html[data-ready="1"]', timeout=15000)

def ev(pg, js, arg=None):
    return pg.evaluate(js, arg)

def go(pg, name, sub=''):
    ev(pg, f"() => LB.go('{name}', '{sub}')"); pg.wait_for_timeout(120)

def clear_examples(pg):
    ev(pg, """async () => { const ex=[...S.records.values()].filter(r=>r.ex); ex.forEach(r=>S.records.delete(r.id));
      await persist('records', st=>ex.forEach(r=>st.delete(r.id))); await saveProfile({...DEFAULT_PROFILE}); }""")
    pg.wait_for_timeout(100)

def sheet_submit(pg, text=None):
    sel = '#sheet-root form button.primary' if not text else f'#sheet-root button:has-text("{text}")'
    pg.click(sel)

def sheet_closed(pg):
    pg.wait_for_selector('#sheet-root .sheet', state='detached', timeout=4000)

def today(pg):
    return ev(pg, '() => today()')

def check(cond, msg):
    if not cond: raise AssertionError(msg)

def ai_setup(pg, kind='ok', timeout=5, key='sk-test-123', provider='openai', path='/v1', model='test-model'):
    ev(pg, f"""async () => {{ S.aiKeys = {{}}; if ('{key}') S.aiKeys['{provider}'] = '{key}';
      await saveSettings({{ ai: {{ active: '{provider}', linked: ['{provider}'], baseUrls: {{ '{provider}': '{AI_BASE}/{kind}{path}' }}, models: {{ '{provider}': '{model}' }}, timeoutSec: {timeout} }} }}); }}""")

def ai_send(pg, wait='#ai-answer, #ai-error', timeout=15000):
    ev(pg, "() => A['analyze-ai']()")
    pg.wait_for_selector('#ai-preview')
    pg.click('#ai-send')
    pg.wait_for_selector(wait, timeout=timeout)

# =====================================================================
# Unit: local Brain logic
# =====================================================================
@test('Unit', 'Brain detects every seeded pattern with H1–H3 diagnoses')
def _(pg, ctx):
    open_app(pg)
    ev(pg, """async () => { for (const [i, m] of [[1, 120], [2, 150]]) await put({type:'task', title:'Heavy ' + i, status:'open', estimateMin: m, plannedDate: addDays(today(), 1), plans:[addDays(today(), 1)]}); }""")
    r = ev(pg, """() => { const F = Brain.analyze(data()); return { kinds: [...new Set(F.map(f=>f.kind))], ids: F.map(f=>f.id),
      hyps: F.filter(f=>f.hypotheses).map(f=>({id:f.id, labels:f.hypotheses.map(h=>h.label), conf:f.hypotheses.map(h=>h.confidence), change: (f.wouldChange||[]).length})) }; }""")
    for k in ['overload', 'delay', 'calibration', 'structure', 'evidence', 'habit']:
        check(k in r['kinds'], f'missing finding kind {k}: {r["kinds"]}')
    for pre in ['orphans', 'proj-nogoal:', 'goal-disc:', 'goal-idle:', 'overload:', 'delayed:', 'calibration', 'exp-noevidence:', 'habit-slip:']:
        check(any(i.startswith(pre) for i in r['ids']), f'missing finding {pre}')
    check(len(r['hyps']) >= 3, 'expected several diagnoses with hypotheses')
    for h in r['hyps']:
        check(h['labels'] == ['H1', 'H2', 'H3'], f'labels {h}')
        check(all(0.05 <= c <= 0.85 for c in h['conf']), f'confidence out of range {h}')
        check(h['change'] >= 1, f'no "what would change" for {h["id"]}')

@test('Unit', 'Any key is recognised by its shape; unclear keys are flagged, not guessed silently')
def _(pg, ctx):
    open_app(pg)
    cases = {'sk-or-v1-' + 'a'*64: ['openrouter', True], 'sk-ant-api03-' + 'x'*90: ['anthropic', True], 'AIzaSy' + 'B'*33: ['gemini', True],
             'gsk_' + 'c'*52: ['groq', True], 'xai-' + 'd'*80: ['xai', True], 'pplx-' + 'e'*48: ['perplexity', True], 'csk-' + 'f'*40: ['cerebras', True],
             'hf_' + 'g'*34: ['huggingface', True], 'fw_' + 'h'*24: ['fireworks', True], 'sk-proj-' + 'i'*120: ['openai', True], 'tgp_v1_' + 'j'*40: ['together', True],
             'sk-' + '0123456789abcdef'*2: ['deepseek', False], 'A1b2C3d4'*4: ['mistral', False], 'sk-what': ['openai', False], 'hello there': None, '': None}
    got = ev(pg, "(keys) => keys.map(k => { const d = LB.detectProvider(k); return d ? [d.id, d.sure] : null; })", list(cases))
    bad = [(k[:12], want, g) for (k, want), g in zip(cases.items(), got) if want != g]
    check(not bad, f'detection wrong: {bad}')
    check(ev(pg, "() => Object.keys(LB.PROVIDERS).length") >= 15, 'too few services')

@test('Unit', 'Next action: explains itself, asks for a first step when a task is unclear, respects snooze and your choice')
def _(pg, ctx):
    open_app(pg)
    r = ev(pg, """() => { const D = data(), n = Brain.next(D); return {kind: n.kind, title: n.title, why: n.why, task: n.task.title}; }""")
    check(r['kind'] == 'define' and 'README' in r['task'] and 'wasn’t clear' in r['why'][0], f'define step not chosen: {r}')
    r2 = ev(pg, """() => { const D = data(); const x = D.tasks.find(t => t.title.includes('README')); x.firstStep = 'Write the install section';
      const n = Brain.next(D); const out = {kind: n.kind, title: n.title, why: n.why};
      const other = D.tasks.find(t => t.title === 'Order a desk lamp'); other.pinned = today(); const p = Brain.next(D);
      x.snoozedUntil = addDays(today(), 2); other.pinned = ''; const s = Brain.next(D);
      return {out, pinned: p.title, pinnedWhy: p.why[0], snoozed: s.task.title}; }""")
    check(r2['out']['kind'] == 'task' and 'README' in r2['out']['title'] and len(r2['out']['why']) >= 1, f'task not chosen with reasons {r2["out"]}')
    check(r2['pinned'] == 'Order a desk lamp' and 'chose' in r2['pinnedWhy'], 'your choice not respected')
    check('README' not in r2['snoozed'], 'snoozed task still recommended')

@test('Unit', 'Blind spots: neglected values, avoided tasks with your reasons, overplanning, time optimism')
def _(pg, ctx):
    open_app(pg)
    spots = ev(pg, "() => Brain.blindSpots(data()).map(s => ({kind: s.kind, title: s.title, evidence: s.evidence, act: s.action.act}))")
    kinds = [s['kind'] for s in spots]
    for k in ['neglect', 'avoid']: check(k in kinds, f'missing {k}: {kinds}')
    check('optimism' not in kinds, 'time optimism flagged although the × 1.5 rule already corrects for it')
    # Without the rule, the same evidence is a blind spot; with closed days kept rarely, overplanning is one, judged from the days.
    r = ev(pg, """() => { const D = structuredClone(data()); D.rules.forEach(r => r.active = false); const a = Brain.blindSpots(D).map(s => s.kind);
      D.days.forEach(d => { d.missed = d.kept.map(id => ({id, reason:'time'})).concat(d.missed); d.kept = []; }); const o = Brain.blindSpots(D).find(s => s.kind === 'overplan');
      return {a, o: o && {title: o.title, ev: o.evidence, act: o.action.act}}; }""")
    check('optimism' in r['a'], f'optimism missing without the rule: {r["a"]}')
    check(r['o'] and r['o']['title'].startswith('You finish about 0%') and 'closed day' in r['o']['ev'] and r['o']['act'] == 'week', f'overplan not judged from closed days: {r["o"]}')
    rel = next(s for s in spots if 'Relationships' in s['title']); check(rel['act'] == 'add-goal', rel)
    av = next(s for s in spots if s['kind'] == 'avoid'); check('Not clear what to do' in av['evidence'] and av['act'] == 'define', av)
    check(not any('Health' in s['title'] for s in spots), 'Health was served yesterday; should not be flagged')

@test('Unit', 'Load, overlap, calibration and plan-keeping math')
def _(pg, ctx):
    open_app(pg)
    r = ev(pg, """() => { const E = {areas:[],aims:[],goals:[],projects:[],habits:[],experiments:[],memories:[],insights:[]};
      const D = {...E, profile:{capacityHours:2},
        events:[{id:'e1',date:'2026-01-05',start:'09:00',end:'10:30'},{id:'e2',date:'2026-01-05',start:'10:00',end:'11:00'},{id:'e3',date:'2026-01-05',allDay:true}],
        tasks:[{status:'open',plannedDate:'2026-01-05',estimateMin:60,plans:['2026-01-05']},{status:'open',plannedDate:'2026-01-05',plans:['2026-01-05']},
               {status:'done',estimateMin:60,actualMin:90,doneDate:'2025-12-30',plans:['2025-12-30']},{status:'done',estimateMin:30,actualMin:30,doneDate:'2025-12-31',plans:['2025-12-30','2025-12-31']},
               {status:'done',estimateMin:10,actualMin:30,doneDate:'2025-12-31',plans:['2025-12-31']}]};
      const L = Brain.dayLoad(D,'2026-01-05','2026-01-01'); const c = Brain.calibration(D); const w = Brain.weekly(D,'2026-01-01',1)[0];
      return {L:{e:L.eventMin,t:L.taskMin,total:L.total,cap:L.cap,ratio:L.ratio,unest:L.unestimated}, ov:Brain.overlaps(D.events).length, c:{n:c.n,m:c.median}, w}; }""")
    check(r['L'] == {'e': 150, 't': 90, 'total': 240, 'cap': 120, 'ratio': 2, 'unest': 1}, f'dayLoad {r["L"]}')
    check(r['ov'] == 1, f'overlaps {r["ov"]}')
    check(r['c'] == {'n': 3, 'm': 1.5}, f'calibration {r["c"]}')
    check(r['w']['planned'] == 4 and r['w']['kept'] == 3, f'weekly {r["w"]}')

@test('Unit', 'Decision matrix ranks options and finds the weight that flips it')
def _(pg, ctx):
    open_app(pg)
    r = ev(pg, """() => Brain.decide(['A','B'], [{name:'cost',weight:2},{name:'joy',weight:2}], [[5,1],[2,3]])""")
    check(r['ranked'][0]['option'] == 'A' and r['ranked'][0]['total'] == 12 and r['margin'] == 2, f'ranking {r}')
    check(r['flip'] and r['flip']['winner'] == 'B', f'flip {r["flip"]}')

@test('Unit', 'Plan history counts deferrals only when a task moves later')
def _(pg, ctx):
    open_app(pg)
    r = ev(pg, """() => { const old = {plannedDate:'2026-01-05', plans:['2026-01-05'], deferrals:0, status:'open'};
      const later = LB.applyTaskPlan(old, {...old, plannedDate:'2026-01-06'}); const earlier = LB.applyTaskPlan(old, {...old, plannedDate:'2026-01-04'});
      const fresh = LB.applyTaskPlan(null, {plannedDate:'2026-01-05'}); return {later, earlier, fresh}; }""")
    check(r['later']['deferrals'] == 1 and r['later']['plans'] == ['2026-01-05', '2026-01-06'], f'later {r["later"]}')
    check(r['earlier']['deferrals'] == 0, f'earlier {r["earlier"]}')
    check(r['fresh']['deferrals'] == 0 and r['fresh']['plans'] == ['2026-01-05'], f'fresh {r["fresh"]}')

@test('Unit', 'Import validation rejects bad backups and accepts good ones')
def _(pg, ctx):
    open_app(pg)
    r = ev(pg, """() => [validateImport(null).ok, validateImport([]).ok, validateImport({app:'other',records:[]}).ok,
      validateImport({app:'life-brain',records:[{id:'x',type:'virus'}]}).ok, validateImport({app:'life-brain',records:[{id:'1',type:'task',title:'t'}]})]""")
    check(r[:4] == [False, False, False, False], f'bad files accepted {r[:4]}')
    check(r[4]['ok'] and r[4]['counts'] == {'task': 1}, f'good file rejected {r[4]}')

@test('Unit', 'AI text is escaped; local recall finds related memories')
def _(pg, ctx):
    open_app(pg)
    r = ev(pg, """() => ({ md: mdLite('<img src=x onerror=alert(1)> **bold**\\n- item'), recall: Brain.recall(data(), 'focus timers on meeting days').map(x=>x.r.title) })""")
    check('<img' not in r['md'] and '&lt;img' in r['md'] and '<strong>bold</strong>' in r['md'] and '<li>item</li>' in r['md'], f'mdLite {r["md"]}')
    check(any('focus timers' in t for t in r['recall']), f'recall {r["recall"]}')

# =====================================================================
# Core flows (through the UI)
# =====================================================================
@test('Unit', 'Loop: plans are sized to what you really get done, with every rule applied')
def _(pg, ctx):
    open_app(pg)
    r = ev(pg, """() => { const D = data(), t = today(), P = Loop.propose(D, t), rd = P.items.find(i => i.x.title.includes('README'));
      const C = structuredClone(D); C.rules.forEach(r => r.active = false); const P2 = Loop.propose(C, t);
      const E = structuredClone(D); E.experiments.push({id:'x', type:'experiment', status:'running', startDate:t, policy:{kind:'cap', value:2}}); E.days.length = 2;
      const P3 = Loop.propose(E, t); const L = structuredClone(D); L.rules.push({id:'r2', type:'rule', active:true, policy:{kind:'linkedOnly', value:true}});
      return { cap: Loop.capacity(D), rd: rd && [rd.minutes, rd.selected, rd.overDay], raw: P2.items.find(i => i.x.title.includes('README')).minutes,
        sel3: P3.items.filter(i => i.selected).length, cap3: Loop.capacity(E), pol3: Object.keys(Loop.policies(E)), linked: Loop.propose(L, t).items.every(i => Brain.chain(L, i.x).linked),
        used: P.used, budget: P.budget.minutes }; }""")
    check(r['cap'] == {'minutes': 125, 'from': 'history', 'n': 8}, f'capacity is not the median of real days: {r["cap"]}')
    check(r['rd'] == [180, True, True], f'README not scaled by the × 1.5 rule or not flagged as bigger than a usual day: {r["rd"]}')
    check(r['raw'] == 120, f'pausing the rule did not change the estimate: {r["raw"]}')
    check(r['sel3'] <= 2 and 'cap' in r['pol3'], f'running experiment did not cap the plan: {r}')
    check(r['cap3']['from'] == 'settings' and r['cap3']['minutes'] == 190, f'fallback capacity wrong with too few days: {r["cap3"]}')
    check(r['linked'], 'only-what-matters rule let unlinked tasks in')

@test('Unit', 'Loop: experiments are judged against the weeks before, only after five days')
def _(pg, ctx):
    open_app(pg)
    r = ev(pg, """() => { const t = '2026-03-20', d = (n) => addDays(t, n), day = (n, p, k) => ({date: d(n), reviewedAt: 'x', plannedIds: [...Array(p)].map((_, i) => 'p' + i), kept: [...Array(k)].map((_, i) => 'p' + i)});
      const base = [-10, -9, -8, -7, -6].map(n => day(n, 4, 2)); const mk = (during) => ({days: [...base, ...during], rules: [], experiments: [], tasks: []});
      const e = {startDate: d(-4), endDate: d(2), policy: {kind: 'cap', value: 3}};
      const V = (during, ex = e) => Loop.evaluate(mk(during), ex, t).verdict;
      return { better: V([-4, -3, -2, -1, 0].map(n => day(n, 3, 3))), worse: V([-4, -3, -2, -1, 0].map(n => day(n, 4, 1))), same: V([-4, -3, -2, -1, 0].map(n => day(n, 4, 2))),
        early: V([-4, -3, -2, -1].map(n => day(n, 3, 3))), nobase: Loop.evaluate({days: [-4, -3, -2, -1, 0].map(n => day(n, 3, 3)), rules: [], experiments: [], tasks: []}, e, t).verdict,
        unknown: Loop.rate(Loop.reviewed({days: [{...day(-1, 3, 0), unknown: true}, day(-2, 2, 2)]}, d(-5), t)) }; }""")
    check([r[k] for k in ['better', 'worse', 'same', 'early', 'nobase']] == ['better', 'worse', 'same', 'early', 'nobase'], f'verdicts wrong: {r}')
    check(r['unknown']['days'] == 1 and r['unknown']['rate'] == 1, f'a day marked unknown was counted: {r["unknown"]}')
    s = ev(pg, "() => [Loop.weekDue(data()), Loop.suggest(data()).map(s => s.kind)]")
    check(s[0] is True and s[1][:2] == ['cap', 'firstStep'], f'weekly review not due or wrong suggestions: {s}')

@test('Flow', 'Day loop: commit a plan, tick it off, close the day with reasons; misses move on')
def _(pg, ctx):
    open_app(pg); t = today(pg)
    check('plan today' in pg.inner_text('.page-head').lower() and 'rule: estimates × 1.5' in pg.inner_text('.next').lower(), 'no plan board with the rule shown')
    check('putting off “Write the project README”' not in pg.inner_text('#view'), 'blind spot repeats a task already in the plan')
    readme = ev(pg, "() => all('task').find(t => t.title.includes('README')).id"); signup = ev(pg, "() => all('task').find(t => t.title.includes('sign-up')).id")
    check(pg.is_checked(f'.plan-row input[value="{readme}"]') and not pg.is_checked(f'.plan-row input[value="{signup}"]'), 'proposal not sized to capacity')
    check(pg.inner_text(f'.plan-row:has(input[value="{signup}"]) [data-at]') == '—', 'an unticked task has a departure time')
    pg.check(f'.plan-row input[value="{signup}"]'); pg.wait_for_timeout(80)
    check('more than you usually manage' in pg.inner_text('#plan-total'), 'no warning when ticking past your usual day')
    at = ev(pg, f"""() => [document.querySelector('.plan-row:has(input[value="{readme}"]) [data-at]').dataset.m, document.querySelector('.plan-row:has(input[value="{signup}"]) [data-at]').dataset.m]""")
    check(int(at[1]) - int(at[0]) == 180, f'departure times do not follow from the first task (README takes 3h): {at}')
    pg.fill(f'[name="fs_{readme}"]', 'List the three sections')
    pg.click('form[data-form="commit-plan"] button.primary'); pg.wait_for_timeout(250)
    d = ev(pg, f"() => Loop.day(data(), '{t}')")
    check(d and sorted(d['plannedIds']) == sorted([readme, signup]) and d['minutes'] == 270 and d['committedAt'], f'day record wrong: {d}')
    check(ev(pg, f"() => get('{readme}').firstStep") == 'List the three sections', 'first step not saved')
    check('0 of 2 done' in pg.inner_text('.next').lower() and 'departures' in pg.inner_text('.page-head').lower(), 'departures board missing')
    check(pg.inner_text('.dep.is-next .dep-time b') == 'Now' and pg.locator('.dep.is-next .next-tag').count() == 1 and 'done around' in pg.inner_text('.board-status').lower(), 'next departure or the finish time is missing')
    check(pg.locator(f'.dep[data-id="{readme}"] .bullet').inner_text() == 'C', 'task does not carry its line bullet (Craft)')
    pg.click(f'.plan-row[data-id="{signup}"]'); pg.wait_for_timeout(200)
    check('1 of 2 done' in pg.inner_text('.next').lower() and ev(pg, f"() => get('{signup}').status") == 'done', 'tick did not mark done')
    pg.click('.next [data-action="close-open"]'); pg.wait_for_selector('#sheet-root form[data-form="close-day"]')
    sheet_submit(pg); pg.wait_for_timeout(150)
    check('Pick why' in pg.inner_text('#sheet-root .err'), 'closed without a reason for a miss')
    pg.click(f'#sheet-root .choice:has(input[name="r_{readme}"][value="unclear"])')
    pg.click(f'#sheet-root .choice:has(input[name="k_{signup}"][value="1.5"])')
    pg.fill('#sheet-root [name="note"]', 'Mornings went better without email')
    sheet_submit(pg); sheet_closed(pg); pg.wait_for_timeout(150)
    d = ev(pg, f"() => Loop.day(data(), '{t}')"); x = ev(pg, f"() => get('{readme}')"); y = ev(pg, f"() => get('{signup}')")
    check(d['reviewedAt'] and d['kept'] == [signup] and d['missed'] == [{'id': readme, 'reason': 'unclear'}], f'close wrong: {d}')
    check(x['plannedDate'] == ev(pg, '() => addDays(today(), 1)') and x['skips'][-1] == {'date': t, 'reason': 'unclear'}, f'miss not moved with its reason: {x}')
    check(y['actualMin'] == 135, f'real time not recorded as the chip shown (1.5 × the planned 1h 30m): {y.get("actualMin")}')
    check(ev(pg, "() => all('memory').some(m => m.kind === 'lesson' && m.body === 'Mornings went better without email')"), 'note not remembered')
    txt = pg.inner_text('#view')
    check('Kept 1 of 2' in txt and 'Not clear what to do' in txt and 'plan tomorrow' in txt.lower(), 'closed state or tomorrow plan missing')

@test('Flow', 'Start makes a task live: yellow row counts down, Done records how long it really took')
def _(pg, ctx):
    open_app(pg); t = today(pg)
    pg.click('form[data-form="commit-plan"] button.primary'); pg.wait_for_timeout(200)
    rid = ev(pg, "() => Loop.day(data(), today()).plannedIds[0]")
    check(pg.locator('.now-next [data-action="task-start"]').count() == 1 and pg.locator('.dep.live').count() == 0, 'no Start for the next task, or something is already live')
    pg.click('.now-next [data-action="task-start"]'); pg.wait_for_timeout(200)
    ev(pg, f"async () => {{ const x = get('{rid}'); await put({{...x, startedAt: new Date(Date.now() - 40 * 60000).toISOString()}}); }}"); pg.wait_for_timeout(200)
    live = pg.locator(f'.dep.live[data-id="{rid}"]')
    check(live.count() == 1 and live.locator('.live-tag').count() == 1, 'started task is not the live row')
    bg = ev(pg, "() => getComputedStyle(document.querySelector('.dep.live')).backgroundColor")
    check(bg == 'rgb(252, 204, 10)', f'live row is not the yellow highlight: {bg}')
    check(live.locator('.dep-time b').inner_text() == '2:20' and 'hr left' in live.locator('.dep-time small').inner_text().lower(), f'countdown wrong: {live.locator(".dep-time").inner_text()}')
    check(pg.locator('.now-next [data-action="plan-tick"]').count() == 1, 'no Done for the live task')
    pg.click('.now-next [data-action="plan-tick"]'); pg.wait_for_timeout(200)
    x = ev(pg, f"() => get('{rid}')")
    check(x['status'] == 'done' and x['actualMin'] == 40, f'finishing a timed task did not record its real time: {x.get("actualMin")}')
    check(ev(pg, "() => Loop.capacity(data()).minutes") > 0, 'capacity broken after a timed task')

@test('Flow', 'Lines: each life area is a line with a letter and colour; editing it changes every bullet')
def _(pg, ctx):
    open_app(pg)
    heads = ev(pg, "() => [...document.querySelectorAll('.page-head .line-btn .bullet')].map(b => b.textContent)")
    check(heads == ['H', 'C', 'R', 'L'], f'the header does not show your lines: {heads}')
    pg.click('#tabbar [data-to="lines"]'); pg.wait_for_timeout(150)
    rows = ev(pg, "() => [...document.querySelectorAll('.line-item')].map(r => [r.querySelector('.bullet').textContent, r.querySelector('.line-name').textContent, r.querySelector('.line-count').textContent])")
    check([r[1] for r in rows] == ['Health', 'Craft', 'Relationships', 'Learning'] and rows[1][0] == 'C', f'lines list wrong: {rows}')
    check('kept' in pg.inner_text('#view').lower() and pg.locator('.section .meter').count() >= 1, 'no per-line kept rate')
    pg.click('.line-item:has-text("Craft") [data-action="line-edit"]'); pg.wait_for_selector('#sheet-root form[data-form="line"]')
    pg.fill('#sheet-root [name="code"]', 'W'); pg.fill('#sheet-root [name="name"]', 'Work')
    pg.click('#sheet-root .swatch-pick:has(input[value="red"])'); pg.wait_for_timeout(50)
    check(pg.inner_text('#sheet-root .line-preview .bullet') == 'W', 'preview did not follow the edit')
    sheet_submit(pg); sheet_closed(pg); pg.wait_for_timeout(150)
    a = ev(pg, "() => all('area').find(a => a.name === 'Work')")
    check(a and a['code'] == 'W' and a['color'] == 'red', f'line not saved: {a}')
    go(pg, 'home')
    b = ev(pg, "() => { const id = all('task').find(t => t.title.includes('README')).id; const el = document.querySelector(`.plan-row:has(input[value='${id}']) .bullet`); return [el.textContent, getComputedStyle(el).backgroundColor]; }")
    check(b == ['W', 'rgb(238, 53, 46)'], f'the task did not take the new line look: {b}')
    go(pg, 'lines'); pg.click('[data-action="line-add"]'); pg.fill('#sheet-root [name="name"]', 'Family'); pg.fill('#sheet-root [name="code"]', 'F')
    sheet_submit(pg); sheet_closed(pg); pg.wait_for_timeout(150)
    check(pg.locator('.line-item:has-text("Family") .bullet').inner_text() == 'F', 'new line not listed')
    pg.click('.line-item:has-text("Work") .line-main'); pg.wait_for_selector('#sheet-root .line-preview')
    check('Ship the side project v1' in pg.inner_text('#sheet-root') and 'Write the project README' in pg.inner_text('#sheet-root'), 'line detail misses its goals or tasks')

@test('Flow', 'A past day left open is asked about first; an unknown day is left out, not guessed')
def _(pg, ctx):
    open_app(pg)
    ev(pg, "async () => { const d = Loop.day(data(), addDays(today(), -1)); await put({...d, reviewedAt: '', kept: [], missed: []}); }"); pg.wait_for_timeout(150)
    check('reality first' in pg.inner_text('.page-head').lower() and pg.locator('.next [data-action="close-open"]').count() == 1, 'open day not asked about first')
    pg.click('.next [data-action="close-skip"]'); pg.wait_for_timeout(200)
    d = ev(pg, "() => Loop.day(data(), addDays(today(), -1))")
    check(d['unknown'] and d['reviewedAt'] and ev(pg, "() => Loop.capacity(data()).n") == 7, f'unknown day counted: {d}')
    check('plan today' in pg.inner_text('.page-head').lower(), 'did not move on to planning')

@test('Flow', 'Weekly review: the gap and its reasons; one experiment that changes plans; kept, it becomes a rule')
def _(pg, ctx):
    open_app(pg)
    pg.click('[data-action="week-open"]'); pg.wait_for_selector('#sheet-root .kpis')
    txt = pg.inner_text('#sheet-root')
    check('56%' in txt and '80%' in txt and 'No time today' in txt and 'At most 3 tasks a day' in txt, f'review missing gap, reasons or suggestion: {txt[:300]}')
    pg.click('#sheet-root .card [data-action="exp-policy"]'); sheet_closed(pg); pg.wait_for_timeout(150)
    e = ev(pg, "() => all('experiment').find(e => e.status === 'running' && e.policy)")
    check(e and e['policy'] == {'kind': 'cap', 'value': 3} and e['baseline']['days'] == 8, f'experiment not started with a baseline: {e}')
    check(pg.locator('[data-action="week-open"]').count() == 0, 'review still due after doing it')
    check('testing: at most 3 tasks a day' in pg.inner_text('.next').lower(), 'plan does not show the experiment')
    ev(pg, "() => document.querySelectorAll('.plan-more').forEach(d => d.open = true)")
    for i in range(4): pg.check(f'.plan-row > input[type="checkbox"] >> nth={i}')
    pg.click('form[data-form="commit-plan"] button.primary'); pg.wait_for_timeout(150)
    check('at most 3 tasks' in pg.inner_text('form[data-form="commit-plan"] .err'), 'experiment did not limit the plan')
    # A week later: six kept days with the experiment running.
    ev(pg, """async () => { const ids = all('task').filter(t => t.status === 'open').slice(0, 3).map(t => t.id), t0 = today();
      for (let n = 0; n < 6; n++) await put({type:'day', date: addDays(t0, n), plannedIds: ids, kept: ids, missed: [], extras: [], committedAt: 'x', reviewedAt: 'x'});
      LB.now = () => new Date(Date.now() + 6 * 864e5); render(); }""")
    pg.wait_for_timeout(150)
    pg.click('[data-action="week-open"]'); pg.wait_for_selector('#sheet-root [data-action="exp-keep"]')
    check('real improvement' in pg.inner_text('#sheet-root'), 'verdict not shown')
    pg.click('#sheet-root [data-action="exp-keep"]'); pg.wait_for_timeout(250)
    rule = ev(pg, "() => all('rule').find(r => r.policy.kind === 'cap')")
    check(rule and rule['active'] and 'real improvement' in rule['evidence'], f'rule not created: {rule}')
    check(ev(pg, f"() => [get('{e['id']}').status, Loop.policies(data()).cap.from]") == ['done', 'rule'], 'experiment not concluded into a rule')
    check('At most 3 tasks a day' in pg.inner_text('#sheet-root'), 'rule not listed in the review')
    ev(pg, '() => closeSheet()'); sheet_closed(pg)
    go(pg, 'memory'); row = pg.locator('.rule-row:has-text("At most 3 tasks a day")')
    check(row.count() == 1 and row.locator('.switch').get_attribute('aria-checked') == 'true', 'rule not in Memory')
    row.locator('.switch').click(); pg.wait_for_timeout(200)
    check(ev(pg, "() => !Loop.policies(data()).cap") and pg.locator('.rule-row:has-text("At most 3 tasks a day") .switch').get_attribute('aria-checked') == 'false', 'pausing the rule did not lift the cap')
    pg.click('.rule-row:has-text("At most 3 tasks a day") [data-action="delete"]'); pg.wait_for_timeout(200)
    check(ev(pg, "() => all('rule').length") == 1, 'remove failed'); pg.click('#toast-action'); pg.wait_for_timeout(200)
    check(ev(pg, "() => all('rule').length") == 2, 'undo did not bring the rule back')

@test('Flow', 'Now: blind-spot actions work, Not useful hides them, Not now asks why, quick add')
def _(pg, ctx):
    open_app(pg)
    pg.click('.spot:has-text("Relationships") [data-act="add-goal"]')
    check(pg.input_value('#sheet-root [name="areaId"]') == ev(pg, "() => all('area').find(a => a.name === 'Relationships').id"), 'goal not prefilled with the area')
    pg.fill('#sheet-root [name="title"]', 'Call an old friend every week'); sheet_submit(pg); sheet_closed(pg); pg.wait_for_timeout(150)
    check('Relationships is #3 on your list, but nothing you did' in pg.inner_text('#view'), 'spot did not update after adding a goal')
    first = pg.inner_text('article.spot >> nth=0 >> .spot-title')
    pg.click('article.spot >> nth=0 >> [data-action="spot-dismiss"]'); pg.wait_for_timeout(200)
    check(first not in pg.inner_text('#view'), 'Not useful did not hide it')
    pg.click('#toast-action'); pg.wait_for_timeout(200); check(first in pg.inner_text('#view'), 'undo did not bring it back')
    pg.click('form[data-form="commit-plan"] button.primary'); pg.wait_for_timeout(200)
    tid = ev(pg, "() => Loop.day(data(), today()).plannedIds[0]")
    pg.click('.now-next [data-action="skip-open"]'); pg.click('.now-next [data-action="skip"][data-reason="time"]'); pg.wait_for_timeout(250)
    x = ev(pg, f"() => get('{tid}')")
    check(x['plannedDate'] == ev(pg, '() => addDays(today(), 1)') and x['skips'][-1]['reason'] == 'time', f'skip not recorded {x.get("skips")}')
    check('Not today: No time today' in pg.inner_text('.next'), 'skipped task not shown as moved with its reason')
    pg.click('#toast-action'); pg.wait_for_timeout(250)
    check(ev(pg, f"() => get('{tid}').plannedDate") == ev(pg, '() => today()'), 'undo failed')
    pg.fill('form[data-form="quick-add"] [name="title"]', 'Buy notebook'); pg.click('form[data-form="quick-add"] button'); pg.wait_for_timeout(150)
    t = ev(pg, "() => all('task').find(t => t.title === 'Buy notebook')"); check(t and not t.get('plannedDate'), 'quick add wrong')
    pg.click('#toast-action'); pg.wait_for_timeout(150); check(ev(pg, "() => all('task').some(t => t.title === 'Buy notebook')") is False, 'quick add undo failed')

@test('Flow', 'First run shows marked example data; clearing it leaves an empty, guided app')
def _(pg, ctx):
    open_app(pg)
    check(pg.locator('.banner >> text=Example data').count() == 1, 'no example banner')
    pg.click('.banner [data-action="clear-examples"]')
    pg.click('#sheet-root form[data-form="confirm"] button.primary')
    sheet_closed(pg); pg.wait_for_timeout(200)
    check(ev(pg, '() => [...S.records.values()].filter(r=>r.ex).length') == 0, 'examples remain')
    check(pg.locator('.banner >> text=Example data').count() == 0, 'banner still shown')
    check(pg.locator('.next-title:text("Nothing to plan")').count() == 1, 'no empty Now state')
    go(pg, 'review'); check(pg.locator('text=Set your direction first').count() == 1, 'no direction prompt in Review')
    pg.reload(); pg.wait_for_selector('html[data-ready="1"]')
    check(ev(pg, '() => S.records.size') == 0, 'examples came back after reload')

@test('Flow', 'Build area → aim → goal → project → task; task shows why it matters in Today')
def _(pg, ctx):
    open_app(pg); clear_examples(pg)
    t = today(pg)
    def add(sub, type_, fill, selects={}):
        go(pg, 'life', sub); pg.click(f'.page-head [data-action="add"][data-type="{type_}"]')
        for k, v in fill.items(): pg.fill(f'#sheet-root [name="{k}"]', v)
        for k, v in selects.items(): pg.select_option(f'#sheet-root [name="{k}"]', label=v)
        sheet_submit(pg); sheet_closed(pg)
    add('areas', 'area', {'emoji': '🌱', 'name': 'Health'})
    add('aims', 'aim', {'title': 'Live long and well'}, {'areaId': '🌱 Health'})
    add('goals', 'goal', {'title': 'Run a 10k'}, {'aimId': 'Live long and well'})
    add('projects', 'project', {'title': 'Training plan'}, {'goalId': 'Run a 10k'})
    add('tasks', 'task', {'title': 'First run', 'estimateMin': '30', 'plannedDate': t, 'firstStep': 'Put on shoes'}, {'projectId': 'Training plan'})
    pg.click('#tabbar [data-to="today"]'); pg.wait_for_timeout(200)
    card = pg.locator('article.task', has_text='First run')
    check(card.count() == 1, 'task not on Today')
    txt = card.inner_text()
    check('Matters for' in txt and 'Run a 10k' in txt and 'Live long and well' in txt and 'Put on shoes' in txt, f'why chain missing: {txt}')
    check(ev(pg, "() => Brain.analyze(data()).filter(f=>f.kind==='structure' && f.id!=='goal-idle:'+all('goal')[0].id).length") == 0, 'structure warnings for a fully linked model')

@test('Flow', 'Finishing a task records actual time and outcome separately from the plan')
def _(pg, ctx):
    open_app(pg); clear_examples(pg)
    go(pg, 'today')
    pg.fill('form[data-form="quick-task"] [name="title"]', 'Write report'); pg.fill('form[data-form="quick-task"] [name="estimateMin"]', '30')
    pg.click('form[data-form="quick-task"] button'); pg.wait_for_timeout(200)
    pg.click('article.task:has-text("Write report") [data-action="task-done"]')
    pg.fill('#sheet-root [name="actualMin"]', '45'); pg.fill('#sheet-root [name="outcomeNote"]', 'Data was late')
    pg.select_option('#sheet-root [name="outcome"]', 'partly'); pg.check('#sheet-root [name="lesson"]')
    sheet_submit(pg); sheet_closed(pg); pg.wait_for_timeout(150)
    task = ev(pg, "() => all('task').find(t=>t.title==='Write report')")
    check(task['status'] == 'done' and task['estimateMin'] == 30 and task['actualMin'] == 45 and task['outcome'] == 'partly', f'task {task}')
    reality = pg.locator('section:has(h2:text("Reality so far"))').inner_text()
    check('planned 30m' in reality and 'took 45m' in reality and 'Partly done' in reality, f'reality section: {reality}')
    check(ev(pg, "() => all('memory').some(m=>m.kind==='lesson' && m.body.includes('Data was late'))"), 'lesson not saved')
    pg.click('section:has(h2:text("Reality so far")) [data-action="task-reopen"]'); pg.wait_for_timeout(150)
    check(ev(pg, "() => all('task').find(t=>t.title==='Write report').status") == 'open', 'undo failed')

@test('Flow', 'Moving a task counts a deferral; letting go records the reason')
def _(pg, ctx):
    open_app(pg); clear_examples(pg); go(pg, 'today')
    for title in ['Move me', 'Drop me']:
        pg.fill('form[data-form="quick-task"] [name="title"]', title); pg.click('form[data-form="quick-task"] button'); pg.wait_for_timeout(150)
    pg.click('article.task:has-text("Move me") [data-action="task-move"]'); pg.wait_for_timeout(150)
    t = ev(pg, "() => all('task').find(t=>t.title==='Move me')")
    check(t['deferrals'] == 1 and t['plannedDate'] == ev(pg, '() => addDays(today(),1)') and len(t['plans']) == 2, f'move {t}')
    pg.click('article.task:has-text("Drop me") [data-action="task-drop"]')
    pg.fill('#sheet-root [name="reason"]', 'No longer matters'); sheet_submit(pg); sheet_closed(pg)
    d = ev(pg, "() => all('task').find(t=>t.title==='Drop me')")
    check(d['status'] == 'abandoned' and d['abandonedReason'] == 'No longer matters', f'drop {d}')

@test('Flow', 'Forms validate input and save nothing when invalid')
def _(pg, ctx):
    open_app(pg); clear_examples(pg)
    go(pg, 'life', 'tasks'); pg.click('.page-head [data-action="add"]')
    sheet_submit(pg); pg.wait_for_timeout(150)
    check('Task is required' in pg.inner_text('#sheet-root .err'), 'no required error')
    pg.fill('#sheet-root [name="title"]', 'x'); pg.fill('#sheet-root [name="estimateMin"]', '5000'); sheet_submit(pg); pg.wait_for_timeout(150)
    check('between' in pg.inner_text('#sheet-root .err'), 'no range error')
    ev(pg, '() => closeSheet()')
    go(pg, 'calendar'); pg.click('.page-head [data-action="add"]')
    pg.fill('#sheet-root [name="title"]', 'Bad'); pg.fill('#sheet-root [name="start"]', '10:00'); pg.fill('#sheet-root [name="end"]', '09:00')
    sheet_submit(pg); pg.wait_for_timeout(150)
    check('must end after it starts' in pg.inner_text('#sheet-root .err'), 'no time-order error')
    check(ev(pg, '() => S.records.size') == 0, 'invalid data was saved')
    ev(pg, '() => closeSheet()')
    go(pg, 'life', 'direction'); pg.fill('form[data-form="profile"] [name="capacityHours"]', '30'); pg.click('form[data-form="profile"] button.primary'); pg.wait_for_timeout(150)
    check('between 0.5 and 18' in pg.inner_text('form[data-form="profile"] .err'), 'capacity not validated')

@test('Flow', 'Calendar: add events, detect overlap and load, switch months and agenda')
def _(pg, ctx):
    open_app(pg); clear_examples(pg); go(pg, 'calendar')
    for title, s, e in [('Standup', '09:00', '10:00'), ('Call', '09:30', '10:30')]:
        pg.click('.page-head [data-action="add"]'); pg.fill('#sheet-root [name="title"]', title)
        pg.fill('#sheet-root [name="start"]', s); pg.fill('#sheet-root [name="end"]', e); pg.fill('#sheet-root [name="location"]', 'Room 2')
        sheet_submit(pg); sheet_closed(pg)
    check(pg.locator('.tag:text("Overlaps")').count() == 2, 'overlap not shown on both events')
    check(ev(pg, "() => Brain.analyze(data()).some(f=>f.kind==='conflict')"), 'no conflict finding')
    check('2h of' in pg.inner_text('#view') or '2h 0m' in pg.inner_text('#view') or '2h' in pg.inner_text('#view'), 'day load not shown')
    h1 = pg.inner_text('.cal-head h2'); pg.click('[data-action="cal-shift"][data-n="1"]'); h2 = pg.inner_text('.cal-head h2')
    check(h1 != h2, 'month did not change'); pg.click('[data-action="cal-today"]')
    pg.click('[data-action="cal-mode"][data-mode="agenda"]'); pg.wait_for_timeout(100)
    check(pg.locator('.agenda-day:has-text("Standup")').count() == 1, 'agenda missing event')

@test('Flow', 'Experiment: hypothesis → start → observation → outcome → learning saved')
def _(pg, ctx):
    open_app(pg); clear_examples(pg); go(pg, 'experiments')
    pg.click('.page-head [data-action="add"]')
    pg.fill('#sheet-root [name="title"]', 'Morning walk'); pg.fill('#sheet-root [name="hypothesis"]', 'If I walk at 8, I focus better by 10.')
    pg.fill('#sheet-root [name="measurement"]', 'Focus 1–5 at 10:00'); sheet_submit(pg); sheet_closed(pg)
    pg.click('button.item:has-text("Morning walk")'); pg.click('#sheet-root [data-action="exp-start"]'); pg.wait_for_timeout(200)
    pg.fill('#sheet-root form[data-form="exp-obs"] [name="value"]', '4'); pg.fill('#sheet-root form[data-form="exp-obs"] [name="note"]', 'Felt sharp')
    pg.click('#sheet-root form[data-form="exp-obs"] button'); pg.wait_for_timeout(200)
    check(pg.locator('#sheet-root .item:has-text("Felt sharp")').count() == 1, 'observation not listed')
    pg.click('#sheet-root [data-action="exp-finish"]')
    pg.fill('#sheet-root [name="outcome"]', 'Focus averaged 4'); pg.fill('#sheet-root [name="learning"]', 'Walking helps'); pg.fill('#sheet-root [name="adaptation"]', 'Keep it on weekdays')
    sheet_submit(pg); sheet_closed(pg)
    e = ev(pg, "() => all('experiment')[0]")
    check(e['status'] == 'done' and len(e['observations']) == 1 and e['learning'] == 'Walking helps', f'experiment {e}')
    check(ev(pg, "() => all('memory').some(m=>m.kind==='worked' && m.title.includes('Walking helps'))"), 'learning not in memory')

@test('Flow', 'Diagnose: agree, annotate and reject conclusions; rejected ones hide')
def _(pg, ctx):
    open_app(pg); go(pg, 'brain')
    pg.click('button.item[data-id^="delayed:"]')
    txt = pg.inner_text('#sheet-root').lower()
    check(all(h.lower() in txt for h in ['H1', 'H2', 'H3', 'What would change this conclusion', 'confidence', 'evidence']), 'diagnosis incomplete')
    pg.fill('#sheet-root [name="note"]', 'The workshop was a one-off'); pg.click('#sheet-root button[value="accepted"]'); sheet_closed(pg)
    ins = ev(pg, "() => all('insight')[0]")
    check(ins['status'] == 'accepted' and ins['note'] == 'The workshop was a one-off', f'insight {ins}')
    go(pg, 'review'); check('agreed' in pg.inner_text('section:has(h2:text("Insights"))').lower(), 'insight not in Review')
    go(pg, 'brain'); pg.click('button.item[data-id="orphans"]'); pg.click('#sheet-root button[value="rejected"]'); sheet_closed(pg)
    check(pg.locator('button.item[data-id="orphans"]').count() == 0, 'rejected finding still listed')
    pg.click('[data-action="toggle-dismissed"]'); check(pg.locator('button.item[data-id="orphans"]').count() == 1, 'cannot show dismissed')

@test('Flow', 'Help me decide: weighted scores update live and the decision is saved with its reason')
def _(pg, ctx):
    open_app(pg); go(pg, 'brain'); pg.click('[data-action="brain-decide"]')
    pg.fill('#sheet-root [name="question"]', 'Course now or later?'); pg.fill('#sheet-root [name="options"]', 'Now\nLater')
    pg.fill('#sheet-root [name="criteria"]', 'Health\nCraft'); sheet_submit(pg); pg.wait_for_selector('#dec-totals')
    before = pg.inner_text('#dec-totals'); pg.select_option('#sheet-root [name="s0_0"]', '5'); pg.wait_for_timeout(100)
    check(pg.inner_text('#dec-totals') != before and 'Now' in pg.inner_text('#dec-result'), 'totals did not update')
    pg.fill('#sheet-root [name="why"]', 'Health matters most this season'); pg.click('#sheet-root form[data-form="decision-save"] button.primary'); sheet_closed(pg)
    m = ev(pg, "() => all('memory').find(m=>m.kind==='decision' && m.title.startsWith('Course now'))")
    check(m and m['why'] == 'Health matters most this season' and 'Now' in m['title'], f'decision {m}')

@test('Flow', 'Analyze life, suggest experiments and ask-anything work locally without AI')
def _(pg, ctx):
    open_app(pg); go(pg, 'brain')
    pg.click('[data-action="brain-analyze"]'); txt = pg.inner_text('#sheet-root')
    check('kept' in txt and 'capacity' in txt and '×' in txt, f'analysis: {txt[:200]}'); ev(pg, '() => closeSheet()')
    pg.click('[data-action="brain-suggest"]'); check(pg.locator('#sheet-root [data-action="start-suggested"]').count() >= 2, 'no suggestions')
    pg.click('#sheet-root [data-action="start-suggested"] >> nth=0'); check(pg.input_value('#sheet-root [name="hypothesis"]').startswith('If '), 'suggestion not prefilled')
    sheet_submit(pg); sheet_closed(pg)
    pg.click('[data-action="brain-ask"]'); pg.fill('#sheet-root [name="q"]', 'Do focus timers work on meeting days?'); sheet_submit(pg)
    pg.wait_for_selector('#ask-out .item'); check('focus timers' in pg.inner_text('#ask-out'), 'recall did not find memory')

@test('Flow', 'Habits, values and direction editing')
def _(pg, ctx):
    open_app(pg); go(pg, 'today')
    chip = pg.locator('[data-action="habit-toggle"]').first; before = chip.get_attribute('aria-pressed'); chip.click(); pg.wait_for_timeout(150)
    check(pg.locator('[data-action="habit-toggle"]').first.get_attribute('aria-pressed') != before, 'habit toggle failed')
    go(pg, 'life', 'direction'); pg.fill('form[data-form="value-add"] [name="value"]', 'Courage'); pg.click('form[data-form="value-add"] button'); pg.wait_for_timeout(150)
    check(ev(pg, '() => S.profile.values.at(-1)') == 'Courage', 'value not added')
    pg.click('[data-action="value-move"][data-d="-1"] >> nth=-1'); pg.wait_for_timeout(100)
    check(ev(pg, '() => S.profile.values.at(-2)') == 'Courage', 'value not moved')
    pg.fill('form[data-form="profile"] [name="direction"]', 'Build a calm, healthy life'); pg.click('form[data-form="profile"] button.primary'); pg.wait_for_timeout(150)
    check(ev(pg, '() => [S.profile.direction, S.profile.ex]') == ['Build a calm, healthy life', False], 'direction not saved as user data')

@test('Flow', 'Exactly two modes (white, true black) and seven highlight colours; choice tints the UI and persists')
def _(pg, ctx):
    open_app(pg); go(pg, 'settings')
    check(pg.locator('[data-action="set-mode"]').count() == 2, 'not exactly two modes')
    check(pg.locator('[data-action="set-accent"]').count() == 7, 'not exactly seven accents')
    pg.click('[data-action="set-mode"][data-mode="black"]'); pg.wait_for_timeout(500)
    check(ev(pg, "() => [document.documentElement.dataset.mode, getComputedStyle(document.body).backgroundColor]") == ['black', 'rgb(0, 0, 0)'], 'black mode is not true black (it must blend into an AMOLED screen)')
    surfaces = []
    for a in ['blue', 'red', 'yellow', 'green', 'purple', 'pink', 'orange']:
        pg.click(f'[data-action="set-accent"][data-accent="{a}"]'); pg.wait_for_timeout(60)
        surfaces.append(ev(pg, "() => getComputedStyle(document.querySelector('.mode-card')).borderColor + '|' + getComputedStyle(document.querySelector('.mode-card')).backgroundColor"))
    check(len(set(surfaces)) == 7, f'accent does not tint neutral surfaces: {surfaces}')
    pg.click('[data-action="set-mode"][data-mode="white"]'); pg.click('[data-action="set-accent"][data-accent="green"]'); pg.wait_for_timeout(100)
    pg.reload(); pg.wait_for_selector('html[data-ready="1"]')
    check(ev(pg, "() => [document.documentElement.dataset.mode, S.settings.accent, getComputedStyle(document.body).backgroundColor]") == ['white', 'green', 'rgb(244, 242, 237)'], 'appearance not persisted')

@test('Flow', 'Navigation: tab bar, More sheet, and desktop sidebar reach every section')
def _(pg, ctx):
    open_app(pg)
    check(pg.locator('#tabbar [data-to="calendar"]').count() == 0, 'calendar should not be a tab')
    for to in ['today', 'lines', 'brain', 'home']:
        pg.click(f'#tabbar [data-to="{to}"]'); check(ev(pg, '() => LB.route.name') == to, f'tab {to}')
    for to in ['memory', 'life', 'experiments', 'review', 'settings']:
        pg.click('#tabbar [data-action="more"]'); pg.click(f'#sheet-root [data-to="{to}"]'); sheet_closed(pg)
        check(ev(pg, '() => LB.route.name') == to, f'more → {to}')
    pg.set_viewport_size({'width': 1280, 'height': 900}); pg.wait_for_timeout(100)
    check(pg.is_visible('#side') and not pg.is_visible('#tabbar'), 'desktop layout wrong')
    pg.click('#side [data-to="experiments"]'); check(ev(pg, '() => LB.route.name') == 'experiments', 'sidebar nav')

# =====================================================================
# Persistence
# =====================================================================
@test('Persistence', 'Data and profile survive a reload and a new tab')
def _(pg, ctx):
    open_app(pg); clear_examples(pg); go(pg, 'today')
    pg.fill('form[data-form="quick-task"] [name="title"]', 'Persist me'); pg.click('form[data-form="quick-task"] button'); pg.wait_for_timeout(200)
    go(pg, 'life', 'direction'); pg.fill('form[data-form="profile"] [name="direction"]', 'Stay curious'); pg.click('form[data-form="profile"] button.primary'); pg.wait_for_timeout(200)
    pg2 = ctx.new_page(); open_app(pg2)
    check(ev(pg2, "() => [all('task').some(t=>t.title==='Persist me'), S.profile.direction]") == [True, 'Stay curious'], 'not persisted to a new tab')
    pg2.close()

@test('Persistence', 'A failed save shows an error and no success message', allow_console=True)
def _(pg, ctx):
    open_app(pg); go(pg, 'today')
    ev(pg, "() => { idb.transaction = () => { throw new Error('QuotaExceeded'); }; }")
    pg.fill('form[data-form="quick-task"] [name="title"]', 'Will fail'); pg.click('form[data-form="quick-task"] button'); pg.wait_for_timeout(300)
    toast = pg.inner_text('#toast'); cls = pg.get_attribute('#toast', 'class')
    check('Not saved' in toast and cls == 'bad', f'toast was: {toast} ({cls})')
    check('A save failed' in pg.inner_text('#view'), 'no persistent warning banner')

@test('Persistence', 'Blocked storage: app still works in memory and says it is not saving', allow_console=True)
def _(pg, ctx):
    pg.add_init_script("Object.defineProperty(window, 'indexedDB', { get() { return { open() { throw new Error('blocked'); } }; } });")
    open_app(pg)
    check('Not saving' in pg.inner_text('#view'), 'no not-saving banner')
    go(pg, 'today'); pg.fill('form[data-form="quick-task"] [name="title"]', 'In memory'); pg.click('form[data-form="quick-task"] button'); pg.wait_for_timeout(150)
    check(pg.locator('article.task:has-text("In memory")').count() == 1, 'cannot work in memory')

# =====================================================================
# Import / export / backup / delete
# =====================================================================
@test('Data', 'Export downloads a complete JSON backup without the API key')
def _(pg, ctx):
    open_app(pg)
    ev(pg, "async () => { await saveSettings({ai:{rememberKeys:true}}); await setAiKey('openrouter', 'sk-secret-999'); }")
    go(pg, 'settings')
    with pg.expect_download() as d: pg.click('[data-action="export"]')
    path = d.value.path(); raw = open(path).read(); obj = json.loads(raw)
    check(obj['app'] == 'life-brain' and len(obj['records']) == ev(pg, '() => S.records.size') and obj['profile']['direction'], 'backup incomplete')
    check('sk-secret-999' not in raw, 'API key leaked into export')
    check(d.value.suggested_filename.startswith('life-brain-backup-'), 'filename')

@test('Data', 'Import merges a backup into another device and replaces after confirmation')
def _(pg, ctx):
    open_app(pg)
    raw = ev(pg, '() => JSON.stringify(exportData())'); n = ev(pg, '() => S.records.size')
    f = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); f.write(raw); f.close()
    pg2 = ctx.browser.new_context().new_page(); open_app(pg2); clear_examples(pg2); go(pg2, 'today')
    pg2.fill('form[data-form="quick-task"] [name="title"]', 'Local only'); pg2.click('form[data-form="quick-task"] button'); pg2.wait_for_timeout(150)
    go(pg2, 'settings'); pg2.set_input_files('#import-file', f.name); pg2.wait_for_selector('#sheet-root [data-action="import-go"]')
    check('tasks' in pg2.inner_text('#sheet-root').lower(), 'no preview counts')
    pg2.click('#sheet-root [data-action="import-go"][data-mode="merge"]'); sheet_closed(pg2); pg2.wait_for_timeout(200)
    check(ev(pg2, '() => S.records.size') == n + 1, 'merge count wrong')
    pg2.set_input_files('#import-file', f.name); pg2.click('#sheet-root [data-action="import-go"][data-mode="replace"]')
    pg2.click('#sheet-root form[data-form="confirm"] button.danger'); sheet_closed(pg2); pg2.wait_for_timeout(250)
    check(ev(pg2, '() => [S.records.size, all("task").some(t=>t.title==="Local only")]') == [n, False], 'replace wrong')
    check(len(ev(pg2, '() => listSnapshots()')) >= 1, 'no safety backup before import')
    pg2.context.close()

@test('Data', 'Invalid import files are rejected with a reason and change nothing')
def _(pg, ctx):
    open_app(pg); n = ev(pg, '() => S.records.size'); go(pg, 'settings')
    for content, expect in [('not json at all', 'not valid JSON'), (json.dumps({'app': 'x', 'records': []}), 'not a Life Brain backup')]:
        f = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); f.write(content); f.close()
        pg.set_input_files('#import-file', f.name); pg.wait_for_timeout(250)
        shown = pg.inner_text('#toast') + (pg.inner_text('#sheet-root') if pg.locator('#sheet-root .sheet').count() else '')
        check(expect in shown, f'expected "{expect}", saw: {shown[:160]}'); ev(pg, '() => closeSheet()')
    check(ev(pg, '() => S.records.size') == n, 'data changed by a bad import')

@test('Data', 'Device backups: back up now and restore')
def _(pg, ctx):
    open_app(pg); go(pg, 'settings'); pg.click('[data-action="snap-now"]'); pg.wait_for_selector('[data-action="snap-restore"]')
    n = ev(pg, '() => S.records.size'); clear_examples(pg); check(ev(pg, '() => S.records.size') == 0, 'clear failed')
    go(pg, 'settings'); pg.wait_for_timeout(200); ev(pg, '() => { snapCache = null; render(); }'); pg.wait_for_timeout(300)
    btns = pg.locator('.item:has-text("Manual backup") [data-action="snap-restore"]'); btns.first.click()
    pg.click('#sheet-root form[data-form="confirm"] button.danger'); sheet_closed(pg); pg.wait_for_timeout(300)
    check(ev(pg, '() => S.records.size') == n, 'restore did not bring data back')

@test('Data', 'Delete everything needs DELETE typed and erases records, key and backups')
def _(pg, ctx):
    open_app(pg); ev(pg, "async () => { await saveSettings({ai:{rememberKeys:true}}); await setAiKey('openai', 'sk-x'); await snapshot('t'); }"); go(pg, 'settings')
    pg.click('[data-action="wipe"]'); pg.fill('#sheet-root [name="confirm"]', 'nope'); pg.click('#sheet-root button.danger'); pg.wait_for_timeout(150)
    check('Type DELETE' in pg.inner_text('#sheet-root .err') and ev(pg, '() => S.records.size') > 0, 'deleted without correct confirmation')
    pg.fill('#sheet-root [name="confirm"]', 'DELETE'); pg.click('#sheet-root button.danger'); sheet_closed(pg); pg.wait_for_timeout(300)
    check(ev(pg, '() => S.records.size') == 0 and ev(pg, '() => S.aiKeys') == {}, 'not erased')
    pg.reload(); pg.wait_for_selector('html[data-ready="1"]')
    check(ev(pg, '() => S.records.size') == 0 and ev(pg, '() => S.aiKeys') == {} and len(ev(pg, '() => listSnapshots()')) == 0, 'data or backups survived reload')

@test('Data', 'Backup-as-text shows the same JSON for copying')
def _(pg, ctx):
    open_app(pg); go(pg, 'settings'); pg.click('[data-action="export-text"]')
    obj = json.loads(pg.input_value('#backup-text')); check(obj['app'] == 'life-brain' and len(obj['records']) == ev(pg, '() => S.records.size'), 'text backup wrong')

# =====================================================================
# Offline (self-hosted PWA)
# =====================================================================
@test('Offline', 'Service worker caches the app; it reloads and saves with no network')
def _(pg, ctx):
    open_app(pg)
    pg.wait_for_function('() => LB.swState === "ready"', timeout=15000)
    pg.reload(); pg.wait_for_selector('html[data-ready="1"]')
    check(ev(pg, '() => !!navigator.serviceWorker.controller'), 'page not controlled by service worker')
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_selector('html[data-ready="1"]', timeout=10000)
    check('offline' in pg.inner_text('#view').lower(), 'offline state not shown')
    go(pg, 'today'); pg.fill('form[data-form="quick-task"] [name="title"]', 'Offline task'); pg.click('form[data-form="quick-task"] button'); pg.wait_for_timeout(200)
    pg.reload(); pg.wait_for_selector('html[data-ready="1"]')
    check(ev(pg, "() => all('task').some(t=>t.title==='Offline task')"), 'offline change lost')
    ctx.set_offline(False)
    check(pg.evaluate("fetch('manifest.webmanifest').then(r=>r.json()).then(m=>m.display)") == 'standalone', 'manifest not installable-standalone')

# =====================================================================
# External AI
# =====================================================================
@test('AI', 'Missing key: nothing is sent; Brain says how to set up; a forgotten key is called out')
def _(pg, ctx):
    open_app(pg); ai_setup(pg, key='')
    ev(pg, "() => A['analyze-ai']()"); pg.wait_for_selector('#ai-preview')
    check(pg.is_disabled('#ai-send') and 'No AI provider' in pg.inner_text('#sheet-root'), 'should block sending without a key')
    check(ev(pg, "() => callProvider('openai', 'x').then(() => 'sent', e => e.code)") == 'missing_key', 'provider call without key not refused')
    ev(pg, '() => closeSheet()'); ai_setup(pg); ev(pg, "() => saveSettings({ai:{rememberKeys:false}})")
    pg.reload(); pg.wait_for_selector('html[data-ready="1"]'); go(pg, 'settings')
    check('Paste the key again for OpenAI' in pg.inner_text('#view'), 'forgotten key not called out')
    check(ev(pg, '() => AI.provider()') == 'none', 'provider should be none without key')

@test('AI', 'Success: preview equals what is sent; user controls scopes; answer shown safely and saved')
def _(pg, ctx):
    open_app(pg); ai_setup(pg); AI_LOG.clear()
    ev(pg, "() => put({type:'event', title:'Dentist', location:'Clinic, 2nd floor', date: today(), start:'11:00', end:'12:00'})")
    ev(pg, "() => A['analyze-ai']()"); pg.wait_for_selector('#ai-preview')
    check('What the local Brain detected' in pg.inner_text('#ai-preview'), 'scope missing from preview')
    pg.uncheck('#sheet-root [data-scope="findings"]'); pg.wait_for_timeout(50)
    preview = pg.inner_text('#ai-preview')
    check('What the local Brain detected' not in preview, 'unchecked scope still previewed')
    check('Dentist' in preview and 'Clinic, 2nd floor' not in preview, 'event details should be off by default')
    pg.click('#ai-send'); pg.wait_for_selector('#ai-answer', timeout=10000)
    sent = AI_LOG[-1]; msgs = sent['body']['messages']
    check(sent['auth'] == 'Bearer sk-test-123' and sent['body']['model'] == 'test-model', 'request headers/model wrong')
    check('What the local Brain detected' not in msgs[1]['content'] and 'Life direction' not in msgs[1]['content'] and 'Direction, values' in msgs[1]['content'], 'sent body ignores scope choice')
    check((msgs[0]['content'] + '\n\n' + msgs[1]['content']).strip() == preview.strip(), 'preview differs from what was sent')
    check(len(json.dumps(sent['body'])) < 20000, 'whole database sent')
    check(ev(pg, '() => [window.__xss2, window.__xss3, document.querySelectorAll("#ai-answer script, #ai-answer img").length]') == [None, None, 0], 'AI output executed HTML')
    check('<strong>' in pg.inner_html('#ai-answer'), 'markdown not rendered')
    pg.click('#ai-save'); pg.wait_for_timeout(200)
    check(ev(pg, "() => all('memory').some(m=>m.source==='ai' && m.body.includes('H1'))"), 'answer not saved')
    check(ev(pg, "() => all('goal').length") == 4 and 'Ship meaningful' in ev(pg, '() => S.profile.direction'), 'AI changed user data')
    check('openai' in pg.inner_text('#sheet-root').lower() or 'OpenAI' in pg.inner_text('#sheet-root'), 'provider not named in preview')

@test('AI', 'Provider errors: 500, 401, empty answer and unreachable host give clear messages')
def _(pg, ctx):
    open_app(pg)
    for kind, code, text in [('fail', 'upstream', 'boom'), ('auth', 'auth', 'rejected the API key'), ('credits', 'credits', 'no credit left'), ('empty', 'empty', 'no text')]:
        ai_setup(pg, kind); ai_send(pg)
        check(pg.get_attribute('#ai-error', 'data-code') == code and text in pg.inner_text('#ai-error'), f'{kind}: {pg.inner_text("#ai-error")}')
        ev(pg, '() => closeSheet()')
    ev(pg, "async () => { await saveSettings({ai:{baseUrls:{openai:'http://localhost:8798/v1'}}}); }"); ai_send(pg)
    check(pg.get_attribute('#ai-error', 'data-code') == 'network', 'unreachable host not handled')
    check(not pg.is_disabled('#ai-send'), 'cannot retry after failure')

@test('AI', 'Timeout ends a hung request with a message')
def _(pg, ctx):
    open_app(pg); ai_setup(pg, 'slow', timeout=5); t0 = time.time(); ai_send(pg, timeout=12000)
    check(pg.get_attribute('#ai-error', 'data-code') == 'timeout' and 'No answer after 5 seconds' in pg.inner_text('#ai-error'), 'timeout not reported')
    check(4.5 < time.time() - t0 < 9, f'timeout took {time.time()-t0:.1f}s')

@test('AI', 'Stop cancels a request in progress')
def _(pg, ctx):
    open_app(pg); ai_setup(pg, 'slow', timeout=60); ev(pg, "() => A['analyze-ai']()"); pg.wait_for_selector('#ai-preview')
    pg.click('#ai-send'); pg.wait_for_selector('#ai-stop'); pg.wait_for_timeout(500); pg.click('#ai-stop')
    pg.wait_for_selector('#ai-error', timeout=4000); check(pg.get_attribute('#ai-error', 'data-code') == 'cancelled', 'stop did not cancel')

@test('AI', 'Paste an OpenRouter key: detected, checked for free, models listed, answer works, key kept only if asked')
def _(pg, ctx):
    open_app(pg); go(pg, 'settings'); AI_LOG.clear()
    key = 'sk-or-v1-' + 'a' * 64
    pg.fill('#f-aikey', key); check('Recognised: OpenRouter key' in pg.inner_text('#ai-detect'), 'not detected: ' + pg.inner_text('#ai-detect'))
    check(pg.input_value('#f-aiprov') == 'openrouter', 'service not preselected')
    pg.fill('#f-aibase', f'{AI_BASE}/openrouter/api/v1'); pg.click('form[data-form="ai-connect"] button.primary')
    pg.wait_for_selector('[data-conn="openrouter"]')
    check('Connected · 2 models' in pg.inner_text('#view'), 'embedding model not filtered or no status')
    check(pg.input_value('[data-model-for="openrouter"]') == 'openrouter/auto', 'default model not picked')
    check(any(r['method'] == 'GET' and r['auth'] == 'Bearer ' + key for r in AI_LOG), 'models not fetched with key')
    pg.click('[data-action="ai-check"][data-p="openrouter"]'); pg.wait_for_selector('[data-status="openrouter"]:has-text("Key works")')
    check('$4.20 of $10.00 left' in pg.inner_text('[data-status="openrouter"]'), 'credit not shown')
    pg.fill('[data-model-for="openrouter"]', 'meta/llama-free'); pg.dispatch_event('[data-model-for="openrouter"]', 'change'); pg.wait_for_timeout(150)
    check(ev(pg, "() => S.settings.ai.models.openrouter") == 'meta/llama-free', 'model choice not saved')
    ai_send(pg); check(pg.locator('#ai-answer').count() == 1, 'no answer')
    sent = [r for r in AI_LOG if r['method'] == 'POST'][-1]
    check(sent['path'] == '/openrouter/api/v1/chat/completions' and sent['body']['model'] == 'meta/llama-free' and sent['auth'] == 'Bearer ' + key, f'wrong request {sent["path"]}')
    check(ev(pg, "() => idbDo('meta','readonly', st => st.get('aiKeys'))") is None, 'key stored without consent')
    ev(pg, '() => closeSheet()'); pg.click('details.disclosure summary'); pg.check('form[data-form="ai-advanced"] [name="rememberKeys"]'); pg.click('form[data-form="ai-advanced"] button'); pg.wait_for_timeout(200)
    check(ev(pg, "() => idbDo('meta','readonly', st => st.get('aiKeys'))")['value'] == {'openrouter': key}, 'remembered key not stored')
    raw = ev(pg, '() => JSON.stringify(exportData())'); check(key not in raw, 'key leaked into export')
    pg.click('[data-action="ai-remove"][data-p="openrouter"]'); pg.wait_for_timeout(200)
    check(ev(pg, "() => idbDo('meta','readonly', st => st.get('aiKeys'))") is None and ev(pg, '() => S.aiKeys') == {}, 'remove did not forget key')

@test('AI', 'Connecting refuses bad keys and insecure addresses; network trouble offers Save anyway')
def _(pg, ctx):
    open_app(pg); go(pg, 'settings')
    pg.fill('#f-aikey', 'sk-proj-abc'); pg.fill('#f-aibase', 'http://evil.example/v1'); pg.click('form[data-form="ai-connect"] button.primary'); pg.wait_for_timeout(200)
    check('https://' in pg.inner_text('form[data-form="ai-connect"] .err'), 'insecure address accepted')
    pg.fill('#f-aibase', f'{AI_BASE}/auth/v1'); pg.click('form[data-form="ai-connect"] button.primary'); pg.wait_for_timeout(400)
    check('rejected the API key' in pg.inner_text('form[data-form="ai-connect"] .err') and ev(pg, '() => S.aiKeys') == {}, 'bad key saved')
    pg.fill('#f-aibase', 'http://localhost:8798/v1'); pg.click('form[data-form="ai-connect"] button.primary'); pg.wait_for_selector('[data-action="ai-connect-anyway"]')
    pg.click('[data-action="ai-connect-anyway"]'); pg.wait_for_selector('[data-conn="openai"]')
    check(ev(pg, "() => S.aiKeys.openai") == 'sk-proj-abc' and 'Saved without checking' in pg.inner_text('#view'), 'save anyway failed')
    pg.fill('#f-aikey', 'zzz'); check('Not sure which service' in pg.inner_text('#ai-detect'), 'unknown key not flagged')
    pg.click('form[data-form="ai-connect"] button.primary'); pg.wait_for_timeout(150)
    check('Choose it under Service' in pg.inner_text('form[data-form="ai-connect"] .err'), 'unknown key accepted without service')

@test('AI', 'Anthropic and Gemini keys use their own request formats and headers')
def _(pg, ctx):
    open_app(pg); go(pg, 'settings'); AI_LOG.clear()
    pg.fill('#f-aikey', 'sk-ant-api03-test'); check(pg.input_value('#f-aiprov') == 'anthropic', 'anthropic not detected')
    pg.fill('#f-aibase', f'{AI_BASE}/anthropic/v1'); pg.click('form[data-form="ai-connect"] button.primary'); pg.wait_for_selector('[data-conn="anthropic"]')
    check(pg.input_value('[data-model-for="anthropic"]') == 'claude-sonnet-test', 'sonnet not preferred')
    g = [r for r in AI_LOG if r['method'] == 'GET'][-1]['headers']
    check(g.get('x-api-key') == 'sk-ant-api03-test' and g.get('anthropic-version') and g.get('anthropic-dangerous-direct-browser-access') == 'true' and 'authorization' not in g, f'anthropic headers {g}')
    ai_send(pg); check('Anthropic says' in pg.inner_text('#ai-answer'), 'anthropic answer missing')
    p = [r for r in AI_LOG if r['method'] == 'POST'][-1]
    check(p['path'] == '/anthropic/v1/messages' and p['body']['system'].startswith('You are') and p['body']['messages'][0]['role'] == 'user' and p['body']['max_tokens'] > 0, 'anthropic body wrong')
    ev(pg, '() => closeSheet()'); pg.wait_for_timeout(500)
    gkey = 'AIzaSy' + 'B' * 33
    pg.fill('#f-aikey', gkey); check(pg.input_value('#f-aiprov') == 'gemini', 'gemini not detected')
    pg.fill('#f-aibase', f'{AI_BASE}/gemini/v1beta'); pg.click('form[data-form="ai-connect"] button.primary'); pg.wait_for_selector('[data-conn="gemini"]')
    check(pg.input_value('[data-model-for="gemini"]') == 'gemini-2.5-flash' and '1 model' in pg.inner_text('#view'), 'gemini models wrong')
    ai_send(pg); check('Gemini says hi' in pg.inner_text('#ai-answer'), 'gemini answer missing')
    p = [r for r in AI_LOG if r['method'] == 'POST'][-1]
    check(p['path'] == '/gemini/v1beta/models/gemini-2.5-flash:generateContent' and p['headers'].get('x-goog-api-key') == gkey and 'systemInstruction' in p['body'] and p['body']['contents'][0]['parts'][0]['text'], 'gemini request wrong')
    check(ev(pg, '() => AI.connected()') == ['anthropic', 'gemini'], 'both services should stay connected')
    ev(pg, '() => closeSheet()'); sheet_closed(pg)
    pg.click('[data-action="ai-use"][data-p="anthropic"]'); pg.wait_for_timeout(150); check(ev(pg, '() => AI.provider()') == 'anthropic', 'switching service failed')

@test('AI', 'Claude built-in provider (stubbed viewer): streams, answers, and handles a refusal of consent')
def _(pg, ctx):
    pg.add_init_script("""window.__calls=[]; window.__deny=false; window.claude = { use: async (n) => n === 'sample' ? async (input, opts) => {
      window.__calls.push(input); if (window.__deny) throw { code: 'not_granted', message: 'no' };
      opts && opts.onText && opts.onText({ text: 'Partial', delta: 'Partial' }); return { text: 'Claude says **hi**', truncated: false, modelTierApplied: 'default' }; } : null };""")
    open_app(pg); pg.wait_for_timeout(300)
    check(ev(pg, '() => AI.provider()') == 'claude', 'Claude not detected')
    ai_send(pg); check('Claude says' in pg.inner_text('#ai-answer') and 'Claude (built in)' in pg.inner_text('#sheet-root'), 'claude answer missing')
    check(ev(pg, '() => window.__calls[0].includes("Rules:") && window.__calls[0].includes("## Request")'), 'claude prompt malformed')
    ev(pg, '() => { closeSheet(); window.__deny = true; }'); ai_send(pg)
    check(pg.get_attribute('#ai-error', 'data-code') == 'not_granted' and 'not allowed' in pg.inner_text('#ai-error'), 'consent refusal not handled')

# =====================================================================
# Design behaviour (Apple design principles)
# =====================================================================
def sheet_y(pg):
    return ev(pg, "() => { const m = new DOMMatrix(getComputedStyle(document.querySelector('#sheet-root .sheet')).transform); return m.m42; }")

@test('Design', 'Sheet follows the finger, rubber-bands past the top, springs back, and a flick throws it away')
def _(pg, ctx):
    open_app(pg); ev(pg, '() => A.more()'); pg.wait_for_timeout(700)
    check(abs(sheet_y(pg)) < 1, f'sheet not settled open: {sheet_y(pg)}')
    box = pg.locator('#sheet-root .sheet-top').bounding_box(); x, y = box['x'] + 40, box['y'] + 12
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x, y + 60, steps=6)
    mid = sheet_y(pg); check(50 < mid < 70, f'not tracking 1:1 ({mid})')
    pg.mouse.move(x, y - 200, steps=10); up = sheet_y(pg)
    check(-200 < up < -10, f'no rubber-band past the top ({up})')
    pg.mouse.up(); pg.wait_for_timeout(700)
    check(abs(sheet_y(pg)) < 1 and pg.locator('#sheet-root .sheet').count() == 1, 'did not spring back')
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x, y + 25, steps=2); pg.mouse.move(x, y + 140, steps=2); pg.mouse.up()
    sheet_closed(pg)

@test('Design', 'A sheet caught while closing comes back instead of finishing the close')
def _(pg, ctx):
    open_app(pg); ev(pg, '() => A.more()'); pg.wait_for_timeout(700)
    moving = ev(pg, """() => new Promise(res => { closeSheet(); setTimeout(() => { const top = document.querySelector('#sheet-root .sheet-top'); const r = top.getBoundingClientRect();
      const o = { clientX: r.left + 40, clientY: r.top + 12, button: 0, pointerId: 7, bubbles: true, isPrimary: true };
      const y = LB.SH.x; top.dispatchEvent(new PointerEvent('pointerdown', o)); top.dispatchEvent(new PointerEvent('pointerup', o)); res(y); }, 70); })""")
    check(moving > 1, 'close did not start'); pg.wait_for_timeout(800)
    check(pg.locator('#sheet-root .sheet').count() == 1 and abs(sheet_y(pg)) < 1, 'grabbing mid-close did not bring it back')

@test('Design', 'Deleting is instant with Undo, which restores the item and its links')
def _(pg, ctx):
    open_app(pg)
    gid = ev(pg, "() => all('goal').find(g => g.title.startsWith('Ship')).id"); pid = ev(pg, "() => all('project').find(p => p.title === 'Side project v1').id")
    ev(pg, f"() => editSheet('goal', '{gid}')"); pg.click('#sheet-root [data-action="delete"]'); pg.wait_for_timeout(300)
    check(ev(pg, f"() => [!!get('{gid}'), get('{pid}').goalId]") == [False, ''], 'delete did not happen or links kept')
    check(pg.locator('#sheet-root form[data-form="confirm"]').count() == 0, 'asked for confirmation on an undoable action')
    pg.click('#toast-action'); pg.wait_for_timeout(300)
    check(ev(pg, f"() => [!!get('{gid}'), get('{pid}').goalId]") == [True, gid], 'undo did not restore item and links')

@test('Design', 'Fields say what is wrong as soon as you leave them, and clear when fixed')
def _(pg, ctx):
    open_app(pg); ev(pg, "() => editSheet('task')"); pg.wait_for_timeout(400)
    pg.fill('#sheet-root [name="estimateMin"]', '5000'); pg.click('#sheet-root [name="title"]')
    check('Use a value from 0 to 1440' in pg.inner_text('#sheet-root .err-inline') and pg.get_attribute('#sheet-root [name="estimateMin"]', 'aria-invalid') == 'true', 'no inline error')
    pg.fill('#sheet-root [name="estimateMin"]', '45'); pg.wait_for_timeout(50)
    check(pg.locator('#sheet-root .err-inline').count() == 0, 'inline error did not clear')

@test('Design', 'Subway signage: bundled Helvetica-style face, black sign with white rule, no third-party requests, collapsing title bar, reduced motion respected')
def _(pg, ctx):
    hosts = set(); pg.on('request', lambda r: hosts.add(r.url.split('/')[2]))
    open_app(pg)
    check(hosts <= {'localhost:8765'}, f'third-party requests: {hosts}')
    check(ev(pg, "() => getComputedStyle(document.querySelector('#toast')).display") == 'none', 'hidden toast still on screen')
    fam = ev(pg, "() => getComputedStyle(document.body).fontFamily"); check(fam.startswith('Inter'), fam)
    sign = ev(pg, """() => document.fonts.ready.then(() => ({ title: getComputedStyle(document.querySelector('.page-title')).fontFamily,
      loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/"/g, '')), first: document.querySelector('#view').firstElementChild.className,
      sign: getComputedStyle(document.querySelector('.page-head')).backgroundColor, rule: getComputedStyle(document.querySelector('.head-row')).borderTopWidth,
      label: getComputedStyle(document.querySelector('.board-cols')).textTransform }))""")
    check('Inter' in sign['title'] and 'Inter' in sign['loaded'], f'the Helvetica-style face did not load offline: {sign}')
    check(sign['first'].startswith('page-head') and sign['sign'] == 'rgb(0, 0, 0)' and sign['rule'] == '3px' and sign['label'] == 'uppercase', f'the black sign with its white rule and small-caps labels is missing: {sign}')
    pg.mouse.wheel(0, 600); pg.wait_for_timeout(300)
    check(ev(pg, "() => [document.documentElement.classList.contains('scrolled'), document.querySelector('#topbar').textContent]")[0], 'title bar did not appear')
    pg2 = ctx.browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce').new_page(); open_app(pg2)
    ev(pg2, '() => A.more()'); pg2.wait_for_timeout(50)
    check(ev(pg2, "() => getComputedStyle(document.querySelector('#sheet-root .sheet')).transform") == 'none', 'sheet moved under reduced motion')
    pg2.context.close()

@test('Design', 'Neurath X is used on key text when its files are added, with a clean fallback when not')
def _(pg, ctx):
    import shutil
    fonts = os.path.join(ROOT, 'dist', 'pwa', 'fonts'); target = os.path.join(fonts, 'NeurathX-Bold.woff2')
    open_app(pg)
    fam = ev(pg, "() => [...document.querySelectorAll('.page-title, .lead, .brand')].map(e => getComputedStyle(e).fontFamily.split(',')[0].trim())")
    check(fam and all(f.strip('"') == 'Neurath X' for f in fam), f'key text not set to Neurath X: {set(fam)}')
    check(ev(pg, "() => getComputedStyle(document.querySelector('.item-meta')).fontFamily").startswith('Inter'), 'body text should stay on the Helvetica-style face')
    check(ev(pg, "() => document.fonts.ready.then(() => [...document.fonts].filter(f => f.family.includes('Neurath') && f.status === 'loaded').length)") == 0, 'font loaded without files?')
    os.makedirs(fonts, exist_ok=True)
    shutil.copy('/usr/local/lib/python3.13/dist-packages/mkdocs/themes/readthedocs/css/fonts/lato-bold.woff2', target)  # stand-in file, test only
    try:
        pg2 = ctx.new_page(); open_app(pg2)
        loaded = ev(pg2, "() => document.fonts.load('700 34px \"Neurath X\"').then(() => [...document.fonts].filter(f => f.family.includes('Neurath') && f.weight === '700' && f.status === 'loaded').length)")
        check(loaded == 1, 'Neurath X file in fonts/ was not used')
    finally:
        os.remove(target); shutil.rmtree(fonts, ignore_errors=True)

# =====================================================================
# Quality
# =====================================================================
@test('Quality', 'No dead controls: every button and form on every screen and sheet is wired')
def _(pg, ctx):
    open_app(pg)
    audit = """() => { const v = document;
      const missA = [...v.querySelectorAll('[data-action]')].map(e=>e.dataset.action).filter(a=>!LB.A[a]);
      const missF = [...v.querySelectorAll('form[data-form]')].map(f=>f.dataset.form).filter(f=>!LB.F[f]);
      const dead = [...v.querySelectorAll('button')].filter(b => !b.dataset.action && !b.id && !(b.form && b.type === 'submit')).map(b=>b.outerHTML.slice(0,90));
      const placeholder = /lorem|coming soon|todo|not implemented|placeholder screen/i.test(document.body.innerText);
      return {missA, missF, dead, placeholder}; }"""
    problems = []
    def run(label):
        r = ev(pg, audit)
        if r['missA'] or r['missF'] or r['dead'] or r['placeholder']: problems.append((label, r))
    ev(pg, "() => { skipOpen = Brain.next(data()).task.id; }")
    for name, sub in [('home', ''), ('today', ''), ('lines', ''), ('review', ''), ('calendar', ''), ('brain', ''), ('experiments', ''), ('memory', ''), ('settings', '')] + [('life', s) for s in ['direction', 'areas', 'aims', 'goals', 'projects', 'tasks', 'habits']]:
        go(pg, name, sub); pg.wait_for_timeout(150); run(name + '/' + sub)
    ids = ev(pg, "() => ({task: all('task').find(t=>t.status==='open').id, exp: all('experiment')[0].id, f: Brain.analyze(data()).find(f=>f.hypotheses).id})")
    sheets = ["A.more()", f"A['task-done']({{dataset:{{id:'{ids['task']}'}}}})", f"A['task-drop']({{dataset:{{id:'{ids['task']}'}}}})", f"A.finding({{dataset:{{id:'{ids['f']}'}}}})",
              f"openExperiment('{ids['exp']}')", f"A['exp-finish']({{dataset:{{id:'{ids['exp']}'}}}})", "A['brain-analyze']()", "A['brain-decide']()", "A['brain-suggest']()", "A['brain-ask']()",
              "openClose(addDays(today(), -1))", "openWeek()", "A['line-open']({dataset:{id: all('area')[0].id}})", "lineSheet(get(all('area')[0].id))", "lineSheet(null)", "A['export-text']()", f"firstStepSheet(get('{ids['task']}'))", f"waitingSheet(get('{ids['task']}'))", "goalCheckSheet(all('goal')[0])", "LB.importPreview(validateImport({app:'life-brain',records:[]}))", "LB.importPreview(validateImport({}))", "A['analyze-ai']()"] + [f"editSheet('{t}')" for t in ['area', 'aim', 'goal', 'project', 'task', 'habit', 'event', 'experiment', 'memory']]
    for s in sheets:
        ev(pg, f'() => {{ {s}; }}'); pg.wait_for_timeout(120); run(s); ev(pg, '() => closeSheet()')
    ev(pg, "() => { A['brain-decide'](); }"); pg.fill('#sheet-root [name="question"]', 'Q'); pg.fill('#sheet-root [name="options"]', 'a\nb'); sheet_submit(pg); pg.wait_for_selector('#dec-totals'); run('decision matrix')
    check(not problems, f'{len(problems)} problems: {problems[:3]}')

@test('Quality', 'User text containing HTML is displayed, never executed')
def _(pg, ctx):
    open_app(pg)
    evil = '<img src=x onerror="window.__pwn=1"><script>window.__pwn=2</script>'
    ev(pg, f"""async () => {{ const t = {json.dumps(evil)}; await put({{type:'task', title:t, status:'open', plannedDate:today(), plans:[today()], estimateMin:10}});
      await put({{type:'memory', kind:'lesson', title:t, body:t, date:today()}}); await put({{type:'event', title:t, date:today(), start:'08:00', end:'08:30', location:t}});
      await saveProfile({{direction:t, values:[t]}}); }}""")
    for name, sub in [('home', ''), ('today', ''), ('calendar', ''), ('memory', ''), ('brain', ''), ('life', 'tasks'), ('life', 'direction')]:
        go(pg, name, sub); pg.wait_for_timeout(150)
    ev(pg, "() => A['analyze-ai']()"); pg.wait_for_timeout(150)
    check(ev(pg, '() => window.__pwn') is None, 'injected HTML executed')
    go(pg, 'today'); check('<img src=x' in pg.inner_text('#view'), 'HTML text not displayed literally')

@test('Quality', 'Phone widths 320 and 390 never scroll sideways; desktop uses a sidebar')
def _(pg, ctx):
    open_app(pg); bad = []
    for w in [320, 390]:
        pg.set_viewport_size({'width': w, 'height': 800})
        for name, sub in [('home', ''), ('today', ''), ('lines', ''), ('review', ''), ('calendar', ''), ('brain', ''), ('experiments', ''), ('memory', ''), ('settings', ''), ('life', 'direction'), ('life', 'habits'), ('life', 'tasks')]:
            go(pg, name, sub); pg.wait_for_timeout(120)
            sw = ev(pg, '() => document.documentElement.scrollWidth')
            if sw > w: bad.append(f'{name}/{sub}@{w}={sw}')
        ev(pg, "() => A['brain-decide']()"); pg.fill('#sheet-root [name="question"]', 'Q'); pg.fill('#sheet-root [name="options"]', 'Option one\nOption two\nThree'); sheet_submit(pg); pg.wait_for_timeout(150)
        sw = ev(pg, '() => document.documentElement.scrollWidth')
        if sw > w: bad.append(f'decide@{w}={sw}')
        ev(pg, '() => closeSheet()')
    check(not bad, f'horizontal overflow: {bad}')

@test('Quality', 'Every form field has a label and every button has a name')
def _(pg, ctx):
    open_app(pg); bad = []
    js = """() => { const out = [];
      document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(el => { if (!(el.closest('label') || el.getAttribute('aria-label') || (el.id && document.querySelector('label[for="'+el.id+'"]')))) out.push(el.outerHTML.slice(0,80)); });
      document.querySelectorAll('button').forEach(b => { if (!(b.textContent.trim() || b.getAttribute('aria-label'))) out.push(b.outerHTML.slice(0,80)); }); return out; }"""
    for name, sub in [('home', ''), ('today', ''), ('lines', ''), ('review', ''), ('brain', ''), ('settings', ''), ('life', 'direction'), ('life', 'habits'), ('memory', '')]:
        go(pg, name, sub); pg.wait_for_timeout(100); bad += ev(pg, js)
    for t in ['task', 'event', 'experiment']:
        ev(pg, f"() => editSheet('{t}')"); bad += ev(pg, js); ev(pg, '() => closeSheet()')
    check(not bad, f'unlabelled: {bad[:4]}')

@test('Quality', 'Claude-hosted build boots in a viewer-like page without a service worker or errors')
def _(pg, ctx):
    open_app(pg, base=ART)
    check(ev(pg, '() => [LB.swState, !!window.LB_PWA]') == ['none', False], 'artifact tried to use a service worker')
    check(ev(pg, '() => S.records.size') > 0, 'artifact build has no example data')
    for to in ['today', 'calendar', 'brain', 'settings']: go(pg, to)

# =====================================================================
def main():
    serve(partial(Quiet, directory=os.path.join(ROOT, 'dist', 'pwa')), 8765) if '--no-serve' not in sys.argv else None
    art_dir = tempfile.mkdtemp()
    body = open(os.path.join(ROOT, 'dist', 'artifact', 'index.html')).read()
    open(os.path.join(art_dir, 'index.html'), 'w').write('<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + body + '</body></html>')
    serve(partial(Quiet, directory=art_dir), 8766)
    serve(MockAI, 8799)
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for cat, name, fn, opts in TESTS:
            if only and not any(o.lower() in (cat + ' ' + name).lower() for o in only): continue
            ctx = browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True, service_workers='allow')
            pg = ctx.new_page(); errors = []
            pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
            pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
            t0 = time.time()
            try:
                fn(pg, ctx)
                if errors and not opts.get('allow_console'): raise AssertionError('console error: ' + errors[0])
                status, detail = 'PASSED', ''
            except Blocked as b: status, detail = 'BLOCKED BY ENVIRONMENT', str(b)
            except Exception as e: status, detail = 'FAILED', f'{type(e).__name__}: {str(e)[:400]}'
            RESULTS.append((cat, name, status, detail, time.time() - t0))
            print(f'[{status}] {cat}: {name} ({time.time()-t0:.1f}s){"  -> " + detail if detail else ""}', flush=True)
            ctx.close()
        browser.close()
    passed = sum(1 for r in RESULTS if r[2] == 'PASSED')
    print(f'\n{passed}/{len(RESULTS)} passed')
    json.dump([dict(zip(['category', 'name', 'status', 'detail', 'seconds'], r)) for r in RESULTS], open(os.path.join(ROOT, 'tests', 'results.json'), 'w'), indent=1)
    sys.exit(0 if passed == len(RESULTS) else 1)

if __name__ == '__main__':
    main()
