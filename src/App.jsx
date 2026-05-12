import { useState, useEffect, useCallback, useRef } from 'react';

// In the packaged app the page loads from file:// so relative fetch('/api/...')
// fails. Detect and use the full server URL instead.
const API = window.location.protocol === 'file:' ? 'http://localhost:3001' : '';

// ── Date helpers ─────────────────────────────────────────────
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate()+1); return localDateStr(d); }
function todayStr()    { return localDateStr(new Date()); }

// ── Schedule helpers ─────────────────────────────────────────
function nonRoundMinute() {
  const pool = [];
  for (let i = 0; i < 60; i++) if (i % 5 !== 0) pool.push(i);
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildSchedule(n, winStart = 180, winEnd = 1410) {
  // winStart / winEnd are minutes from midnight (e.g. 180 = 03:00)
  const maxOffset = Math.min(20, Math.floor((winEnd - winStart) * 0.03));
  let start = winStart + (maxOffset > 0 ? Math.floor(Math.random() * maxOffset) : 0);
  if (start % 5 === 0) start += 1 + Math.floor(Math.random() * 4);
  start = Math.min(start, winEnd - 1);

  if (n === 1) return { times: [start] };

  const totalSpan = winEnd - start;
  const weights   = Array.from({ length: n - 1 }, () => 0.5 + Math.random());
  const wSum      = weights.reduce((a, b) => a + b, 0);
  const gaps      = weights.map(w => (w / wSum) * totalSpan);

  const times = [start];
  let cursor  = start;

  for (let i = 0; i < n - 1; i++) {
    cursor += gaps[i];
    let t = Math.round(cursor);
    if (t % 60 % 5 === 0) t += 1 + Math.floor(Math.random() * 4);
    const prev = times[times.length - 1];
    if (t <= prev) t = prev + 1;
    t = Math.min(t, winEnd);
    times.push(t);
    cursor = t;
  }

  return { times };
}

// ── Formatting ───────────────────────────────────────────────
function fmt12(m) {
  const h = Math.floor(m / 60), mn = m % 60;
  const p = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2,'0')}:${String(mn).padStart(2,'0')} ${p}`;
}
function fmt24(m) {
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
}

function parsePosts(raw) {
  return raw.split(/^---$/m).map(s => s.trim()).filter(Boolean);
}

// ── Clipboard ────────────────────────────────────────────────
async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = Object.assign(document.createElement('textarea'), { value: text, style: 'position:fixed;opacity:0' });
    document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t);
  }
}

// ── Icons ────────────────────────────────────────────────────
const XIcon = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);
const RegenIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
  </svg>
);

// ── CopyButton ───────────────────────────────────────────────
function CopyButton({ text, label = 'Copy text', className = 'btn-copy' }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button className={`${className}${copied ? ' copied' : ''}`} onClick={handle}>
      {copied ? '✓ Copied' : label}
    </button>
  );
}

// ── Toggle ───────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <button className={`toggle-switch${value ? ' on' : ''}`} onClick={() => onChange(!value)}>
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      <span className="toggle-val">{value ? 'On' : 'Off'}</span>
    </button>
  );
}

// ── Dual Range Slider ────────────────────────────────────────
function DualRangeSlider({ start, end, onChange }) {
  const MIN = 0, MAX = 1440, STEP = 15, MIN_GAP = 60;
  const startPct = (start / MAX) * 100;
  const endPct   = (end   / MAX) * 100;

  return (
    <div className="dslider">
      <div className="dslider-track">
        <div className="dslider-fill" style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }} />
      </div>

      <input type="range" className="dslider-input"
        min={MIN} max={MAX - MIN_GAP} step={STEP} value={start}
        style={{ zIndex: start > MAX * 0.9 ? 5 : 3 }}
        onChange={e => onChange(Math.min(+e.target.value, end - MIN_GAP), end)}
      />
      <input type="range" className="dslider-input"
        min={MIN + MIN_GAP} max={MAX} step={STEP} value={end}
        style={{ zIndex: 4 }}
        onChange={e => onChange(start, Math.max(+e.target.value, start + MIN_GAP))}
      />

      <div className="dslider-labels">
        <div className="dslider-label" style={{ left: `${startPct}%` }}>{fmt12(start)}</div>
        <div className="dslider-label" style={{ left: `${endPct}%`   }}>{fmt12(end)}</div>
      </div>
    </div>
  );
}

// ── StatusChip ───────────────────────────────────────────────
function StatusChip({ status }) {
  if (!status || status === 'idle') return null;
  const labels = { scheduling: 'Scheduling…', done: '✓ Scheduled', error: '✗ Error' };
  return (
    <span className={`status-chip ${status}`}>
      {status === 'scheduling' && <span className="spinner" />}
      {labels[status]}
    </span>
  );
}

// ── PostCard ─────────────────────────────────────────────────
function PostCard({ post, time, index, total, status, errorMsg, animDelay }) {
  const chars  = post.length;
  const isOver = chars > 280;
  const isWarn = chars > 240 && !isOver;
  const barClr = isOver ? '#ef4444' : isWarn ? '#f59e0b' : '#1d9bf0';
  const pct    = Math.min(100, (chars / 280) * 100).toFixed(1);
  const idx    = String(index + 1).padStart(2, '0');
  const totStr = String(total).padStart(2, '0');
  const t12    = fmt12(time);
  const t24    = fmt24(time);

  return (
    <div className={`post-card${status && status !== 'idle' ? ` status-${status}` : ''}`}
         style={{ animationDelay: `${animDelay}s` }}>
      <div className="card-ghost">{idx}</div>
      <div className="card-body">

        <div className="card-head">
          <span className="card-index">POST {idx} / {totStr}</span>
          <div className="card-head-right">
            <StatusChip status={status} />
            <CopyButton text={post} />
          </div>
        </div>

        <div className="card-time-section">
          <div className="card-time-eyebrow">Tomorrow</div>
          <div className="card-time-value">{t12}</div>
          <div className="card-time-meta">
            <span className="card-time-hint">Set scheduler to</span>
            <CopyButton text={t24} label={t24} className="btn-copy-time" />
          </div>
        </div>

        <hr className="card-rule" />
        {errorMsg && <div className="card-error-msg">{errorMsg}</div>}
        <div className="card-post-text">{post}</div>

        <div className="card-footer">
          <span className={`char-label${isOver ? ' over' : isWarn ? ' warn' : ''}`}>
            {chars} / 280{isOver ? ' · over limit ⚠' : ''}
          </span>
          <div className="char-track">
            <div className="char-fill" style={{ width: `${pct}%`, background: barClr }} />
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Auth Panel ───────────────────────────────────────────────
function AuthPanel({ hasSession, handle, onAuthDone }) {
  const [authState, setAuthState] = useState('idle');

  const handleSignIn = async () => {
    if (!window.electronAPI?.startAuth) return;
    setAuthState('opening');
    const result = await window.electronAPI.startAuth();
    if (result?.ok) {
      setAuthState('done');
      onAuthDone();
    } else {
      setAuthState('idle');
    }
  };

  const handleSignOut = async () => {
    await window.electronAPI?.signOut();
    onAuthDone();
  };

  if (hasSession === null) return null;

  if (hasSession) {
    return (
      <div className="auth-panel auth-panel-ok">
        <span className="auth-ok-dot" />
        <span className="auth-ok-label">
          {handle ? handle : 'Connected to X'}
        </span>
        <button className="auth-signout-btn" onClick={handleSignOut}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="auth-panel auth-panel-warn">
      {authState === 'opening' ? (
        <>
          <span className="spinner" style={{ width: 13, height: 13, flexShrink: 0 }} />
          <div className="auth-opening-text">
            <strong>X login window opened</strong>
            <span>Sign in using any method — email, Google, or Apple. The window will close automatically when done.</span>
          </div>
        </>
      ) : (
        <>
          <div className="auth-warn-text">
            <strong>Not connected to X</strong>
            <span>Sign in once to let PostSchedule schedule posts on your behalf.</span>
          </div>
          <button className="btn-signin" onClick={handleSignIn}>
            <XIcon size={14} />
            Sign in to X
          </button>
        </>
      )}
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────
export default function App() {
  const [rawInput,     setRawInput]     = useState('');
  const [posts,        setPosts]        = useState([]);
  const [times,        setTimes]        = useState([]);
  const [statuses,     setStatuses]     = useState([]);
  const [errorMsgs,    setErrorMsgs]    = useState([]);
  const [hasSession,   setHasSession]   = useState(null);
  const [handle,       setHandle]       = useState(null);
  const [scheduling,   setScheduling]   = useState(false);
  const [schedDone,    setSchedDone]    = useState(false);
  const [schedError,   setSchedError]   = useState('');

  // ── Settings state ──
  const [autoSchedule,  setAutoSchedule]  = useState(true);
  const [rangeStart,    setRangeStart]    = useState(3  * 60);
  const [rangeEnd,      setRangeEnd]      = useState(23 * 60 + 30);
  const [scheduleDate,  setScheduleDate]  = useState(tomorrowStr);

  const cardsRef = useRef(null);

  const refreshSession = useCallback(() => {
    fetch(`${API}/api/health`)
      .then(r => r.json())
      .then(d => { setHasSession(d.hasSession); setHandle(d.handle || null); })
      .catch(() => { setHasSession(false); setHandle(null); });
  }, []);

  useEffect(() => { refreshSession(); }, [refreshSession]);

  const parsedPosts = parsePosts(rawInput);
  const postCount   = parsedPosts.length;

  // ── Generate schedule ──
  const generate = useCallback((postList, wStart, wEnd) => {
    const { times: t } = buildSchedule(postList.length, wStart, wEnd);
    setPosts(postList);
    setTimes(t);
    setStatuses(postList.map(() => 'idle'));
    setErrorMsgs(postList.map(() => ''));
    return t;
  }, []);

  // ── Regenerate ──
  const handleRegenerate = useCallback(() => {
    if (!posts.length) return;
    const { times: t } = buildSchedule(posts.length, rangeStart, rangeEnd);
    setTimes(t);
    setStatuses(posts.map(() => 'idle'));
    setErrorMsgs(posts.map(() => ''));
    setSchedDone(false);
    setSchedError('');
  }, [posts, rangeStart, rangeEnd]);

  // ── Handle slider change ──
  const handleRangeChange = useCallback((s, e) => {
    setRangeStart(s);
    setRangeEnd(e);
  }, []);

  // ── Schedule all ──
  const handleScheduleAll = useCallback(async () => {
    const postList = parsePosts(rawInput);
    if (!postList.length) return;

    const scheduledTimes = generate(postList, rangeStart, rangeEnd);
    setScheduling(true);
    setSchedDone(false);
    setSchedError('');

    setTimeout(() => cardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);

    try {
      const res = await fetch(`${API}/api/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posts: postList,
          times: scheduledTimes,
          autoSchedule,
          scheduleDate,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setSchedError(err.error || 'Server error');
        setScheduling(false);
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === 'progress') {
              setStatuses(prev => { const n = [...prev]; n[ev.index] = ev.status; return n; });
              if (ev.status === 'error') {
                setErrorMsgs(prev => { const n = [...prev]; n[ev.index] = ev.message || 'Unknown error'; return n; });
              }
            } else if (ev.type === 'complete') {
              setSchedDone(true);
              setScheduling(false);
            } else if (ev.type === 'error') {
              setSchedError(ev.message);
              setScheduling(false);
            }
          } catch { /* ignore malformed SSE */ }
        }
      }
    } catch (err) {
      setSchedError(err.message);
      setScheduling(false);
    }
  }, [rawInput, generate, rangeStart, rangeEnd, autoSchedule, scheduleDate]);

  const doneCount  = statuses.filter(s => s === 'done').length;
  const errorCount = statuses.filter(s => s === 'error').length;
  const totalCount = posts.length;
  const progPct    = totalCount ? Math.round(((doneCount + errorCount) / totalCount) * 100) : 0;

  return (
    <>
      <div className="bg-layer" />
      <div className="page">

        {/* Header */}
        <header className="header">
          <div className="logo-row">
            <div className="logo-mark">
              <img src="./logo.png" alt="PostSchedule" style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: 4 }} />
            </div>
            <span className="logo-name">PostSchedule</span>
          </div>
          <p className="header-tagline">Generate organic-looking schedules that never look pre-planned.</p>
        </header>

        {/* Auth panel */}
        <AuthPanel hasSession={hasSession} handle={handle} onAuthDone={refreshSession} />

        {/* Input Panel */}
        <div className="input-panel">
          <div className="input-panel-header">
            <span className="input-label">Your Posts</span>
            <span className={`count-pill${postCount > 0 ? ' live' : ''}`}>
              {postCount === 0 ? '0 posts' : postCount === 1 ? '1 post' : `${postCount} posts`}
            </span>
          </div>
          <textarea
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            disabled={scheduling}
            placeholder={
              'Paste your posts here, separated by --- on its own line\n\n' +
              'This is your first post.\n---\nSecond post here.\n---\nThird post here...'
            }
          />
          <p className="input-hint">Separate each post with <code>---</code> on its own line</p>
        </div>

        {/* ── Settings Panel ── */}
        <div className="settings-panel">

          {/* Row 1: Date + Auto-schedule toggle */}
          <div className="settings-row">
            <div className="settings-field">
              <span className="settings-label">Date</span>
              <input
                type="date"
                className="date-input"
                value={scheduleDate}
                min={todayStr()}
                onChange={e => setScheduleDate(e.target.value)}
              />
            </div>

            <div className="settings-field settings-field-right">
              <span className="settings-label">Press Schedule</span>
              <Toggle value={autoSchedule} onChange={setAutoSchedule} />
            </div>
          </div>

          {/* Row 2: Posting window slider */}
          <div className="settings-field" style={{ marginTop: 20 }}>
            <span className="settings-label">Posting window</span>
            <DualRangeSlider
              start={rangeStart}
              end={rangeEnd}
              onChange={handleRangeChange}
            />
          </div>

        </div>

        {/* Actions */}
        <div className="action-row">
          <button
            className="btn-primary"
            onClick={handleScheduleAll}
            disabled={scheduling || postCount === 0 || !hasSession}
          >
            <XIcon size={16} />
            {scheduling
              ? (autoSchedule ? 'Scheduling…' : 'Opening composers…')
              : (autoSchedule ? 'Schedule All Posts' : 'Open All Composers')}
          </button>

          {posts.length > 0 && (
            <button className="btn-secondary" onClick={handleRegenerate} disabled={scheduling}>
              <RegenIcon />
              Regenerate
            </button>
          )}
        </div>

        {/* Progress */}
        {scheduling && totalCount > 0 && (
          <div className="progress-banner">
            <span className="spinner" style={{ width: 14, height: 14 }} />
            <span>
              {autoSchedule ? 'Scheduling' : 'Opening'} {doneCount + errorCount + 1} of {totalCount}…
            </span>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${progPct}%` }} />
            </div>
          </div>
        )}

        {/* Done */}
        {schedDone && !scheduling && (
          <div className="banner banner-info">
            <span>✓</span>
            <span>
              {doneCount} post{doneCount !== 1 ? 's' : ''} {autoSchedule ? 'scheduled' : 'ready for review'}
              {errorCount > 0 ? `, ${errorCount} failed` : ''}.
              {!autoSchedule && <> Review each tab and click <strong style={{ color: '#93c5fd' }}>Schedule</strong>.</>}
            </span>
          </div>
        )}

        {/* Error */}
        {schedError && (
          <div className="banner banner-error">
            <span>✗</span><span>{schedError}</span>
          </div>
        )}

        {/* Cards */}
        <div ref={cardsRef} className="cards-wrap">
          {posts.map((post, i) => i < times.length && (
            <PostCard
              key={i}
              post={post}
              time={times[i]}
              index={i}
              total={posts.length}
              status={statuses[i]}
              errorMsg={errorMsgs[i]}
              animDelay={i * 0.07}
            />
          ))}
        </div>

        {posts.length === 0 && (
          <div className="empty-state">
            Paste your posts above and click <strong>Schedule All Posts</strong>
          </div>
        )}

      </div>
    </>
  );
}
