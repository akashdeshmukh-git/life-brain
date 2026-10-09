"""Life Brain test suite (Playwright, Chromium). Run: python3 tests/run.py [filter]
Serves dist/pwa on :8765 and a mock AI service on :8799."""
import json, os, sys, threading, time, traceback
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler, BaseHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'http://localhost:8765'
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

def open_app(pg, h='today'):
    pg.goto(BASE + '/' + ('#' + h if h else ''))
    pg.wait_for_selector('html[data-ready="1"]', state='attached', timeout=15000)

def ev(pg, js, arg=None): return pg.evaluate(js, arg)
def go(pg, name, sub=''): ev(pg, f"() => LB.go('{name}', '{sub}')"); pg.wait_for_timeout(100)
def T(pg): return ev(pg, '() => today()')
def add_days(pg, n): return ev(pg, f'() => addDays(today(), {n})')
def check(cond, msg):
    if not cond: raise AssertionError(msg)
def sheet_closed(pg): pg.wait_for_selector('#sheet-root .sheet', state='detached', timeout=4000)
def count(pg, sel): return pg.locator(sel).count()
def add_task(pg, title, box='#add-today'):
    pg.fill(box, title); pg.press(box, 'Enter'); pg.wait_for_timeout(120)
def recs(pg, type_): return ev(pg, f"() => all('{type_}')")
def reload(pg): pg.reload(); pg.wait_for_selector('html[data-ready="1"]', state='attached')
def ai_setup(pg, kind='ok', key='sk-test-123'):
    ev(pg, f"""async () => {{ S.aiKeys = {{ openai: '{key}' }}; await saveSettings({{ ai: {{ active: 'openai', linked: ['openai'], baseUrls: {{ openai: '{AI_BASE}/{kind}/v1' }}, models: {{ openai: 'test-model' }}, timeoutSec: 5 }} }}); }}""")

# =====================================================================
@test('Start', 'Opens on Home: five tabs, no errors, no example data, a calm empty brief')
def _(pg, ctx):
    open_app(pg, '')
    tabs = pg.locator('.tab').all_inner_texts()
    check([t.strip() for t in tabs] == ['Home', 'Today', 'Calendar', 'Notes', 'Progress'], f'tabs {tabs}')
    check(ev(pg, '() => LB.route.name') == 'home', 'should start on Home')
    check(ev(pg, '() => S.records.size') == 0, 'records exist on a fresh start')
    check(pg.inner_text('.headline').startswith('The whole day is yours'), pg.inner_text('.headline'))
    check('Nothing needs you' in pg.inner_text('.brief-bottom'), 'calm line missing')
    check(count(pg, '.terrain .ridge') == 1 and count(pg, '.terrain .now') <= 1, 'drawing')
    check('Fraunces' in ev(pg, "() => getComputedStyle(document.querySelector('.headline')).fontFamily") and ev(pg, '() => document.fonts.check("600 30px Fraunces")'), 'serif headline font')

@test('Start', 'Today still works as before')
def _(pg, ctx):
    open_app(pg)
    check(pg.locator('.top h1').inner_text() == 'Today' and count(pg, '#add-today') == 1, 'today')
    check('Nothing for today' in pg.inner_text('main'), 'empty hint missing')

