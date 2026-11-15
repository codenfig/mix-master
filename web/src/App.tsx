import { useEffect, useRef, useState } from 'react'
import { Activity, AudioLines, Check, CircleHelp, Download, FileAudio, FolderOpen, Headphones, ListMusic, LoaderCircle, Music2, Play, RotateCcw, Settings2, SlidersHorizontal, Sparkles, UploadCloud, X, LayoutDashboard, ArrowRight } from 'lucide-react'
import { analyze, queueMix, fetchJob, downloadJob, type AnalysisResult, type MixMetrics, type MixJob } from './api'
import Waveform from './Waveform'

type Page = 'overview' | 'studio' | 'library' | 'preview' | 'history' | 'settings'
const pages: { id: Page; label: string; subtitle: string }[] = [
  { id: 'overview', label: 'Overview', subtitle: 'Your creative command center' },
  { id: 'studio', label: 'Create Mix', subtitle: 'Build your next continuous set' },
  { id: 'library', label: 'Track Library', subtitle: 'Explore and arrange your music' },
  { id: 'preview', label: 'Mix Preview', subtitle: 'Listen, review and export' },
  { id: 'history', label: 'Mix History', subtitle: 'Your previous sessions' },
  { id: 'settings', label: 'Settings', subtitle: 'Shape your mixing workflow' },
]
const readPage = (): Page => {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return pages.some(p => p.id === hash) ? hash as Page : 'overview'
}
const extensions = new Set(['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'])
const MAX_BYTES = 200 * 1024 * 1024
const formatTime = (seconds: number) => Number.isFinite(seconds) ? [Math.floor(seconds / 60), Math.floor(seconds % 60)].map(n => String(n).padStart(2, '0')).join(':') : '--:--'

