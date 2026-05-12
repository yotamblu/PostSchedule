import { useState, useEffect, useCallback, useRef } from 'react';

// ── Schedule helpers ─────────────────────────────────────
function nonRoundMinute() {
  const pool = [];
  for (let i = 0; i < 60; i++) if (i % 5 !== 0) pool.push(i);
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildSchedule(n) {
  const MAX = 23 * 60 + 30;
  const times = [];
  let cur = (3 + Math.floor(Math.random() * 2)) * 60 + nonRoundMinute();
  times.push(cur);
  let truncated = false;
  for (let i = 1; i < n; i++) {
    cur += (2 + Math.floor(Math.random() * 3)) * 60 + nonRoundMinute();
    if (cur > MAX) { truncated = true; break; }
    times.push(cur);
  }
  return { times, truncated, fitted: times.length };
}

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

// ── Clipboard ────────────────────────────────────────────
async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = Object.assign(document.createElement('textarea'), { value: text, style: 'position:fixed;opacity:0' });
    document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t);
  }
}

// ── Icons ────────────────────────────────────────────────
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

// ── CopyButton ───────────────────────────────────────────
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

// ── StatusChip ───────────────────────────────────────────
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

// ── PostCard ─────────────────────────────────────────────
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
    <div
      className={`post-card${status && status !== 'idle' ? ` status-${status}` : ''}`}
      style={{ animationDelay: `${animDelay}s` }}
    >
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