@test('Home', 'Brief: headline with your name, the day as a line with one dot per event, three acts, what needs you and what is done')
def _(pg, ctx):
    open_app(pg, '')
    ev(pg, """async () => { const t = today(), y = addDays(t,-1);
      await saveSettings({name:'Akash'});
      await put({type:'event', title:'Standup', date:t, time:'09:30', end:'10:00'});
      await put({type:'event', title:'Lunch', date:t, time:'13:00', end:'14:30'});
      await put({type:'event', title:'Supervisor call', date:addDays(t,1), time:'11:00', note:'Bring plots'});
      await put({type:'task', title:'Old reply', date:addDays(t,-2), done:false, moved:3});
      await put({type:'task', title:'Chapter 3', date:t, done:false});
      await put({type:'task', title:'Done thing', date:y, done:true, doneDate:y});
      const log={}; for (let i=1;i<=4;i++) log[addDays(t,-i)]=true; await put({type:'habit', title:'Walk', log});
      await put({id:journalId(y), type:'journal', date:y, text:'Good one', mood:4});
      const d=new Date(); d.setHours(15,0,0,0); LB.now=()=>new Date(d); LB.render(); }""")
    pg.wait_for_timeout(150)
    h = pg.inner_text('.headline')
    check('Akash' in h and 'Two things on the calendar' in h, h)
    check(count(pg, '.terrain .dot, .terrain .hollow') == 2, 'one dot per timed event')
    acts = pg.locator('.act').all_inner_texts()
    check(len(acts) == 3 and 'Standup at 9:30' in acts[0] and 'Lunch at 1:00' in acts[1], acts)
    check(count(pg, '.act.past') == 1, 'the morning has passed at 3 PM')
    need = pg.inner_text('.blist.need')
    for want in ['Old reply', 'Was due', 'moved 3 times', 'Chapter 3', 'Supervisor call', 'Tomorrow at 11', 'Bring plots', 'Walk', '4-day streak']:
        check(want in need, f'needs attention missing {want}:\n{need}')
    done = pg.inner_text('.blist.done')
    check('1 task done yesterday' in done and '“Done thing”' in done and 'Yesterday’s journal' in done and 'kept yesterday' in done, done)
    check('moved 4' not in pg.inner_text('.brief') and count(pg, '.blist.know') == 0, 'pattern repeated an item already listed')
    pg.click('.bi-title:has-text("Old reply")'); pg.wait_for_selector('.sheet input[name=title]')
    check(pg.input_value('.sheet input[name=title]') == 'Old reply', 'title should open the task')

@test('Home', 'A full day reads as a climb; events can have an end time')
def _(pg, ctx):
    open_app(pg, 'calendar')
    pg.click('.agenda [data-action=event-new]'); pg.fill('.sheet input[name=title]', 'Workshop'); pg.fill('.sheet input[name=time]', '09:00'); pg.fill('.sheet input[name=end]', '12:30')
    pg.click('.sheet .btn.primary'); sheet_closed(pg)
    check(recs(pg, 'event')[0]['end'] == '12:30', 'end time not saved')
    ev(pg, "async () => { for (const [a,b] of [['13:00','14:00'],['14:30','15:30'],['16:00','17:00']]) await put({type:'event', title:'M'+a, date:today(), time:a, end:b}); }")
    go(pg, 'home')
    check('steady climb until 5:00 PM' in pg.inner_text('.headline'), pg.inner_text('.headline'))

@test('Tasks', 'Add, tick, undo and see done tasks fold away')
def _(pg, ctx):
    open_app(pg)
    for t in ['Buy milk', 'Call mom']: add_task(pg, t)
    check(count(pg, '.task') == 2, 'two tasks')
    check(pg.eval_on_selector('#add-today', 'e => e.value') == '' and ev(pg, '() => document.activeElement.id') == 'add-today', 'add box cleared and still focused')
    pg.click('.task:has-text("Buy milk") .circle'); pg.wait_for_timeout(150)
    x = [r for r in recs(pg, 'task') if r['title'] == 'Buy milk'][0]
    check(x['done'] and x['doneDate'] == T(pg), 'not marked done today')
    check(count(pg, '.task') == 1 and 'Done' in pg.inner_text('.fold'), 'done task should fold away')
    pg.click('#toast-action'); pg.wait_for_timeout(150)
    check(not [r for r in recs(pg, 'task') if r['title'] == 'Buy milk'][0]['done'], 'undo failed')
    check(count(pg, '.task') == 2, 'undo did not bring it back')

