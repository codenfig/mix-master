import { useEffect, useRef, useState } from 'react'
import { Activity, AudioLines, Check, CircleHelp, Download, FileAudio, FolderOpen, Headphones, ListMusic, LoaderCircle, Music2, Play, RotateCcw, Settings2, SlidersHorizontal, Sparkles, UploadCloud, X } from 'lucide-react'
import { analyze, queueMix, fetchJob, downloadJob, type AnalysisResult, type MixMetrics } from './api'
import Waveform from './Waveform'

const extensions = new Set(['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'])
const MAX_BYTES = 200 * 1024 * 1024
const formatTime = (seconds: number) => Number.isFinite(seconds) ? [Math.floor(seconds / 60), Math.floor(seconds % 60)].map(n => String(n).padStart(2, '0')).join(':') : '--:--'

export default function App() {
  const [count, setCount] = useState<5 | 10 | 20>(10)
  const [transition, setTransition] = useState(12)
  const [preset, setPreset] = useState<'smooth' | 'balanced' | 'quick'>('balanced')
  const [history, setHistory] = useState<{ tracks: number; created: string }[]>(() => { try { return JSON.parse(localStorage.getItem('mixmaster_history') || '[]') } catch { return [] } })
  const [files, setFiles] = useState<File[]>([])
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [tab, setTab] = useState<'tracks' | 'order'>('tracks')
  const [busy, setBusy] = useState<'analysis' | 'mix' | null>(null)
  const [message, setMessage] = useState('Upload your tracks to start creating your mix.')
  const [error, setError] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<MixMetrics | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [playSignal, setPlaySignal] = useState(0)
  const [playReady, setPlayReady] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const request = useRef<AbortController | null>(null)
  const outputUrl = useRef<string | null>(null)
  const ready = files.length === count && !busy
  const plannedTracks = analysis?.plan?.order_indices?.map(i => analysis.tracks[i]) ?? []
  const energyMax = Math.max(0.000001, ...(analysis?.tracks.map(t => t.energy) || []))

  function resetOutput() {
    if (outputUrl.current) URL.revokeObjectURL(outputUrl.current)
    outputUrl.current = null
    setUrl(null)
    setMetrics(null)
    setProgress(null)
    setPlayReady(false)
    setCurrent(0)
    setDuration(0)
  }
  useEffect(() => () => {
    request.current?.abort()
    if (outputUrl.current) URL.revokeObjectURL(outputUrl.current)
  }, [])

  function chooseFiles(list: FileList | File[]) {
    if (busy) return
    const next = Array.from(list)
    const invalid = next.filter(file => !extensions.has(file.name.split('.').pop()?.toLowerCase() || '') || file.size > MAX_BYTES || file.size === 0)
    const valid = next.filter(file => !invalid.includes(file))
    setFiles(valid)
    setAnalysis(null)
    resetOutput()
    setError(invalid.length > 0)
    setMessage(invalid.length ? 'Some files were rejected (unsupported, empty or over 200 MiB).' : valid.length === count ? 'Tracks ready for analysis or mixing.' : 'Select exactly ' + count + ' songs.')
  }

  function changeCount(value: 5 | 10 | 20) {
    if (busy) return
    setCount(value)
    setAnalysis(null)
    resetOutput()
    setError(false)
    setMessage('Select exactly ' + value + ' songs.')
  }

  function applyPreset(value: 'smooth' | 'balanced' | 'quick') {
    if (busy) return
    setPreset(value)
    setTransition(value === 'smooth' ? 20 : value === 'quick' ? 6 : 12)
    setAnalysis(null)
    resetOutput()
  }

  function cancel() {
    request.current?.abort()
    setMessage('Request canceled.')
    setError(false)
  }

  async function run(mode: 'analysis' | 'mix') {
    if (!ready) return
    const controller = new AbortController()
    request.current = controller
    setBusy(mode)
    setError(false)
    setMessage(mode === 'analysis' ? 'Analyzing BPM, key and energy…' : 'Rendering your MP3… This may take several minutes.')
    try {
      if (mode === 'analysis') {
        const result = await analyze(files, count, transition, controller.signal)
        setAnalysis(result)
        setTab('tracks')
        setMessage('Analysis complete. Your mix is ready to render.')
      } else {
        resetOutput()
        const queued = await queueMix(files, count, transition, controller.signal)
        let job = await fetchJob(queued.id, controller.signal)
        while (job.status === 'queued' || job.status === 'processing') {
          setProgress(job.status === 'queued' ? 'Waiting in mixing queue…' : 'Rendering ' + job.completed_tracks + '/' + job.total_tracks + ' tracks')
          await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(() => { controller.signal.removeEventListener('abort', onAbort); resolve() }, 1200)
            const onAbort = () => { window.clearTimeout(timer); reject(new DOMException('Canceled', 'AbortError')) }
            controller.signal.addEventListener('abort', onAbort, { once: true })
          })
          job = await fetchJob(queued.id, controller.signal)
        }
        if (job.status !== 'done') throw new Error(job.error || 'Audio rendering failed.')
        const blob = await downloadJob(queued.id, controller.signal)
        const result = { metrics: { peak: job.metrics?.peak ?? 0, rms: job.metrics?.rms ?? 0, nearSilence: job.metrics?.nearSilence ?? 0, clippingRisk: job.metrics?.clippingRisk ?? false } }
        setMetrics(result.metrics)
        setProgress(null)
        if (!blob.size) throw new Error('The server returned an empty audio file.')
        const nextUrl = URL.createObjectURL(blob)
        outputUrl.current = nextUrl
        setUrl(nextUrl)
        setMessage(result.metrics.clippingRisk ? 'Mix ready. Signal peak exceeded the safe threshold before limiting; listen carefully.' : 'Mix ready! Preview and download your MP3.')
        setHistory(previous => { const next = [{ tracks: count, created: new Date().toLocaleString() }, ...previous].slice(0, 12); try { localStorage.setItem('mixmaster_history', JSON.stringify(next)) } catch { /* Storage may be unavailable */ } return next })
      }
    } catch (err) {
      const canceled = err instanceof DOMException && err.name === 'AbortError'
      setError(!canceled)
      setMessage(canceled ? 'Request canceled.' : err instanceof Error ? err.message : 'Unexpected processing error.')
    } finally {
      request.current = null
      setProgress(null)
      setBusy(null)
    }
  }

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><AudioLines size={27} /></div><div><strong>MixMaster <span>AI</span></strong><small>INTELLIGENT DJ STUDIO</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        <button className="nav active" onClick={() => document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' })}><SlidersHorizontal size={18}/> Create Mix</button>
        <button className="nav" onClick={() => document.getElementById('library')?.scrollIntoView({ behavior: 'smooth' })}><ListMusic size={18}/> Track Library</button>
        <button className="nav" onClick={() => document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth' })}><Headphones size={18}/> Mix Preview</button>
        <button className="nav" onClick={() => document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' })}><RotateCcw size={18}/> Mix History</button>
        <button className="nav" onClick={() => document.getElementById('settings')?.scrollIntoView({ behavior: 'smooth' })}><Settings2 size={18}/> Settings</button>
      </nav>
      <div className="sidebar-bottom"><div className="help-box"><CircleHelp size={20}/><div><strong>Need a hand?</strong><p>Select {count} audio files, analyze them, then render your mix.</p></div></div><small>MixMaster AI · Development MVP</small></div>
    </aside>

    <main id="studio" className="main">
      <header className="topbar"><span className="breadcrumb">Workspace <span>/</span> Create Mix</span><div className="top-status"><span className="online-dot"/> AI DJ Studio</div></header>
      <div className="content">
        <div className="hero"><div><div className="eyebrow"><Sparkles size={15}/> SMART MIXING WORKSPACE</div><h1>Create your <span>perfect mix.</span></h1><p>Upload your favorite tracks and let MixMaster AI analyze, arrange and blend them into one continuous listening experience.</p></div><div className="hero-disc"><div className="disc-inner"><Music2 size={34}/></div></div></div>

        <div className="steps" aria-label="Mix workflow">
          {[['01','Upload Tracks'],['02','Analyze Music'],['03','Arrange Flow'],['04','Create Mix']].map(([number,label],index) => <div className="step" key={number}><span className={index === 0 || (index === 1 && analysis) || (index === 3 && url) ? 'step-number done' : 'step-number'}>{index === 0 && files.length === count ? <Check size={17}/> : number}</span><span>{label}</span>{index < 3 && <span className="step-line"/>}</div>)}
        </div>

        <div className="agent-overview">
          <div className="agent-card"><div className="agent-label"><Sparkles size={17}/> AUTONOMOUS DJ PLAN</div><strong>{analysis?.plan ? analysis.plan.quality_score + '/100' : 'Awaiting analysis'}</strong><small>Estimated transition compatibility, not an audible-quality rating</small></div>
          <div className="agent-card agent-curve"><div className="agent-label"><Activity size={17}/> ENERGY JOURNEY</div>
            {plannedTracks.length > 1 ? <svg viewBox="0 0 600 120" preserveAspectRatio="none" role="img" aria-label="Planned energy progression" className="energy-chart"><polyline fill="none" stroke="#b77aff" strokeWidth="3" strokeLinejoin="round" points={plannedTracks.map((t,i) => (i * 600 / (plannedTracks.length - 1)) + ',' + (110 - t.energy / energyMax * 95)).join(' ')}/></svg> : <div className="curve-empty">Analyze tracks to reveal the planned energy flow.</div>}
          </div>
        </div>
        <div className="workspace">
          <section className="left-column">
            <div className="panel upload-panel">
              <div className="panel-heading"><div><h2><UploadCloud size={20}/> Upload Your Music</h2><p>Start by adding your tracks to the studio.</p></div><span className="pill">{files.length} / {count} tracks</span></div>
              <input ref={input} type="file" multiple accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,audio/*" className="hidden" onChange={e => { if (e.target.files) chooseFiles(e.target.files); e.target.value = '' }} />
              <div className="drop-zone" role="button" tabIndex={0} onClick={() => !busy && input.current?.click()} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); input.current?.click() } }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) chooseFiles(e.dataTransfer.files) }}>
                <div className="upload-icon"><FolderOpen size={30}/></div><strong>Drag & drop your audio files here</strong><span>or click to browse from your device</span><div className="browse-button">Browse Files</div><small>MP3, WAV, FLAC, M4A, OGG, AAC · Max 200 MiB each</small>
              </div>
            </div>

            <div className="panel library" id="library">
              <div className="panel-heading"><div><h2><ListMusic size={20}/> Track Analysis</h2><p>Insights into your selected music.</p></div><button className="subtle" disabled={busy !== null || files.length === 0} onClick={() => chooseFiles([])}><RotateCcw size={15}/> Clear</button></div>
              <div className="tabs"><button className={tab === 'tracks' ? 'selected' : ''} onClick={() => setTab('tracks')}>Tracks & Insights</button><button className={tab === 'order' ? 'selected' : ''} onClick={() => setTab('order')}>Suggested Order</button></div>
              {tab === 'tracks' ? <div className="table-wrap"><table><thead><tr><th>#</th><th>TRACK</th><th>DURATION</th><th>BPM</th><th>KEY</th><th>ENERGY</th></tr></thead><tbody>{files.length === 0 ? <tr><td className="empty" colSpan={6}><FileAudio size={28}/> Upload tracks to view their analysis.</td></tr> : files.map((file,i) => { const track = analysis?.tracks[i]; return <tr key={i}><td>{String(i+1).padStart(2,'0')}</td><td className="track-name" title={file.name}>{file.name}</td><td>{track ? formatTime(track.duration) : '—'}</td><td>{track ? Math.round(track.bpm) : '—'}</td><td>{track?.key || '—'}</td><td>{track ? <div className="energy-bar"><span style={{width: Math.max(6,track.energy / energyMax * 100)+'%'}}/></div> : '—'}</td></tr> })}</tbody></table></div> : <div>{analysis?.plan && <div className="plan-score"><strong>Mix compatibility: {analysis.plan.quality_score}/100</strong><small>{analysis.plan.strategy} · Estimated from track metadata</small></div>}<ol className="order-list">{analysis?.order.length ? analysis.order.map((name,i) => <li key={i}><span>{String(i+1).padStart(2,'0')}</span>{name}</li>) : <li className="order-empty">Analyze your tracks to see the suggested play order.</li>}</ol>{analysis?.plan?.transitions.map((t, i) => <div className="transition-insight" key={i}><span>{t.from} → {t.to}</span><strong>{t.compatibility}/100</strong>{t.warning && <small>{t.warning}</small>}</div>)}</div>}
            </div>
          </section>

          <aside className="panel settings" id="settings">
            <div className="panel-heading"><div><h2><Settings2 size={20}/> Mix Settings</h2><p>Make the mix your own.</p></div></div>
            <label className="field-label">MIX STYLE</label>
            <div className="preset-options">{(['smooth','balanced','quick'] as const).map(value => <button key={value} className={preset === value ? 'selected' : ''} disabled={busy !== null} onClick={() => applyPreset(value)}>{value}</button>)}</div>
            <small className="preset-hint">Styles adjust crossfade duration, not the mixing algorithm.</small>
            <label className="field-label">NUMBER OF SONGS</label>
            <div className="count-options">{([5,10,20] as const).map(n => <button key={n} className={count === n ? 'selected' : ''} disabled={busy !== null} onClick={() => changeCount(n)}>{n}<small>songs</small></button>)}</div>
            <label className="field-label" htmlFor="transition">TRANSITION DURATION <span>{transition}s</span></label>
            <input id="transition" type="range" min={4} max={32} value={transition} disabled={busy !== null} onChange={e => { setTransition(Number(e.target.value)); setPreset('balanced') }}/><div className="range-labels"><span>4s · Quick</span><span>32s · Smooth</span></div>
            <label className="field-label" htmlFor="quality">EXPORT QUALITY</label><select id="quality" disabled value="320"><option value="320">MP3 · 320 kbps</option></select>
            <div className="settings-divider"/>
            <button className="action secondary" disabled={!ready} onClick={() => void run('analysis')}>{busy === 'analysis' ? <LoaderCircle className="spin" size={18}/> : <Activity size={18}/>} Analyze Tracks</button>
            <button className="action primary" disabled={!ready} onClick={() => void run('mix')}>{busy === 'mix' ? <LoaderCircle className="spin" size={18}/> : <Sparkles size={18}/>} Create My Mix</button>
            {busy && <button className="cancel" onClick={cancel}><X size={15}/> Cancel request</button>}
            <div className={error ? 'message error' : 'message'} role="status" aria-live="polite">{progress || message}</div>
          </aside>
        </div>

        <section className="panel preview" id="preview"><div className="preview-main"><div className="panel-heading"><div><h2><AudioLines size={20}/> Mix Preview <span className="muted">{url ? '· Ready to play' : '· Awaiting your mix'}</span></h2><p>Listen to your finished mix before downloading.</p></div></div><div className="player"><button className="play" disabled={!playReady} aria-label="Play or pause mix" onClick={() => setPlaySignal(n => n+1)}><Play size={21} fill="currentColor"/></button><div className="wave-area"><Waveform url={url} onTime={(t,d) => {setCurrent(t);setDuration(d)}} onReady={setPlayReady} playSignal={playSignal}/><div className="time"><span>{formatTime(current)}</span><span>{formatTime(duration)}</span></div></div></div></div><div className="preview-summary"><div className="summary-title">MIX SUMMARY</div><strong>{url ? formatTime(duration) : '--:--'}</strong><span>Total Mix Duration</span><div className="summary-divider"/><p>{Math.max(0,count-1)} transitions · {transition}s each</p>{url && <a className="download" href={url} download="MixMaster_AI_Nonstop.mp3"><Download size={17}/> Download MP3</a>}</div></section>
        {metrics && <section className="panel signal-panel"><div className="panel-heading"><div><h2><Activity size={20}/> Audio Signal Check</h2><p>Measured on the mix before final limiting; not an assessment of musical transition quality.</p></div></div><div className="signal-metrics"><span>Peak amplitude <strong>{metrics.peak.toFixed(3)}</strong></span><span>RMS level <strong>{metrics.rms.toFixed(3)}</strong></span><span>Near-silence <strong>{(metrics.nearSilence * 100).toFixed(1)}%</strong></span><span>Clipping risk <strong>{metrics.clippingRisk ? 'Review mix' : 'Not detected'}</strong></span></div></section>}
        <section className="panel history-panel" id="history"><div className="panel-heading"><div><h2><RotateCcw size={20}/> Mix History</h2><p>Completed mix metadata saved in this browser only. Audio is not retained.</p></div><button className="subtle" disabled={!history.length} onClick={() => { setHistory([]); try { localStorage.removeItem('mixmaster_history') } catch { /* Storage may be unavailable */ } }}>Clear</button></div>{history.length ? <div className="history-list">{history.map((item,i) => <div className="history-item" key={i}><strong>MixMaster AI Nonstop</strong><span>{item.tracks} tracks · {item.created}</span></div>)}</div> : <p className="history-empty">Your completed mixes will appear here.</p>}</section>
        <footer><span>MixMaster AI · Development MVP · Experimental beat-phase alignment · Phrase matching pending</span><span>Only upload audio you have permission to use.</span></footer>
      </div>
    </main>
  </div>
}