// ── App ──────────────────────────────────────────────────
export default function App() {
  const [rawInput,    setRawInput]    = useState('');
  const [posts,       setPosts]       = useState([]);
  const [times,       setTimes]       = useState([]);
  const [statuses,    setStatuses]    = useState([]); // 'idle'|'scheduling'|'done'|'error'
  const [errorMsgs,   setErrorMsgs]   = useState([]);
  const [hasSession,  setHasSession]  = useState(null); // null = loading
  const [scheduling,  setScheduling]  = useState(false);
  const [schedDone,   setSchedDone]   = useState(false);
  const [schedError,  setSchedError]  = useState('');
  const [truncWarn,   setTruncWarn]   = useState('');
  const cardsRef = useRef(null);

  // ── Check session on mount ──
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setHasSession(d.hasSession))
      .catch(() => setHasSession(false));
  }, []);

  // ── Live parse ──
  const parsedPosts = parsePosts(rawInput);
  const postCount   = parsedPosts.length;

  // ── Generate schedule ──
  const generate = useCallback((postList) => {
    const { times: t, truncated, fitted } = buildSchedule(postList.length);
    setPosts(postList);
    setTimes(t);
    setStatuses(postList.map(() => 'idle'));
    setErrorMsgs(postList.map(() => ''));
    setTruncWarn(
      truncated
        ? `Only ${fitted} of ${postList.length} posts fit before 11:30 PM. ${postList.length - fitted} skipped.`
        : ''
    );
    return t;
  }, []);

  // ── Regenerate (times only) ──
  const handleRegenerate = useCallback(() => {
    if (!posts.length) return;
    const { times: t, truncated, fitted } = buildSchedule(posts.length);
    setTimes(t);
    setStatuses(posts.map(() => 'idle'));
    setErrorMsgs(posts.map(() => ''));
    setSchedDone(false);
    setSchedError('');
    setTruncWarn(
      truncated
        ? `Only ${fitted} of ${posts.length} posts fit before 11:30 PM. ${posts.length - fitted} skipped.`
        : ''
    );
  }, [posts]);

  // ── Schedule all via Playwright ──
  const handleScheduleAll = useCallback(async () => {
    const postList = parsePosts(rawInput);
    if (!postList.length) return;

    const scheduledTimes = generate(postList);
    setScheduling(true);
    setSchedDone(false);
    setSchedError('');

    setTimeout(() => cardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);

    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts: postList, times: scheduledTimes }),
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

        // Parse SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));

            if (ev.type === 'progress') {
              setStatuses(prev => {
                const next = [...prev];
                next[ev.index] = ev.status;
                return next;
              });
              if (ev.status === 'error') {
                setErrorMsgs(prev => {
                  const next = [...prev];
                  next[ev.index] = ev.message || 'Unknown error';
                  return next;
                });
              }
            } else if (ev.type === 'complete') {
              setSchedDone(true);
              setScheduling(false);
            } else if (ev.type === 'error') {
              setSchedError(ev.message);
              setScheduling(false);
            }
          } catch { /* malformed SSE line */ }
        }
      }
    } catch (err) {
      setSchedError(err.message);
      setScheduling(false);
    }
  }, [rawInput, generate]);

  // ── Progress stats ──
  const doneCount  = statuses.filter(s => s === 'done').length;
  const errorCount = statuses.filter(s => s === 'error').length;
  const totalCount = posts.length;
  const pct = totalCount ? Math.round(((doneCount + errorCount) / totalCount) * 100) : 0;

  return (
    <>
      <div className="bg-layer" />

      <div className="page">

        {/* ── Header ── */}
        <header className="header">
          <div className="logo-row">
            <div className="logo-mark"><img src="/logo.png" alt="PostSchedule" style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: 4 }} /></div>
            <span className="logo-name">PostSchedule</span>
          </div>
          <p className="header-tagline">Generate organic-looking schedules that never look pre-planned.</p>
        </header>

        {/* ── Auth notice ── */}
        {hasSession === false && (
          <div className="auth-notice">
            <span>⚠</span>
            <span>
              Session file not found at <code>Auto-X/session.json</code>. Check that the file exists and restart the server.
            </span>
          </div>
        )}

        {/* ── Input Panel ── */}
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
              'This is your first post. Write whatever you want.\n' +
              '---\n' +
              'And here is the second one. The scheduler will space them out naturally.\n' +
              '---\n' +
              'Third post here...'
            }
          />

          <p className="input-hint">
            Separate each post with <code>---</code> on its own line
          </p>
        </div>

        {/* ── Actions ── */}
        <div className="action-row">
          <button
            className="btn-primary"
            onClick={handleScheduleAll}
            disabled={scheduling || postCount === 0 || hasSession === false}
          >
            <XIcon size={16} />
            {scheduling ? 'Opening composers…' : 'Open All Composers'}
          </button>

          {posts.length > 0 && (
            <button className="btn-secondary" onClick={handleRegenerate} disabled={scheduling}>
              <RegenIcon />
              Regenerate
            </button>
          )}
        </div>

        {/* ── Truncation warning ── */}
        {truncWarn && (
          <div className="banner banner-warn">
            <span>⚠</span><span>{truncWarn}</span>
          </div>
        )}

        {/* ── Scheduling progress ── */}
        {scheduling && totalCount > 0 && (
          <div className="progress-banner">
            <span className="spinner" style={{ width: 14, height: 14 }} />
            <span>Opening composer {doneCount + errorCount + 1} of {totalCount}…</span>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* ── Done banner ── */}
        {schedDone && !scheduling && (
          <div className="banner banner-info">
            <span>✓</span>
            <span>
              {doneCount} tab{doneCount !== 1 ? 's' : ''} ready
              {errorCount > 0 ? `, ${errorCount} failed (see cards below)` : ''}.
              Each composer has the time pre-filled — review each post and click <strong style="color:#93c5fd;">Schedule</strong>.
            </span>
          </div>
        )}

        {/* ── Error banner ── */}
        {schedError && (
          <div className="banner banner-error">
            <span>✗</span><span>{schedError}</span>
          </div>
        )}

        {/* ── Cards ── */}
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

        {/* ── Empty state ── */}
        {posts.length === 0 && (
          <div className="empty-state">
            Paste your posts above and click <strong>Schedule All with Playwright</strong>
          </div>
        )}

      </div>
    </>
  );
}