@test('Tasks', 'Edit a task: rename, note, push to tomorrow (counted as moved), delete with undo')
def _(pg, ctx):
    open_app(pg)
    add_task(pg, 'Write report')
    pg.click('.task-main'); pg.wait_for_selector('.sheet input[name=title]')
    pg.fill('.sheet input[name=title]', 'Write the report'); pg.fill('.sheet textarea[name=note]', 'Two pages')
    pg.click('.chip:has-text("Tomorrow")'); pg.click('.sheet .btn.primary'); sheet_closed(pg)
    x = recs(pg, 'task')[0]
    check(x['title'] == 'Write the report' and x['note'] == 'Two pages' and x['date'] == add_days(pg, 1), f'bad save {x}')
    check(x['moved'] == 1, f'moving a due task later should count: {x["moved"]}')
    check(count(pg, '.task') == 0, 'tomorrow task still on Today')
    go(pg, 'calendar', add_days(pg, 1))
    check('Write the report' in pg.inner_text('.agenda'), 'not on tomorrow in calendar')
    pg.click('.agenda .task-main'); pg.wait_for_selector('.sheet [data-action=delete]')
    pg.click('.sheet [data-action=delete]'); pg.wait_for_timeout(200)
    check(len(recs(pg, 'task')) == 0, 'not deleted')
    pg.click('#toast-action'); pg.wait_for_timeout(200)
    check(len(recs(pg, 'task')) == 1, 'undo delete failed')

@test('Tasks', 'Overdue tasks show their date and move to today in one tap; "Anytime" holds undated tasks')
def _(pg, ctx):
    open_app(pg)
    ev(pg, "async () => { await put({type:'task', title:'Old thing', date: addDays(today(), -3), done:false, moved:0}); await put({type:'task', title:'Someday thing', date:'', done:false}); }")
    pg.wait_for_timeout(150)
    txt = pg.inner_text('main')
    check('1 overdue task' in txt and 'Someday thing' in txt and 'Anytime' in txt, txt[:400])
    pg.click('[data-action=overdue-today]'); pg.wait_for_timeout(200)
    x = [r for r in recs(pg, 'task') if r['title'] == 'Old thing'][0]
    check(x['date'] == T(pg) and x['moved'] == 1, f'{x}')
    check('overdue' not in pg.inner_text('main'), 'still overdue')

@test('Habits', 'Add a habit, tick it, streak counts and shows in Progress')
def _(pg, ctx):
    open_app(pg)
    pg.click('[data-action=habit-new]'); pg.fill('.sheet input[name=title]', 'Walk'); pg.click('.sheet .btn.primary'); sheet_closed(pg)
    ev(pg, "async () => { const h = all('habit')[0]; await put({...h, log: {[addDays(today(),-1)]: true, [addDays(today(),-2)]: true}}); }")
    pg.wait_for_timeout(100)
    pg.click('.habit[data-id]'); pg.wait_for_timeout(150)
    check(pg.get_attribute('.habit[data-id]', 'aria-pressed') == 'true', 'not ticked')
    check(pg.inner_text('.habit[data-id] .streak') == '3', 'streak should be 3')
    go(pg, 'progress')
    check('3 days streak' in pg.inner_text('.hrow'), pg.inner_text('.hrow'))
    check(count(pg, '.h28 i') == 28 and count(pg, '.h28 i.on') == 3, '28-day grid wrong')
    pg.click('.hrow'); pg.fill('.sheet input[name=title]', 'Walk 20 min'); pg.click('.sheet .btn.primary'); sheet_closed(pg)
    check(recs(pg, 'habit')[0]['title'] == 'Walk 20 min', 'rename failed')