export default function App() {
  const [page, setPage] = useState<Page>(readPage)
  useEffect(() => {
    const onHash = () => setPage(readPage())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const navigate = (next: Page) => { window.location.hash = '/' + next; setPage(next); window.scrollTo(0, 0) }
  const [count, setCount] = useState<5 | 10 | 20>(10)
  const [transition, setTransition] = useState(12)
  const [mastering, setMastering] = useState<'off' | 'balanced' | 'club' | 'custom'>('balanced')
  const [targetLufs, setTargetLufs] = useState(-14)
  const [truePeak, setTruePeak] = useState(-1.5)
  const [bassDb, setBassDb] = useState(0)
  const [trebleDb, setTrebleDb] = useState(0)
  const [compression, setCompression] = useState(false)
  const [activeJob, setActiveJob] = useState<string | null>(() => { try { return localStorage.getItem('mixmaster_active_job') } catch { return null } })
  const [kickEnabled, setKickEnabled] = useState(false)
  const [kickStyle, setKickStyle] = useState<'soft' | 'club'>('soft')
  const [kickLevel, setKickLevel] = useState(16)
  const [kickResult, setKickResult] = useState<{ enabled: boolean; style: string | null; bpm: number | null; level: number | null } | null>(null)
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
  const [transitionChecks, setTransitionChecks] = useState<{ from: string; to: string; proxy_score: number; loudness_gap_db: number; attempts: number }[]>([])
  const [masteringResult, setMasteringResult] = useState<{ preset: string; target_lufs: number | null; true_peak_limit_dbtp: number | null } | null>(null)
  const [playSignal, setPlaySignal] = useState(0)
  const [playReady, setPlayReady] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const request = useRef<AbortController | null>(null)
  const outputUrl = useRef<string | null>(null)
  const ready = files.length === count && !busy && !activeJob
  const plannedTracks = analysis?.plan?.order_indices?.map(i => analysis.tracks[i]) ?? []
  const energyMax = Math.max(0.000001, ...(analysis?.tracks.map(t => t.energy) || []))

  function resetOutput() {
    if (outputUrl.current) URL.revokeObjectURL(outputUrl.current)
    outputUrl.current = null
    setUrl(null)
    setMetrics(null)
    setMasteringResult(null)
    setKickResult(null)
    setTransitionChecks([])
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
    navigate('studio')
    setAnalysis(null)
    resetOutput()
    setError(invalid.length > 0)
    setMessage(invalid.length ? 'Some files were rejected (unsupported, empty or over 200 MiB).' : valid.length === count ? 'All ' + count + ' tracks added. Analyze or create your mix.' : valid.length > count ? 'You selected ' + valid.length + ' tracks. Remove ' + (valid.length - count) + ' to continue.' : valid.length ? valid.length + ' tracks added. Add ' + (count - valid.length) + ' more to continue.' : 'Select exactly ' + count + ' songs.')
  }

  function removeFile(index: number) {
    if (busy) return
    const next = files.filter((_, i) => i !== index)
    setFiles(next)
    setAnalysis(null)
    resetOutput()
    setError(false)
    setMessage(next.length === count ? 'Tracks ready for analysis or mixing.' : next.length > count ? 'Remove ' + (next.length - count) + ' more tracks.' : 'Added ' + next.length + ' of ' + count + ' required tracks.')
  }

  function addFiles(list: FileList | File[]) {
    if (busy) return
    const incoming = Array.from(list)
    const invalid = incoming.filter(file => !extensions.has(file.name.split('.').pop()?.toLowerCase() || '') || file.size > MAX_BYTES || file.size === 0)
    const valid = incoming.filter(file => !invalid.includes(file))
    const combined = [...files, ...valid.filter(file => !files.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified))]
    setFiles(combined)
    setAnalysis(null)
    resetOutput()
    setError(invalid.length > 0)
    setMessage(invalid.length ? 'Some files were rejected. Check the supported formats and 200 MiB limit.' : combined.length === count ? 'All tracks added. Ready to analyze or mix.' : combined.length > count ? 'Too many tracks: remove ' + (combined.length - count) + '.' : 'Added ' + combined.length + ' of ' + count + ' tracks. Add ' + (count - combined.length) + ' more.')
  }

  function changeCount(value: 5 | 10 | 20) {
    if (busy) return
    setCount(value)
    setAnalysis(null)
    resetOutput()
    setError(false)
    setMessage(files.length === value ? 'Tracks ready for analysis or mixing.' : 'Selected ' + files.length + ' tracks. This preset requires exactly ' + value + '.')
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
    setMessage(activeJob ? 'Stopped monitoring. Mixing continues on the server.' : 'Request canceled.')
    setError(false)
  }

  async function completeJob(id: string, job: MixJob, signal?: AbortSignal) {
    const blob = await downloadJob(id, signal)
    if (!blob.size) throw new Error('The server returned an empty audio file.')
    const result = { peak: job.metrics?.peak ?? 0, rms: job.metrics?.rms ?? 0, nearSilence: job.metrics?.near_silence_fraction ?? 0, clippingRisk: job.metrics?.clipping_risk ?? false }
    setMetrics(result)
    setMasteringResult(job.metrics?.mastering || null)
    setKickResult(job.metrics?.kick || null)
    setTransitionChecks(job.metrics?.transitions || [])
    if (outputUrl.current) URL.revokeObjectURL(outputUrl.current)
    const nextUrl = URL.createObjectURL(blob)
    outputUrl.current = nextUrl
    setUrl(nextUrl)
    setActiveJob(null)
    try { localStorage.removeItem('mixmaster_active_job') } catch { /* Storage may be unavailable */ }
    navigate('preview')
    setMessage(result.clippingRisk ? 'Mix ready. Check peaks before limiting.' : 'Mix ready! Preview and download your MP3.')
    setHistory(previous => { const next = [{ tracks: job.total_tracks, created: new Date().toLocaleString() }, ...previous].slice(0, 12); try { localStorage.setItem('mixmaster_history', JSON.stringify(next)) } catch { /* Storage may be unavailable */ } return next })
  }

  // Recover a queued job after a browser refresh. The server owns rendering;
  // aborting browser polling does not stop the background worker.
  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem('mixmaster_active_job') } catch { /* Storage may be unavailable */ }
    if (!saved) return
    const controller = new AbortController()
    const resume = async () => {
      setBusy('mix')
      setMessage('Reconnected to your background mix.')
      try {
        let job = await fetchJob(saved!, controller.signal)
        while (job.status === 'queued' || job.status === 'processing') {
          setProgress(job.status === 'queued' ? 'Queued in background…' : 'Mixing in background: ' + job.completed_tracks + '/' + job.total_tracks + ' tracks')
          await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(() => { controller.signal.removeEventListener('abort', onAbort); resolve() }, 1500)
            const onAbort = () => { window.clearTimeout(timer); reject(new DOMException('Canceled', 'AbortError')) }
            controller.signal.addEventListener('abort', onAbort, { once: true })
          })
          job = await fetchJob(saved!, controller.signal)
        }
        if (job.status !== 'done') throw new Error(job.error || 'Background mixing failed.')
        await completeJob(saved!, job, controller.signal)
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(true)
          setMessage(err instanceof Error ? err.message : 'Could not recover the background job.')
          setActiveJob(null)
          try { localStorage.removeItem('mixmaster_active_job') } catch { /* Storage may be unavailable */ }
        }
      } finally {
        if (!controller.signal.aborted) { setBusy(null); setProgress(null) }
      }
    }
    void resume()
    return () => controller.abort()
  }, [])

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
        navigate('library')
        setMessage('Analysis complete. Your mix is ready to render.')
      } else {
        resetOutput()
        const queued = await queueMix(files, count, transition, controller.signal, mastering, { enabled: kickEnabled, style: kickStyle, level: kickLevel / 100 }, { target_lufs: targetLufs, true_peak: truePeak, bass_db: bassDb, treble_db: trebleDb, compression })
        setActiveJob(queued.id)
        try { localStorage.setItem('mixmaster_active_job', queued.id) } catch { /* Storage may be unavailable */ }
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
        await completeJob(queued.id, job, controller.signal)

      }
    } catch (err) {
      const canceled = err instanceof DOMException && err.name === 'AbortError'
      setError(!canceled)
      if (!canceled && mode === 'mix') {
        setActiveJob(null)
        try { localStorage.removeItem('mixmaster_active_job') } catch { /* Storage may be unavailable */ }
      }
      setMessage(canceled ? 'Monitoring stopped. Background rendering may still be running.' : err instanceof Error ? err.message : 'Unexpected processing error.')
    } finally {
      request.current = null
      setProgress(null)
      setBusy(null)
    }
  }

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><AudioLines size={27} /></div><div><strong>MixMaster <span>AI</span></strong><small>INTELLIGENT DJ STUDIO</small></div></div>
      <div className="nav-label">YOUR STUDIO</div>
      <nav aria-label="Main navigation">
        {pages.map(item => {
          const Icon = item.id === 'overview' ? LayoutDashboard : item.id === 'studio' ? SlidersHorizontal : item.id === 'library' ? ListMusic : item.id === 'preview' ? Headphones : item.id === 'history' ? RotateCcw : Settings2
          return <a key={item.id} href={'#/' + item.id} aria-current={page === item.id ? 'page' : undefined} className={'nav' + (page === item.id ? ' active' : '')} onClick={() => setPage(item.id)}><Icon size={18}/>{item.label}{page === item.id && <span className="nav-indicator"/>}</a>
        })}
      </nav>
      <div className="sidebar-bottom"><div className="help-box"><CircleHelp size={20}/><div><strong>Need a hand?</strong><p>Select {count} audio files, analyze them, then render your mix.</p></div></div><small>MixMaster AI · Development MVP</small></div>
    </aside>

    <main className="main">
      <header className="topbar"><span className="breadcrumb">Workspace <span>/</span> {pages.find(p => p.id === page)?.label}</span><div className="top-status"><span className="online-dot"/> Local DJ Studio</div></header>
      <div className="content" key={page}>
        {activeJob && <div className="background-job" role="status"><div><LoaderCircle className="spin" size={18}/><strong>Background mix in progress</strong><span>{progress || 'The server is preparing your audio.'}</span></div><button type="button" onClick={() => navigate('studio')}>View progress <ArrowRight size={15}/></button></div>}
        <div className="page-heading"><div><div className="eyebrow"><Sparkles size={14}/> MIXMASTER WORKSPACE</div><h1>{pages.find(p => p.id === page)?.label}</h1><p>{pages.find(p => p.id === page)?.subtitle}</p></div><div className="page-heading-actions">{page !== 'studio' && <button className="action primary" onClick={() => navigate('studio')}><Sparkles size={16}/> Create a Mix <ArrowRight size={16}/></button>}</div></div>
        {page === 'overview' && <div className="overview-page">
          <div className="overview-banner"><div className="eyebrow"><Sparkles size={16}/> YOUR AUTONOMOUS DJ STUDIO</div><h2>Make every track <span>flow.</span></h2><p>Analyze your music, shape the energy journey and produce seamless nonstop mixes in one creative workspace.</p><button className="overview-cta" onClick={() => navigate('studio')}>Start mixing <ArrowRight size={17}/></button><div className="banner-orb"><Music2 size={58}/></div></div>
          <div className="overview-stats"><div className="stat-card"><span>TRACKS LOADED</span><strong>{files.length}</strong><small>Ready in your session</small></div><div className="stat-card"><span>COMPLETED MIXES</span><strong>{history.length}</strong><small>Browser history entries</small></div><div className="stat-card"><span>PLAN COMPATIBILITY</span><strong>{analysis?.plan ? analysis.plan.quality_score + '/100' : '—'}</strong><small>Metadata-based estimate</small></div></div>
          <div className="overview-grid"><div className="panel"><div className="panel-heading"><div><h2><Activity size={19}/> Session status</h2><p>Your current workflow at a glance.</p></div></div><div className="status-rows"><div><span>Track selection</span><strong>{files.length} / {count} files</strong></div><div><span>Track analysis</span><strong>{analysis ? 'Complete' : 'Not started'}</strong></div><div><span>Mix output</span><strong>{url ? 'Ready to preview' : busy ? 'Processing' : 'Not rendered'}</strong></div></div><button className="inline-link" onClick={() => navigate(url ? 'preview' : 'studio')}>Continue session <ArrowRight size={16}/></button></div><div className="panel"><div className="panel-heading"><div><h2><ListMusic size={19}/> Recent activity</h2><p>Previously completed mixes on this browser.</p></div></div>{history.length ? history.slice(0,3).map((item,i) => <div className="recent-row" key={i}><div className="recent-icon"><AudioLines size={18}/></div><div><strong>Nonstop Mix</strong><small>{item.tracks} tracks · {item.created}</small></div></div>) : <div className="overview-empty">Your first finished mix will appear here.</div>}<button className="inline-link" onClick={() => navigate('history')}>View history <ArrowRight size={16}/></button></div></div>
        </div>}
        {page === 'studio' && <><div className="hero"><div><div className="eyebrow"><Sparkles size={15}/> SMART MIXING WORKSPACE</div><h1>Create your <span>perfect mix.</span></h1><p>Upload your favorite tracks and let MixMaster AI analyze, arrange and blend them into one continuous listening experience.</p></div><div className="hero-disc"><div className="disc-inner"><Music2 size={34}/></div></div></div>

        <div className="steps" aria-label="Mix workflow">
          {[['01','Upload Tracks'],['02','Analyze Music'],['03','Arrange Flow'],['04','Create Mix']].map(([number,label],index) => <div className="step" key={number}><span className={index === 0 || (index === 1 && analysis) || (index === 3 && url) ? 'step-number done' : 'step-number'}>{index === 0 && files.length === count ? <Check size={17}/> : number}</span><span>{label}</span>{index < 3 && <span className="step-line"/>}</div>)}
        </div>

        <div className="agent-overview">
          <div className="agent-card"><div className="agent-label"><Sparkles size={17}/> AUTONOMOUS DJ PLAN</div><strong>{analysis?.plan ? analysis.plan.quality_score + '/100' : 'Awaiting analysis'}</strong><small>Estimated transition compatibility, not an audible-quality rating</small></div>
          <div className="agent-card agent-curve"><div className="agent-label"><Activity size={17}/> ENERGY JOURNEY</div>
            {plannedTracks.length > 1 ? <svg viewBox="0 0 600 120" preserveAspectRatio="none" role="img" aria-label="Planned energy progression" className="energy-chart"><polyline fill="none" stroke="#b77aff" strokeWidth="3" strokeLinejoin="round" points={plannedTracks.map((t,i) => (i * 600 / (plannedTracks.length - 1)) + ',' + (110 - t.energy / energyMax * 95)).join(' ')}/></svg> : <div className="curve-empty">Analyze tracks to reveal the planned energy flow.</div>}
          </div>
        </div>
        </>}
        {(page === 'studio' || page === 'library' || page === 'settings') && <div className={"workspace" + (page !== 'studio' ? " workspace-single" : "")}>
          <section className="left-column">
            {page === 'studio' && <div className="panel upload-panel">
              <div className="panel-heading"><div><h2><UploadCloud size={20}/> Upload Your Music</h2><p>Start by adding your tracks to the studio.</p></div><span className="pill">{files.length} / {count} tracks</span></div>
              <input ref={input} type="file" multiple accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,audio/*" className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
              <div className="drop-zone" role="button" tabIndex={0} onClick={() => !busy && input.current?.click()} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); input.current?.click() } }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}>
                <div className="upload-icon"><FolderOpen size={30}/></div><strong>{files.length ? 'Add more audio tracks' : 'Drag & drop your audio files here'}</strong><span>or click to browse from your device</span><div className="browse-button">Browse Files</div><small>MP3, WAV, FLAC, M4A, OGG, AAC · Max 200 MiB each</small>
              </div>
              <div className="upload-feedback" role="status" aria-live="polite">
                <div className="upload-feedback-heading"><strong>{files.length === count ? 'Track selection complete' : files.length ? files.length + ' of ' + count + ' tracks selected' : 'No audio tracks selected yet'}</strong><span>{files.length === count ? 'Ready to analyze' : files.length > count ? 'Remove extra tracks' : (count - files.length) + ' remaining'}</span></div>
                <div className="upload-progress"><span style={{ width: Math.min(100, files.length / count * 100) + '%' }}/></div>
                {files.length > 0 && <div className="selected-tracks">{files.map((file,i) => <div className="selected-track" key={file.name + '-' + i}><FileAudio size={17}/><span title={file.name}>{file.name}</span><small>{(file.size / 1048576).toFixed(1)} MB</small><button type="button" aria-label={'Remove ' + file.name} disabled={busy !== null} onClick={() => removeFile(i)}><X size={16}/></button></div>)}</div>}
                {files.length > 0 && <button type="button" className="inline-link" onClick={() => navigate('library')}>View track library <ArrowRight size={15}/></button>}
              </div>
            </div>}

            {(page === 'studio' || page === 'library') && <div className="panel library" id="library">
              <div className="panel-heading"><div><h2><ListMusic size={20}/> Track Analysis</h2><p>Insights into your selected music.</p></div><button className="subtle" disabled={busy !== null || files.length === 0} onClick={() => chooseFiles([])}><RotateCcw size={15}/> Clear</button></div>
              {page === 'library' && <div className="library-upload-actions"><span>{files.length} tracks in this session</span><button type="button" onClick={() => navigate('studio')}><UploadCloud size={16}/> Add tracks in Create Mix</button></div>}
              <div className="tabs"><button className={tab === 'tracks' ? 'selected' : ''} onClick={() => setTab('tracks')}>Tracks & Insights</button><button className={tab === 'order' ? 'selected' : ''} onClick={() => setTab('order')}>Suggested Order</button></div>
              {tab === 'tracks' ? <div className="table-wrap"><table><thead><tr><th>#</th><th>TRACK</th><th>DURATION</th><th>BPM</th><th>KEY</th><th>ENERGY</th></tr></thead><tbody>{files.length === 0 ? <tr><td className="empty" colSpan={6}><FileAudio size={28}/> Upload tracks to view their analysis.</td></tr> : files.map((file,i) => { const track = analysis?.tracks[i]; return <tr key={i}><td>{String(i+1).padStart(2,'0')}</td><td className="track-name" title={file.name}>{file.name}</td><td>{track ? formatTime(track.duration) : '—'}</td><td>{track ? Math.round(track.bpm) : '—'}</td><td>{track?.key || '—'}</td><td>{track ? <div className="energy-bar"><span style={{width: Math.max(6,track.energy / energyMax * 100)+'%'}}/></div> : '—'}</td></tr> })}</tbody></table></div> : <div>{analysis?.plan && <div className="plan-score"><strong>Mix compatibility: {analysis.plan.quality_score}/100</strong><small>{analysis.plan.strategy} · Estimated from track metadata</small></div>}<ol className="order-list">{analysis?.order.length ? analysis.order.map((name,i) => <li key={i}><span>{String(i+1).padStart(2,'0')}</span>{name}</li>) : <li className="order-empty">Analyze your tracks to see the suggested play order.</li>}</ol>{analysis?.plan?.transitions.map((t, i) => <div className="transition-insight" key={i}><span>{t.from} → {t.to}</span><strong>{t.compatibility}/100</strong>{t.warning && <small>{t.warning}</small>}</div>)}</div>}
            </div>}
          </section>

          {(page === 'studio' || page === 'settings') && <aside className="panel settings" id="settings">
            <div className="panel-heading"><div><h2><Settings2 size={20}/> Mix Settings</h2><p>Make the mix your own.</p></div></div>
            <label className="field-label">MIX STYLE</label>
            <div className="preset-options">{(['smooth','balanced','quick'] as const).map(value => <button key={value} className={preset === value ? 'selected' : ''} disabled={busy !== null} onClick={() => applyPreset(value)}>{value}</button>)}</div>
            <small className="preset-hint">Styles adjust crossfade duration, not the mixing algorithm.</small>
            <div className="settings-divider"/>
            <label className="field-label">SMART KICK BEAT</label>
            <label className="kick-toggle"><input type="checkbox" checked={kickEnabled} disabled={busy !== null} onChange={e => { setKickEnabled(e.target.checked); resetOutput() }}/><span>Add a constant kick pulse throughout the mix</span></label>
            {kickEnabled && <div className="kick-controls"><div className="preset-options mastering-options">{(['soft','club'] as const).map(value => <button type="button" key={value} className={kickStyle === value ? 'selected' : ''} disabled={busy !== null} onClick={() => { setKickStyle(value); resetOutput() }}>{value === 'soft' ? 'Subtle' : 'Club'}</button>)}</div><label className="field-label" htmlFor="kick-level">KICK STRENGTH <span>{kickLevel}%</span></label><input id="kick-level" type="range" min={5} max={35} step={1} value={kickLevel} disabled={busy !== null} onChange={e => { setKickLevel(Number(e.target.value)); resetOutput() }}/><small className="preset-hint">Uses the opening song's estimated BPM as a constant tempo. Best for songs already close in tempo.</small></div>}
            <label className="field-label">AUDIO MASTERING</label>
            <div className="preset-options mastering-options">{(['off', 'balanced', 'club', 'custom'] as const).map(value => <button key={value} type="button" className={mastering === value ? 'selected' : ''} disabled={busy !== null} onClick={() => { setMastering(value); resetOutput() }}>{value === 'off' ? 'Off' : value === 'balanced' ? 'Balanced' : value === 'club' ? 'Club' : 'Custom'}</button>)}</div>
            <small className="preset-hint">{mastering === 'off' ? 'Peak limiting only.' : mastering === 'balanced' ? 'Streaming-friendly target: −14 LUFS / −1.5 dBTP.' : mastering === 'club' ? 'Louder DJ set target: −12 LUFS / −1.5 dBTP.' : 'Fine-tune EQ, compression, loudness and peak ceiling below.'} Applied when exporting the mix.</small>
            {mastering === 'custom' && <div className="custom-mastering">
              <label htmlFor="target-lufs">Target loudness <strong>{targetLufs} LUFS</strong></label><input id="target-lufs" type="range" min={-20} max={-9} step={1} value={targetLufs} disabled={busy !== null} onChange={e => setTargetLufs(Number(e.target.value))}/>
              <label htmlFor="true-peak">True-peak ceiling <strong>{truePeak.toFixed(1)} dBTP</strong></label><input id="true-peak" type="range" min={-3} max={-0.5} step={0.5} value={truePeak} disabled={busy !== null} onChange={e => setTruePeak(Number(e.target.value))}/>
              <label htmlFor="bass-db">Bass EQ <strong>{bassDb > 0 ? '+' : ''}{bassDb} dB</strong></label><input id="bass-db" type="range" min={-6} max={6} value={bassDb} disabled={busy !== null} onChange={e => setBassDb(Number(e.target.value))}/>
              <label htmlFor="treble-db">Treble EQ <strong>{trebleDb > 0 ? '+' : ''}{trebleDb} dB</strong></label><input id="treble-db" type="range" min={-6} max={6} value={trebleDb} disabled={busy !== null} onChange={e => setTrebleDb(Number(e.target.value))}/>
              <label className="kick-toggle"><input type="checkbox" checked={compression} disabled={busy !== null} onChange={e => setCompression(e.target.checked)}/> Gentle stereo compression</label>
              <small className="preset-hint">Custom settings apply during export. Adjust conservatively to avoid distortion.</small>
            </div>}
            <label className="field-label">NUMBER OF SONGS</label>
            <div className="count-options">{([5,10,20] as const).map(n => <button key={n} className={count === n ? 'selected' : ''} disabled={busy !== null} onClick={() => changeCount(n)}>{n}<small>songs</small></button>)}</div>
            <label className="field-label" htmlFor="transition">TRANSITION DURATION <span>{transition}s</span></label>
            <input id="transition" type="range" min={4} max={32} value={transition} disabled={busy !== null} onChange={e => { setTransition(Number(e.target.value)); setPreset('balanced') }}/><div className="range-labels"><span>4s · Quick</span><span>32s · Smooth</span></div>
            <label className="field-label" htmlFor="quality">EXPORT QUALITY</label><select id="quality" disabled value="320"><option value="320">MP3 · 320 kbps</option></select>
            <div className="settings-divider"/>
            {activeJob && <p className="preset-hint">A background mix is already running. Wait for it to finish before starting another.</p>}
            <button className="action secondary" disabled={!ready} onClick={() => void run('analysis')}>{busy === 'analysis' ? <LoaderCircle className="spin" size={18}/> : <Activity size={18}/>} Analyze Tracks</button>
            <button className="action primary" disabled={!ready} onClick={() => void run('mix')}>{busy === 'mix' ? <LoaderCircle className="spin" size={18}/> : <Sparkles size={18}/>} Create My Mix</button>
            {busy && <button className="cancel" onClick={cancel}><X size={15}/> {busy === 'mix' ? 'Stop monitoring (mix continues)' : 'Cancel request'}</button>}
            <div className={error ? 'message error' : 'message'} role="status" aria-live="polite">{progress || message}</div>
          </aside>}
        </div>}

        {page === 'preview' && <><section className="panel preview" id="preview"><div className="preview-main"><div className="panel-heading"><div><h2><AudioLines size={20}/> Mix Preview <span className="muted">{url ? '· Ready to play' : '· Awaiting your mix'}</span></h2><p>Listen to your finished mix before downloading.</p></div></div><div className="player"><button className="play" disabled={!playReady} aria-label="Play or pause mix" onClick={() => setPlaySignal(n => n+1)}><Play size={21} fill="currentColor"/></button><div className="wave-area"><Waveform url={url} onTime={(t,d) => {setCurrent(t);setDuration(d)}} onReady={setPlayReady} playSignal={playSignal}/><div className="time"><span>{formatTime(current)}</span><span>{formatTime(duration)}</span></div></div></div></div><div className="preview-summary"><div className="summary-title">MIX SUMMARY</div><strong>{url ? formatTime(duration) : '--:--'}</strong><span>Total Mix Duration</span><div className="summary-divider"/><p>{Math.max(0,count-1)} transitions · {transition}s each</p>{url && <a className="download" href={url} download="MixMaster_AI_Nonstop.mp3"><Download size={17}/> Download MP3</a>}</div></section>
        {kickResult?.enabled && <section className="panel mastering-report"><div className="panel-heading"><div><h2><Activity size={20}/> Smart Kick Report</h2><p>A synthesized pulse mixed into the exported audio.</p></div></div><div className="signal-metrics"><span>Tempo <strong>{kickResult.bpm} BPM</strong></span><span>Kick type <strong>{kickResult.style}</strong></span><span>Strength <strong>{Math.round((kickResult.level || 0) * 100)}%</strong></span></div></section>}
        {masteringResult && <section className="panel mastering-report"><div className="panel-heading"><div><h2><SlidersHorizontal size={20}/> Mastering Report</h2><p>Export processing settings, not a measured post-encode loudness report.</p></div></div><div className="signal-metrics"><span>Preset <strong>{masteringResult.preset}</strong></span><span>Target loudness <strong>{masteringResult.target_lufs === null ? 'Not normalized' : masteringResult.target_lufs + ' LUFS'}</strong></span><span>Peak ceiling <strong>{masteringResult.true_peak_limit_dbtp === null ? 'Basic limiter' : masteringResult.true_peak_limit_dbtp + ' dBTP'}</strong></span></div></section>}
        {metrics && <section className="panel signal-panel"><div className="panel-heading"><div><h2><Activity size={20}/> Audio Signal Check</h2><p>Measured on the mix before final limiting; not an assessment of musical transition quality.</p></div></div><div className="signal-metrics"><span>Peak amplitude <strong>{metrics.peak.toFixed(3)}</strong></span><span>RMS level <strong>{metrics.rms.toFixed(3)}</strong></span><span>Near-silence <strong>{(metrics.nearSilence * 100).toFixed(1)}%</strong></span><span>Clipping risk <strong>{metrics.clippingRisk ? 'Review mix' : 'Not detected'}</strong></span></div></section>}
        {transitionChecks.length > 0 && <section className="panel transition-report"><div className="panel-heading"><div><h2><Sparkles size={20}/> Automated Transition Review</h2><p>Measured proxy scores from candidate crossfades; higher does not guarantee better musical sound.</p></div></div><div className="history-list">{transitionChecks.map((t,i) => <div className="history-item" key={i}><strong>{t.from} → {t.to}</strong><span>{t.proxy_score}/100 · {t.attempts} candidates · {t.loudness_gap_db} dB gap</span></div>)}</div></section>}
        </>}
        {page === 'history' && <section className="panel history-panel" id="history"><div className="panel-heading"><div><h2><RotateCcw size={20}/> Mix History</h2><p>Completed mix metadata saved in this browser only. Audio is not retained.</p></div><button className="subtle" disabled={!history.length} onClick={() => { setHistory([]); try { localStorage.removeItem('mixmaster_history') } catch { /* Storage may be unavailable */ } }}>Clear</button></div>{history.length ? <div className="history-list">{history.map((item,i) => <div className="history-item" key={i}><strong>MixMaster AI Nonstop</strong><span>{item.tracks} tracks · {item.created}</span></div>)}</div> : <p className="history-empty">Your completed mixes will appear here.</p>}</section>}
        <footer><span>MixMaster AI · Development MVP · Experimental beat-phase alignment · Experimental phrase-aware transitions</span><span>Only upload audio you have permission to use.</span></footer>
      </div>
    </main>
  </div>
}