@test('Journal', 'Mood and text save as you type and survive a reload')
def _(pg, ctx):
    open_app(pg)
    t = T(pg)
    pg.click('.mood[data-v="4"]'); pg.wait_for_timeout(100)
    pg.type(f'#journal-{t}', 'Calm day.'); pg.wait_for_timeout(200)
    check(ev(pg, '() => document.activeElement.id') == f'journal-{t}', 'lost focus while typing')
    reload(pg)
    check(pg.eval_on_selector(f'#journal-{t}', 'e => e.value') == 'Calm day.', 'text lost')
    check(pg.get_attribute('.mood[data-v="4"]', 'aria-checked') == 'true', 'mood lost')
    go(pg, 'notes', 'journal')
    check('Calm day.' in pg.inner_text('.jlist') and '🙂' in pg.inner_text('.jlist'), 'journal list')
    pg.click('.jentry'); pg.wait_for_selector('#journal-sheet')
    pg.fill('#journal-sheet', 'Calm day. Long walk.'); pg.wait_for_timeout(100)
    pg.click('.sheet .btn.primary'); sheet_closed(pg)
    check('Long walk' in pg.inner_text('.jlist'), 'edit in sheet not shown after close')

@test('Calendar', 'Month grid, pick a day, add a task and an event there, dots appear, month arrows work')
def _(pg, ctx):
    open_app(pg, 'calendar')
    check(count(pg, '.day') in (35, 42, 28), f'cells {count(pg, ".day")}')
    check(count(pg, '.day.today') == 1, 'today not marked')
    d = add_days(pg, 2)
    pg.click(f'.day[data-date="{d}"]'); pg.wait_for_timeout(120)
    check(pg.get_attribute(f'.day[data-date="{d}"]', 'aria-pressed') == 'true', 'not selected')
    add_task(pg, 'Dentist prep', '#add-cal')
    t = [r for r in recs(pg, 'task') if r['title'] == 'Dentist prep'][0]
    check(t['date'] == d, 'task not on picked day')
    pg.click('.agenda [data-action=event-new]'); pg.fill('.sheet input[name=title]', 'Dentist'); pg.fill('.sheet input[name=time]', '15:30')
    pg.click('.sheet .btn.primary'); sheet_closed(pg)
    e = recs(pg, 'event')[0]
    check(e['date'] == d and e['time'] == '15:30', f'{e}')
    check(count(pg, f'.day[data-date="{d}"] .dot.ev') == 1 and count(pg, f'.day[data-date="{d}"] .dot.task') == 1, 'dots missing')
    check('Dentist' in pg.inner_text('.agenda .event'), 'event not in agenda')
    title = pg.inner_text('.top h1')
    pg.click('[aria-label="Next month"]'); pg.wait_for_timeout(120)
    check(pg.inner_text('.top h1') != title and count(pg, '.pill:has-text("Today")') == 1, 'next month')
    pg.click('.pill:has-text("Today")'); pg.wait_for_timeout(120)
    check(pg.inner_text('.top h1') == title, 'back to today')

@test('Calendar', "Today's events show on Today")
def _(pg, ctx):
    open_app(pg)
    ev(pg, "() => put({type:'event', title:'Standup', date: today(), time:'09:30', note:''})"); pg.wait_for_timeout(120)
    check('Standup' in pg.inner_text('.event'), 'event missing on Today')

@test('Notes', 'Write, search, pin and delete notes; an empty new note is not saved')
def _(pg, ctx):
    open_app(pg, 'notes')
    pg.click('.fab'); pg.wait_for_selector('#note-title'); pg.click('.sheet .btn.primary'); sheet_closed(pg)
    check(len(recs(pg, 'note')) == 0, 'empty note saved')
    pg.click('.fab'); pg.fill('#note-title', 'Groceries'); pg.fill('#note-body', 'eggs\nbread'); pg.click('.sheet .btn.primary'); sheet_closed(pg)
    pg.click('.fab'); pg.fill('#note-body', 'Paper idea: fractal'); pg.click('#note-pin'); pg.click('.sheet .btn.primary'); sheet_closed(pg)
    n = recs(pg, 'note')
    check(len(n) == 2, f'{len(n)} notes')
    check('pinned' in pg.inner_text('main').lower(), 'pinned section missing')
    check(pg.locator('.notes').first.inner_text().startswith('Paper idea'), 'pinned not first')
    pg.fill('#notes-q', 'egg'); pg.wait_for_timeout(120)
    check(count(pg, '.note') == 1 and 'Groceries' in pg.inner_text('.note'), 'search')
    check(ev(pg, '() => document.activeElement.id') == 'notes-q', 'search lost focus')
    pg.click('.note'); pg.click('#note-del'); pg.wait_for_timeout(200)
    check(len(recs(pg, 'note')) == 1, 'delete failed')

@test('Goals', 'Add a goal, +1, correct the count, reach it')
def _(pg, ctx):
    open_app(pg, 'progress')
    pg.click('[data-action=goal-new]'); pg.fill('.sheet input[name=title]', 'Read books'); pg.fill('.sheet input[name=target]', '3'); pg.fill('.sheet input[name=unit]', 'books')
    pg.click('.sheet .btn.primary'); sheet_closed(pg)
    pg.click('[data-action=goal-inc]'); pg.wait_for_timeout(120)
    check('1 / 3 books' in pg.inner_text('.goal'), pg.inner_text('.goal'))
    pg.click('.goal-main'); pg.fill('.sheet input[name=now]', '2'); pg.click('.sheet .btn.primary'); sheet_closed(pg)
    check('2 / 3 books' in pg.inner_text('.goal'), 'correction')
    pg.click('[data-action=goal-inc]'); pg.wait_for_timeout(150)
    check('Goal reached' in pg.inner_text('#toast') and count(pg, '.goal.done') == 1, 'goal reached')

@test('Progress', 'Week numbers: tasks done, habits only counted since they were added, journal days, mood')
def _(pg, ctx):
    open_app(pg)
    ev(pg, """async () => { const t = today();
      for (const i of [0, 0, -2]) await put({type:'task', title:'x'+i, date:addDays(t,i), done:true, doneDate:addDays(t,i)});
      await put({type:'habit', title:'New one', log:{[t]:true}});
      await put({id:journalId(t), type:'journal', date:t, text:'ok', mood:5}); }""")
    go(pg, 'progress')
    s = pg.locator('.stat b').all_inner_texts()
    check(s[0] == '3' and s[1] == '100%' and s[2] == '1/7' and s[3] == '😄', f'stats {s}')

@test('Patterns', 'Finds mood-with-habit, a slipped habit, a task moved again and again, and the overdue pile')
def _(pg, ctx):
    open_app(pg)
    ev(pg, """async () => { const t = today(), log = {}, slip = {};
      for (let i = 1; i <= 12; i++) { const d = addDays(t, -i); const on = i % 2 === 0; if (on) log[d] = true;
        await put({id: journalId(d), type:'journal', date:d, text:'', mood: on ? 5 : 2}); }
      for (const i of [8, 9, 10, 11, 12]) slip[addDays(t, -i)] = true;
      await put({type:'habit', title:'Run', log}); await put({type:'habit', title:'Stretch', log: slip});
      await put({type:'task', title:'Tax forms', date: t, done:false, moved: 4});
      for (let i = 0; i < 5; i++) await put({type:'task', title:'Late '+i, date:addDays(t,-2), done:false}); }""")
    go(pg, 'progress')
    txt = pg.inner_text('.pats')
    for want in ['mood is better on days you do “Run”', '“Stretch” slipped', '“Tax forms” has been moved 4 times']:
        check(want in txt, f'missing: {want}\n{txt}')
    p = ev(pg, '() => LB.patterns().map(x => x.id)')
    check(len(p) <= 4, 'too many patterns shown')

@test('Patterns', 'Says nothing when there is too little data')
def _(pg, ctx):
    open_app(pg)
    add_task(pg, 'One thing')
    check(ev(pg, '() => LB.patterns().length') == 0, 'patterns from no data')

@test('AI', 'Preview shows exactly what is sent; notes are off by default; answer is rendered safely and can be saved')
def _(pg, ctx):
    open_app(pg)
    add_task(pg, 'Visible task')
    ev(pg, "() => put({type:'note', title:'Secret note', body:'private', pinned:false})")
    ai_setup(pg)
    go(pg, 'progress'); pg.click('[data-action=ask-ai]'); pg.wait_for_selector('#ai-preview', state='attached')
    prev = pg.eval_on_selector('#ai-preview', 'e => e.textContent')
    check('Visible task' in prev and 'Secret note' not in prev, 'preview content wrong')
    check(not pg.is_checked('[data-scope=notes]'), 'notes should start unchecked')
    AI_LOG.clear()
    pg.click('#ai-send'); pg.wait_for_selector('#ai-answer, #ai-error', timeout=10000)
    check(count(pg, '#ai-answer') == 1, pg.inner_text('#ai-result'))
    sent = [l for l in AI_LOG if l['method'] == 'POST'][0]
    user = sent['body']['messages'][1]['content']
    check(user in prev and 'Secret note' not in user, 'sent text differs from preview')
    check(sent['auth'] == 'Bearer sk-test-123', 'auth header')
    check(not ev(pg, '() => window.__xss2 || window.__xss3'), 'XSS ran')
    check(count(pg, '#ai-answer strong') >= 1, 'markdown not rendered')
    pg.click('#ai-save'); pg.wait_for_timeout(200)
    check(any(n['title'].startswith('AI:') for n in recs(pg, 'note')), 'not saved as note')

@test('AI', 'Without a key, Ask AI goes to Settings → AI; a bad key shows a plain error')
def _(pg, ctx):
    open_app(pg, 'progress')
    pg.click('[data-action=ask-ai]'); pg.wait_for_timeout(200)
    check(ev(pg, '() => LB.route.name') == 'settings' and count(pg, '#f-aikey') == 1, 'not sent to settings')
    ai_setup(pg, 'auth')
    ev(pg, '() => LB.askAI()'); pg.wait_for_selector('#ai-send'); pg.click('#ai-send')
    pg.wait_for_selector('#ai-error', timeout=10000)
    check('rejected the API key' in pg.inner_text('#ai-error'), pg.inner_text('#ai-error'))

@test('AI', 'Paste a key: the service is recognised, checked, and a model chosen')
def _(pg, ctx):
    open_app(pg, 'settings')
    pg.fill('#f-aikey', 'sk-or-v1-abc'); pg.wait_for_timeout(50)
    check('OpenRouter' in pg.inner_text('#ai-detect'), 'not recognised')
    pg.click('summary:has-text("Service and address")')
    pg.fill('input[name=base]', f'{AI_BASE}/openrouter/v1')
    pg.click('form[data-form=ai-connect] .btn.primary'); pg.wait_for_selector('.conn', timeout=8000)
    check(ev(pg, '() => AI.provider()') == 'openrouter' and ev(pg, "() => S.settings.ai.models.openrouter") == 'openrouter/auto', 'not connected')
    check(ev(pg, '() => JSON.stringify(exportData())').find('sk-or-v1-abc') < 0, 'key leaked into backup')

@test('Data', 'Export then import (add and replace) round-trips everything')
def _(pg, ctx):
    open_app(pg)
    add_task(pg, 'Keep me')
    ev(pg, "() => put({type:'note', title:'N', body:'b'})")
    data = ev(pg, '() => exportData()')
    check(data['version'] == 2 and len(data['records']) == 2, 'export')
    go(pg, 'settings')
    with pg.expect_download() as d: pg.click('[data-action=export]')
    path = d.value.path()
    ev(pg, '() => deleteEverything()'); pg.wait_for_timeout(100)
    go(pg, 'settings')
    pg.set_input_files('#import-file', path); pg.wait_for_selector('[data-action=import-go]')
    check('1 tasks' in pg.inner_text('.sheet') or '1 task' in pg.inner_text('.sheet'), pg.inner_text('.sheet'))
    pg.click('[data-action=import-go][data-mode=merge]'); pg.wait_for_timeout(300)
    check(ev(pg, '() => S.records.size') == 2, 'import failed')

@test('Data', 'An old-version backup is converted: real items come in, example items stay out')
def _(pg, ctx):
    open_app(pg)
    old = {'app': 'life-brain', 'version': 1, 'profile': {'direction': 'Do good work', 'ex': False}, 'records': [
        {'id': 't1', 'type': 'task', 'title': 'Real task', 'status': 'open', 'plannedDate': '2026-10-09'},
        {'id': 't2', 'type': 'task', 'title': 'Example task', 'status': 'open', 'ex': True},
        {'id': 't3', 'type': 'task', 'title': 'Dropped', 'status': 'abandoned'},
        {'id': 'h1', 'type': 'habit', 'emoji': '🚶', 'title': 'Walk', 'log': {'2026-10-08': True}},
        {'id': 'm1', 'type': 'memory', 'kind': 'lesson', 'title': 'Lesson', 'body': 'Small steps'},
        {'id': 'd1', 'type': 'day', 'date': '2026-10-08', 'note': 'Tired but ok'},
        {'id': 'e1', 'type': 'event', 'title': 'Talk', 'date': '2026-10-12', 'start': '18:00'},
        {'id': 'x1', 'type': 'experiment', 'title': 'Ignored'}]}
    v = ev(pg, '(o) => validateImport(o)', old)
    check(v['ok'], v['errors'])
    titles = sorted((r.get('title') or r.get('text') or '') for r in v['records'])
    check(titles == sorted(['Real task', '🚶 Walk', 'Lesson', 'Tired but ok', 'Talk', 'My direction']), titles)

@test('Data', 'First start brings over data from the earlier Life Brain once, skipping examples, and leaves the old data untouched')
def _(pg, ctx):
    pg.goto(BASE + '/manifest.webmanifest')
    ev(pg, """() => new Promise((res, rej) => { const r = indexedDB.open('lifebrain', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('records', {keyPath:'id'}); d.createObjectStore('meta', {keyPath:'key'}); d.createObjectStore('snapshots', {keyPath:'id'}); };
      r.onsuccess = () => { const d = r.result, t = d.transaction(['records','meta'], 'readwrite');
        t.objectStore('records').put({id:'a', type:'task', title:'My real task', status:'open', plannedDate:''});
        t.objectStore('records').put({id:'b', type:'task', title:'Example', status:'open', ex:true});
        t.objectStore('records').put({id:'c', type:'habit', title:'Read', log:{}});
        t.objectStore('meta').put({key:'settings', value:{mode:'black', accent:'yellow', ai:{}}});
        t.oncomplete = () => { d.close(); res(); }; t.onerror = () => rej(t.error); }; })""")
    open_app(pg)
    check(sorted(r['title'] for r in ev(pg, '() => [...S.records.values()]')) == ['My real task', 'Read'], 'migration content')
    check(ev(pg, '() => S.settings.theme') == 'dark', 'theme not carried over')
    check('Brought over 2 items' in pg.inner_text('#toast'), 'no toast')
    check('My real task' in pg.inner_text('main'), 'not shown in Anytime')
    ev(pg, '() => deleteEverything()'); reload(pg)
    check(ev(pg, '() => S.records.size') == 0, 'old data came back after Delete everything')
    n = ev(pg, """() => new Promise(res => { const r = indexedDB.open('lifebrain'); r.onsuccess = () => { const t = r.result.transaction('records'); const q = t.objectStore('records').count(); q.onsuccess = () => res(q.result); }; })""")
    check(n == 3, f'old database changed: {n}')

@test('Data', 'Delete everything needs DELETE typed, then clears all')
def _(pg, ctx):
    open_app(pg)
    add_task(pg, 'x')
    go(pg, 'settings'); pg.click('[data-action=wipe]'); pg.wait_for_selector('.sheet input[name=confirm]')
    pg.click('.sheet .btn.danger.solid'); pg.wait_for_timeout(100)
    check('Type DELETE' in pg.inner_text('.sheet .err'), 'should demand DELETE')
    pg.fill('.sheet input[name=confirm]', 'DELETE'); pg.click('.sheet .btn.danger.solid'); pg.wait_for_timeout(300)
    check(ev(pg, '() => S.records.size') == 0, 'not cleared')

@test('Look', 'Dark is true black; theme and colour switch from Settings and persist')
def _(pg, ctx):
    open_app(pg, 'settings')
    pg.click('[data-action=set-theme][data-v=dark]'); pg.wait_for_timeout(100)
    check(ev(pg, '() => getComputedStyle(document.body).backgroundColor') == 'rgb(0, 0, 0)', 'not true black')
    pg.click('[data-action=set-accent][data-v=green]'); pg.wait_for_timeout(100)
    reload(pg)
    check(ev(pg, '() => document.documentElement.dataset.theme') == 'dark' and ev(pg, "() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()") == '#81c995', 'not persisted')
    pg.click('[data-action=set-theme][data-v=light]'); pg.wait_for_timeout(100)
    check(ev(pg, '() => getComputedStyle(document.body).backgroundColor') == 'rgb(255, 255, 255)', 'light')

@test('Look', 'Fits a small phone (360px) on every screen with no sideways scrolling; uses Inter')
def _(pg, ctx):
    pg.set_viewport_size({'width': 360, 'height': 740})
    open_app(pg)
    ev(pg, "async () => { await put({type:'task', title:'A very long task title that goes on and on and on to test wrapping across the line', date: today(), done:false}); await put({type:'habit', title:'Meditate for ten minutes', log:{}}); await put({type:'goal', title:'Run a long distance goal', target: 100, unit:'kilometres', log:{}}); }")
    for v in ['home', 'today', 'calendar', 'notes', 'notes-journal', 'progress', 'settings']:
        n, s = (v.split('-') + [''])[:2]
        go(pg, n, s)
        w = ev(pg, '() => document.documentElement.scrollWidth')
        check(w <= 360, f'{v} overflows: {w}')
    check('Inter' in ev(pg, '() => getComputedStyle(document.body).fontFamily'), 'font')
    check(ev(pg, '() => document.fonts.check("16px Inter")'), 'Inter not loaded')

@test('Offline', 'Installs a service worker and opens with no network')
def _(pg, ctx):
    open_app(pg)
    add_task(pg, 'Offline task')
    pg.wait_for_selector('html[data-sw="ready"]', state='attached', timeout=10000)
    pg.reload(); pg.wait_for_selector('html[data-ready="1"]', state='attached')  # let the worker control the page
    ctx.set_offline(True)
    try:
        pg.reload(); pg.wait_for_selector('html[data-ready="1"]', state='attached', timeout=10000)
        check('Offline task' in pg.inner_text('main'), 'data missing offline')
    finally: ctx.set_offline(False)

@test('Safety', 'Titles with HTML are shown as text, not run')
def _(pg, ctx):
    open_app(pg)
    add_task(pg, '<img src=x onerror="window.__x=1">')
    ev(pg, """() => put({type:'note', title:'<b>t</b>', body:'<script>window.__y=1</script>'})""")
    for v in ['home', 'today', 'calendar', 'notes', 'progress']: go(pg, v)
    check(not ev(pg, '() => window.__x || window.__y'), 'HTML ran')

# ---------- runner ----------
def serve(handler, port):
    s = ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s

def main():
    serve(partial(Quiet, directory=os.path.join(ROOT, 'dist', 'pwa')), 8765)
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
    if not only: json.dump([dict(zip(['category', 'name', 'status', 'detail', 'seconds'], r)) for r in RESULTS], open(os.path.join(ROOT, 'tests', 'results.json'), 'w'), indent=1)
    sys.exit(0 if passed == len(RESULTS) else 1)

if __name__ == '__main__':
    main()
