import { useEffect, useRef, useState } from 'react'
import { Activity, AudioLines, Check, CircleHelp, Download, FileAudio, FolderOpen, Headphones, ListMusic, LoaderCircle, Music2, Play, Pause, RotateCcw, Settings2, SlidersHorizontal, Sparkles, UploadCloud, X, LayoutDashboard, ArrowRight } from 'lucide-react'
import { analyze, queueMix, fetchJob, downloadJob, type AnalysisResult, type MixMetrics, type MixJob } from './api'
import Waveform from './Waveform'
import VocalRemover from './VocalRemover'
import StemSplitter from './StemSplitter'
import AudioMastering from './AudioMastering'
import VoiceStudio from './VoiceStudio'

type Page = 'onboarding' | 'overview' | 'studio' | 'library' | 'preview' | 'history' | 'settings' | 'vocal-remover' | 'stem-splitter' | 'audio-mastering' | 'voice-studio'
const pages: { id: Page; label: string; subtitle: string }[] = [
  { id: 'onboarding', label: 'Welcome', subtitle: 'Discover MixMaster AI' },
  { id: 'overview', label: 'Overview', subtitle: 'Your creative command center' },
  { id: 'studio', label: 'Create Mix', subtitle: 'Build your next continuous set' },
  { id: 'library', label: 'Track Library', subtitle: 'Explore and arrange your music' },
  { id: 'preview', label: 'Mix Preview', subtitle: 'Listen, review and export' },
  { id: 'history', label: 'Mix History', subtitle: 'Your previous sessions' },
  { id: 'vocal-remover', label: 'Vocal Remover', subtitle: 'Extract clean instrumental audio from songs' },
  { id: 'stem-splitter', label: 'Stem Splitter', subtitle: 'Separate vocals, drums, bass and instruments' },
  { id: 'audio-mastering', label: 'Audio Mastering', subtitle: 'Make your music polished, balanced and louder' },
  { id: 'voice-studio', label: 'AI Voice Studio', subtitle: 'Train your own voice and convert singing vocals' },
  { id: 'settings', label: 'Settings', subtitle: 'Shape your mixing workflow' },
]
const readPage = (): Page => {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return pages.some(p => p.id === hash) ? hash as Page : 'onboarding'
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
  const [kickSourceIndex, setKickSourceIndex] = useState(-1)
  const [kickStyle, setKickStyle] = useState<'soft' | 'club'>('soft')
  const [kickLevel, setKickLevel] = useState(16)
  const [kickResult, setKickResult] = useState<{ enabled: boolean; style: string | null; bpm: number | null; level: number | null; source?: string | null; source_offset_seconds?: number | null } | null>(null)
  const [preset, setPreset] = useState<'smooth' | 'balanced' | 'quick'>('balanced')
  const [history, setHistory] = useState<{ tracks: number; created: string }[]>(() => { try { return JSON.parse(localStorage.getItem('mixmaster_history') || '[]') } catch { return [] } })
  const [coverImage, setCoverImage] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [mixTitle, setMixTitle] = useState('My DJ Mix')
  const [mixArtist, setMixArtist] = useState('MixMaster AI')
  const [mixAlbum, setMixAlbum] = useState('MixMaster AI')
  const [mixYear, setMixYear] = useState('')
  const [coverError, setCoverError] = useState('')
  useEffect(() => {
    if (!coverImage) { setCoverPreview(null); return }
    const next = URL.createObjectURL(coverImage)
    setCoverPreview(next)
    return () => URL.revokeObjectURL(next)
  }, [coverImage])
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
  const [isPlaying, setIsPlaying] = useState(false)
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
    setIsPlaying(false)
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
        const queued = await queueMix(files, count, transition, controller.signal, mastering, { enabled: kickEnabled, style: kickStyle, level: kickLevel / 100, sourceIndex: kickSourceIndex }, { target_lufs: targetLufs, true_peak: truePeak, bass_db: bassDb, treble_db: trebleDb, compression }, { image: coverImage, title: mixTitle, artist: mixArtist, album: mixAlbum, year: mixYear })
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

  if (page === 'onboarding') return <div className="onboard-page">
    <header className="onboard-top"><div className="brand"><div className="brand-icon"><AudioLines size={27}/></div><div><strong>MixMaster <span>AI</span></strong><small>INTELLIGENT DJ STUDIO</small></div></div><button className="onboard-text-link" onClick={()=>navigate('overview')}>Open operations <ArrowRight size={17}/></button></header>
    <main className="onboard-main">
      <div className="onboard-eyebrow"><Sparkles size={16}/> WELCOME TO YOUR MUSIC WORKSPACE</div>
      <h1>Make your music <em>extraordinary.</em></h1>
      <p className="onboard-lead">Create DJ mixes, separate vocals, master audio and explore AI voice tools — all from one workspace.</p>
      <div className="onboard-actions"><button className="onboard-primary" onClick={()=>navigate('studio')}>Launch Mixing Studio <ArrowRight size={20}/></button><button className="onboard-secondary" onClick={()=>navigate('overview')}>Explore operations</button></div>
      <div className="onboard-features">
        <button onClick={()=>navigate('studio')}><SlidersHorizontal size={26}/><strong>DJ Mix Creator</strong><span>Arrange tracks and generate continuous mixes</span><ArrowRight size={17}/></button>
        <button onClick={()=>navigate('vocal-remover')}><FileAudio size={26}/><strong>Vocal Remover</strong><span>Separate vocals from instrumentals</span><ArrowRight size={17}/></button>
        <button onClick={()=>navigate('stem-splitter')}><AudioLines size={26}/><strong>Stem Splitter</strong><span>Extract drums, bass, vocals and other stems</span><ArrowRight size={17}/></button>
        <button onClick={()=>navigate('audio-mastering')}><Sparkles size={26}/><strong>Audio Mastering</strong><span>Polish loudness, dynamics and tone</span><ArrowRight size={17}/></button>
        <button onClick={()=>navigate('voice-studio')}><Music2 size={26}/><strong>AI Voice Studio</strong><span>Manage voice profiles and conversion workflows</span><ArrowRight size={17}/></button>
        <button onClick={()=>navigate('preview')}><Headphones size={26}/><strong>Mix Preview</strong><span>Listen to and export finished mixes</span><ArrowRight size={17}/></button>
      </div>
      <p className="onboard-footnote">AI voice training and conversion require an external engine. Only upload audio you have permission to use.</p>
    </main>
  </div>
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><AudioLines size={27} /></div><div><strong>MixMaster <span>AI</span></strong><small>INTELLIGENT DJ STUDIO</small></div></div>
      <div className="nav-label">YOUR STUDIO</div>
      <nav aria-label="Main navigation">
        {pages.filter(item => item.id !== 'onboarding').map(item => {
          const Icon = item.id === 'overview' ? LayoutDashboard : item.id === 'studio' ? SlidersHorizontal : item.id === 'library' ? ListMusic : item.id === 'preview' ? Headphones : item.id === 'history' ? RotateCcw : item.id === 'vocal-remover' ? FileAudio : item.id === 'stem-splitter' ? AudioLines : item.id === 'audio-mastering' ? SlidersHorizontal : item.id === 'voice-studio' ? Music2 : Settings2
          return <a key={item.id} href={'#/' + item.id} aria-current={page === item.id ? 'page' : undefined} className={'nav' + (page === item.id ? ' active' : '')} onClick={() => setPage(item.id)}><Icon size={18}/>{item.label}{page === item.id && <span className="nav-indicator"/>}</a>
        })}
      </nav>
      <div className="sidebar-bottom"><button className="onboard-back" onClick={()=>navigate('onboarding')}>← Welcome / Onboarding</button><div className="help-box"><CircleHelp size={20}/><div><strong>Need a hand?</strong><p>Select {count} audio files, analyze them, then render your mix.</p></div></div><small>MixMaster AI · Development MVP</small></div>
    </aside>

    <main className="main">
      <header className="topbar"><span className="breadcrumb">Workspace <span>/</span> {pages.find(p => p.id === page)?.label}</span><div className="top-status"><span className="online-dot"/> Local DJ Studio</div></header>
      <div className={"content content-" + page + (page === "overview" ? " overview-content" : "")} key={page}>
        {activeJob && <div className="background-job" role="status"><div><LoaderCircle className="spin" size={18}/><strong>Background mix in progress</strong><span>{progress || 'The server is preparing your audio.'}</span></div><button type="button" onClick={() => navigate('studio')}>View progress <ArrowRight size={15}/></button></div>}
        <div className="page-heading"><div><div className="eyebrow"><Sparkles size={14}/> MIXMASTER WORKSPACE</div><h1>{pages.find(p => p.id === page)?.label}</h1><p>{pages.find(p => p.id === page)?.subtitle}</p></div><div className="page-heading-actions">{page !== 'studio' && <button className="action primary" onClick={() => navigate('studio')}><Sparkles size={16}/> Create a Mix <ArrowRight size={16}/></button>}</div></div>
        {page === 'vocal-remover' && <VocalRemover/>}
        {page === 'stem-splitter' && <StemSplitter/>}
        {page === 'audio-mastering' && <AudioMastering/>}
        {page === 'voice-studio' && <VoiceStudio/>}
        {page === 'overview' && <div className="overview-page">
          <div className="overview-banner"><div className="overview-banner-glow" aria-hidden="true"/><div className="eyebrow"><Sparkles size={16}/> YOUR AUTONOMOUS DJ STUDIO</div><h2>Make every track <span>flow.</span></h2><p>Analyze your music, shape the energy journey and produce seamless nonstop mixes in one creative workspace.</p><button className="overview-cta" onClick={() => navigate('studio')}>Start mixing <ArrowRight size={17}/></button><div className="banner-orb"><Music2 size={58}/></div></div>
          <div className="overview-stats"><div className="stat-card"><span>TRACKS LOADED</span><strong>{files.length}</strong><small>Ready in your session</small></div><div className="stat-card"><span>COMPLETED MIXES</span><strong>{history.length}</strong><small>Browser history entries</small></div><div className="stat-card"><span>PLAN COMPATIBILITY</span><strong>{analysis?.plan ? analysis.plan.quality_score + '/100' : '—'}</strong><small>Metadata-based estimate</small></div></div>
          <div className="overview-grid"><div className="panel"><div className="panel-heading"><div><h2><Activity size={19}/> Session status</h2><p>Your current workflow at a glance.</p></div></div><div className="status-rows"><div><span>Track selection</span><strong>{files.length} / {count} files</strong></div><div><span>Track analysis</span><strong>{analysis ? 'Complete' : 'Not started'}</strong></div><div><span>Mix output</span><strong>{url ? 'Ready to preview' : busy ? 'Processing' : 'Not rendered'}</strong></div></div><button className="inline-link" onClick={() => navigate(url ? 'preview' : 'studio')}>Continue session <ArrowRight size={16}/></button></div><div className="panel"><div className="panel-heading"><div><h2><ListMusic size={19}/> Recent activity</h2><p>Previously completed mixes on this browser.</p></div></div>{history.length ? history.slice(0,3).map((item,i) => <div className="recent-row" key={i}><div className="recent-icon"><AudioLines size={18}/></div><div><strong>Nonstop Mix</strong><small>{item.tracks} tracks · {item.created}</small></div></div>) : <div className="overview-empty">Your first finished mix will appear here.</div>}<button className="inline-link" onClick={() => navigate('history')}>View history <ArrowRight size={16}/></button></div></div>
        </div>}
        {page === 'studio' && <div className="studio-intro">
          <section className="studio-hero">
            <div className="studio-hero-copy"><div className="studio-eyebrow"><Sparkles size={15}/> THE AI MIXING STUDIO <span> / SESSION 001</span></div><h2>Make the night <em>flow.</em></h2><p>Drop your tracks. Shape the energy. Let MixMaster AI build a continuous set with seamless transitions and your signature sound.</p><div className="studio-hero-tags"><span><AudioLines size={14}/> BEAT MATCHING</span><span><Activity size={14}/> ENERGY FLOW</span><span><Sparkles size={14}/> AI ARRANGEMENT</span></div></div>
            <div className="studio-hero-art" aria-hidden="true"><div className="studio-hero-halo"/><div className="studio-hero-record"><div className="studio-record-label"><Music2 size={33}/><small>MIXMASTER</small></div></div><div className="studio-hero-eq">{Array.from({length:25},(_,i)=><i key={i} style={{height:(16+Math.abs(Math.sin(i*.82)*Math.cos(i*.21))*74)+'%'}}/>)}</div></div>
          </section>
          <div className="studio-progress-steps" aria-label="Mix workflow">
            {[['01','Upload','Build your crate'],['02','Analyze','Discover the sound'],['03','Arrange','Shape the journey'],['04','Render','Create your mix']].map(([number,label,detail],index)=>{
              const complete=index===0?files.length===count:index===1||index===2?Boolean(analysis):Boolean(url)
              const currentStep=!url?(files.length!==count?0:!analysis?1:3):4
              return <div key={number} className={'studio-progress-step'+(complete?' is-complete':'')+(currentStep===index?' is-current':'')}><span className="studio-step-num">{complete?<Check size={16}/>:number}</span><div><strong>{label}</strong><small>{detail}</small></div>{index<3&&<ArrowRight className="studio-step-arrow" size={15}/>}</div>
            })}
          </div>
          <div className="studio-intelligence">
            <section className="studio-intel-card"><div className="studio-intel-label"><Sparkles size={17}/> SMART DJ PLAN <span>{analysis?.plan?'ANALYZED':'PENDING'}</span></div><strong>{analysis?.plan?analysis.plan.quality_score+'/100':'Ready when you are'}</strong><p>{analysis?.plan?'Estimated musical compatibility for the proposed sequence.':'Add your tracks and analyze them to reveal the AI-selected sequence.'}</p></section>
            <section className="studio-intel-card studio-intel-energy"><div className="studio-intel-label"><Activity size={17}/> ENERGY JOURNEY <span>{analysis?'LIVE ANALYSIS':'PREVIEW'}</span></div>
              {plannedTracks.length>1?<svg viewBox="0 0 600 115" preserveAspectRatio="none" role="img" aria-label="Planned energy progression" className="studio-energy-chart"><defs><linearGradient id="studioEnergy" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#d850ef"/><stop offset=".55" stopColor="#8056fb"/><stop offset="1" stopColor="#36baf2"/></linearGradient></defs><polyline fill="none" stroke="url(#studioEnergy)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" points={plannedTracks.map((t,i)=>(i*600/(plannedTracks.length-1))+','+(104-t.energy/energyMax*88)).join(' ')}/>{plannedTracks.map((t,i)=><circle key={i} cx={i*600/(plannedTracks.length-1)} cy={104-t.energy/energyMax*88} r="5" fill="#d9adff"/>)}</svg>:<div className="studio-energy-placeholder"><div className="studio-eq-bars" aria-hidden="true">{Array.from({length:43},(_,i)=><i key={i} style={{height:8+Math.abs(Math.sin(i*.67)*Math.cos(i*.16))*48}}/>)}</div><span>Your energy curve appears after track analysis</span></div>}
            </section>
          </div>
        </div>}
        {(page === 'studio' || page === 'library' || page === 'settings') && <div className={"workspace" + (page !== 'studio' ? " workspace-single" : "")}>
          <section className="left-column">
            {page === 'studio' && <div className="panel upload-panel studio-upload-card">
              <div className="panel-heading"><div><h2><UploadCloud size={20}/> Upload Your Music</h2><p>Start by adding your tracks to the studio.</p></div><span className="pill">{files.length} / {count} tracks</span></div>
              <input ref={input} type="file" multiple accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,audio/*" className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
              <div className="drop-zone studio-drop-zone" role="button" tabIndex={0} onClick={() => !busy && input.current?.click()} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); input.current?.click() } }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}>
                <div className="upload-icon"><UploadCloud size={32}/></div><strong>{files.length ? 'Keep building your music crate' : 'Your next great mix starts here'}</strong><span>Drag & drop tracks, or browse your device</span><div className="browse-button"><FolderOpen size={15}/> Choose Audio Files <ArrowRight size={15}/></div><small>MP3, WAV, FLAC, M4A, OGG, AAC · Max 200 MiB each</small>
              </div>
              <div className="upload-feedback" role="status" aria-live="polite">
                <div className="upload-feedback-heading"><strong>{files.length === count ? 'Track selection complete' : files.length ? files.length + ' of ' + count + ' tracks selected' : 'No audio tracks selected yet'}</strong><span>{files.length === count ? 'Ready to analyze' : files.length > count ? 'Remove extra tracks' : (count - files.length) + ' remaining'}</span></div>
                <div className="upload-progress"><span style={{ width: Math.min(100, files.length / count * 100) + '%' }}/></div>
                {files.length > 0 && <div className="selected-tracks">{files.map((file,i) => <div className="selected-track" key={file.name + '-' + i}><FileAudio size={17}/><span title={file.name}>{file.name}</span><small>{(file.size / 1048576).toFixed(1)} MB</small><button type="button" aria-label={'Remove ' + file.name} disabled={busy !== null} onClick={() => removeFile(i)}><X size={16}/></button></div>)}</div>}
                {files.length > 0 && <button type="button" className="inline-link" onClick={() => navigate('library')}>View track library <ArrowRight size={15}/></button>}
              </div>
            </div>}

            {page === 'studio' && <section className="panel cover-panel">
              <div className="panel-heading"><div><h2><FileAudio size={20}/> Cover Art &amp; Metadata</h2><p>Personalize your exported MP3 artwork and music-player details.</p></div></div>
              <div className="cover-editor">
                <label className="cover-upload">
                  {coverPreview ? <img src={coverPreview} alt="Selected mix cover" /> : <span><UploadCloud size={27}/> Upload JPG / PNG cover<small>Square recommended · 10 MiB max</small></span>}
                  <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" disabled={busy !== null} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;if(!['image/jpeg','image/png'].includes(f.type)||f.size>10*1024*1024||f.size===0){setCoverError('Choose a JPG or PNG under 10 MiB.');return}setCoverError('');setCoverImage(f)}}/>
                </label>
                <div className="cover-fields">
                  <label>Mix title<input maxLength={120} value={mixTitle} onChange={e=>setMixTitle(e.target.value)} disabled={busy!==null}/></label>
                  <label>DJ / Artist<input maxLength={120} value={mixArtist} onChange={e=>setMixArtist(e.target.value)} disabled={busy!==null}/></label>
                  <label>Album<input maxLength={120} value={mixAlbum} onChange={e=>setMixAlbum(e.target.value)} disabled={busy!==null}/></label>
                  <label>Year (optional)<input maxLength={4} inputMode="numeric" placeholder="2026" value={mixYear} onChange={e=>setMixYear(e.target.value.replace(/[^0-9]/g,''))} disabled={busy!==null}/></label>
                  {coverImage&&<button type="button" className="inline-link" disabled={busy!==null} onClick={()=>setCoverImage(null)}>Remove cover image</button>}
                </div>
              </div>
              {coverError&&<p className="cover-error" role="alert">{coverError}</p>}
              <small className="cover-hint">Artwork and metadata are embedded in the MP3 when you generate the mix.</small>
            </section>}
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
            {kickEnabled && <div className="kick-controls"><label className="field-label" htmlFor="kick-source">KICK SOURCE</label><select id="kick-source" value={kickSourceIndex} disabled={busy !== null} onChange={e => { setKickSourceIndex(Number(e.target.value)); resetOutput() }}><option value={-1}>Synthesized kick (default)</option>{files.map((file, index) => <option key={index} value={index}>Extract from: {file.name}</option>)}</select><small className="preset-hint">Extracts a filtered low-frequency drum transient from the selected song. It is not a clean separated stem.</small><div className="preset-options mastering-options">{(['soft','club'] as const).map(value => <button type="button" key={value} className={kickStyle === value ? 'selected' : ''} disabled={busy !== null} onClick={() => { setKickStyle(value); resetOutput() }}>{value === 'soft' ? 'Subtle' : 'Club'}</button>)}</div><label className="field-label" htmlFor="kick-level">KICK STRENGTH <span>{kickLevel}%</span></label><input id="kick-level" type="range" min={5} max={35} step={1} value={kickLevel} disabled={busy !== null} onChange={e => { setKickLevel(Number(e.target.value)); resetOutput() }}/><small className="preset-hint">Uses the opening song's estimated BPM as a constant tempo. Best for songs already close in tempo.</small></div>}
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

        {page === 'preview' && <div className="dj-preview">
          <div className="dj-banner"><div className="dj-banner-copy"><span className="dj-kicker">MIXMASTER WORKSPACE</span><h2>Mix Preview</h2><p>Listen, analyze and export your AI-powered DJ mix</p></div><div className="dj-banner-eq" aria-hidden="true">{Array.from({length:42},(_,i)=><i key={i} style={{height: (15+Math.abs(Math.sin(i*.67)*Math.cos(i*.17))*76)+'%'}}/>)}</div><div className="dj-headphones" aria-hidden="true"/></div>
          <section className="dj-main-deck">
            <div className={"dj-cover-stack" + (isPlaying ? " is-spinning" : "")} aria-hidden="true"><div className="dj-vinyl"><div className="dj-vinyl-center"/></div><div className="dj-cover" role="img" aria-label={coverPreview ? "Custom mix cover" : "Neon DJ silhouette and AI DJ MIX album cover"} style={coverPreview ? {backgroundImage: "url(" + coverPreview + ")", backgroundSize: "cover", backgroundPosition: "center"} : undefined}/></div>
            <div className="dj-deck-center"><div className="dj-track-heading"><div><div className="dj-track-title"><h3>{mixTitle || "My DJ Mix"}</h3><span>AI MIX</span></div><p>Continuous set <b>•</b> AI arranged <b>•</b> Studio master</p></div></div><div className="dj-main-wave"><Waveform url={url} onTime={(t,d)=>{setCurrent(t);setDuration(d)}} onReady={setPlayReady} playSignal={playSignal} onPlayingChange={setIsPlaying}/></div><div className="dj-timeline"><span>{formatTime(current)}</span><div className="dj-progress-track"><div style={{width:duration?Math.min(100,current/duration*100)+'%':'0%'}}/></div><span>{formatTime(duration)}</span></div><div className="dj-player-actions"><span className="dj-player-label"><Headphones size={15}/> STUDIO LISTENING</span><button type="button" className="dj-play-btn" disabled={!playReady} onClick={()=>setPlaySignal(v=>v+1)} aria-label={isPlaying ? "Pause mix" : "Resume mix"} title={isPlaying ? "Pause" : "Play / Resume"} aria-pressed={isPlaying}>{isPlaying ? <Pause size={25} fill="currentColor"/> : <Play size={25} fill="currentColor"/>}<span className="dj-play-caption">{isPlaying ? "Pause" : current > 0 && current < duration ? "Resume" : "Play"}</span></button><span className="dj-player-label">MP3 · EXPORT READY</span></div></div>
            <aside className="dj-summary"><span className="dj-card-label">MIX SUMMARY</span><div className="dj-summary-row"><Music2 size={20}/><div><strong>{url?formatTime(duration):'--:--'}</strong><small>Total Mix Duration</small></div></div><div className="dj-summary-row"><ListMusic size={20}/><div><strong>{url?count:'—'}</strong><small>Tracks Mixed</small></div></div><div className="dj-summary-row"><Activity size={20}/><div><strong>{url?Math.max(0,count-1):'—'}</strong><small>Transitions · {transition}s each</small></div></div>{url?<a className="dj-download" href={url} download="MixMaster_AI_Nonstop.mp3"><Download size={18}/> Download MP3</a>:<button className="dj-download" disabled><Download size={18}/> {activeJob?'Rendering mix':'No mix yet'}</button>}</aside>
          </section>
          <div className="dj-console-grid">
            <section className="dj-console-card"><div className="dj-console-title"><SlidersHorizontal size={22}/><div><h3>Mastering</h3><p>Final polish for your exported mix.</p></div></div>{masteringResult?<><div className="dj-master-body"><div><span className="dj-card-label">PRESET</span><strong className="dj-preset">{masteringResult.preset}</strong></div><div className="dj-gauge"><div className="dj-gauge-ring"><strong>{masteringResult.target_lufs===null?'Off':masteringResult.target_lufs}</strong><small>LUFS</small></div><span>Target loudness</span></div><div className="dj-gauge"><div className="dj-gauge-ring"><strong>{masteringResult.true_peak_limit_dbtp===null?'Off':masteringResult.true_peak_limit_dbtp}</strong><small>dBTP</small></div><span>Peak ceiling</span></div></div><p className="dj-disclaimer">Export settings · not post-encode measurements</p></>:<p className="dj-no-data">Mastering settings will appear after rendering.</p>}</section>
            <section className="dj-console-card"><div className="dj-console-title"><Activity size={22}/><div><h3>Audio Signal Check</h3><p>Pre-limiter technical measurements.</p></div></div>{metrics?<div className="dj-signal-rows"><div><span>Peak amplitude</span><strong>{metrics.peak.toFixed(3)}</strong><Check size={16}/></div><div><span>RMS level</span><strong>{metrics.rms.toFixed(3)}</strong><Check size={16}/></div><div><span>Near-silence</span><strong>{(metrics.nearSilence*100).toFixed(1)}%</strong><Check size={16}/></div><div><span>Clipping risk</span><strong>{metrics.clippingRisk?'Review mix':'Not detected'}</strong><Check size={16}/></div></div>:<p className="dj-no-data">Audio checks will appear after rendering.</p>}</section>
            <section className="dj-console-card"><div className="dj-console-title"><Sparkles size={22}/><div><h3>Transition Review</h3><p>Automated crossfade analysis.</p></div></div>{transitionChecks.length?<div className="dj-transition-summary"><div className="dj-transition-number"><strong>{transitionChecks.length}</strong><span>transitions checked</span></div><div className="dj-transition-meta"><div><Check size={16}/> Candidate crossfades scored</div><div><Check size={16}/> Loudness gaps analyzed</div><div><Check size={16}/> {transitionChecks.reduce((n,t)=>n+t.attempts,0)} candidates evaluated</div></div></div>:<p className="dj-no-data">Transition checks will appear after rendering.</p>}<p className="dj-disclaimer">Proxy scores are not audible-quality ratings.</p></section>
          </div>
          <div className="dj-bottom-grid"><section className="dj-console-card dj-track-list"><div className="dj-console-title"><ListMusic size={22}/><div><h3>Track List &amp; Transitions</h3><p>Source songs and automated transition analysis.</p></div></div>{transitionChecks.length?<div className="dj-transition-list">{transitionChecks.map((t,i)=><div key={i}><span className="dj-track-index">{String(i+1).padStart(2,'0')}</span><div className="dj-mini-bars" aria-hidden="true">{Array.from({length:13},(_,j)=><i key={j} style={{height:6+Math.abs(Math.sin(j*1.7+i))*19}}/>)}</div><strong title={t.from}>{t.from}</strong><ArrowRight size={15}/><strong title={t.to}>{t.to}</strong><small>{t.proxy_score}/100 proxy · {t.loudness_gap_db} dB gap</small></div>)}</div>:<p className="dj-no-data">Create a mix to view transition details. A precise track timeline is not yet available from the renderer.</p>}</section><section className="dj-console-card dj-details"><div className="dj-console-title"><Settings2 size={22}/><div><h3>Mix Details</h3><p>Export and rhythm settings.</p></div></div><div className="dj-detail-row"><span>Kick Beat</span><strong>{kickResult?.enabled?'Enabled':'Off'}</strong></div><div className="dj-detail-row"><span>Kick Source</span><strong>{kickResult?.source||kickResult?.style||'—'}</strong></div><div className="dj-detail-row"><span>Kick Strength</span><strong>{kickResult?.enabled?Math.round((kickResult.level||0)*100)+'%':'—'}</strong></div><div className="dj-detail-row"><span>Reference BPM</span><strong>{kickResult?.bpm||'—'}</strong></div><div className="dj-detail-row"><span>Export Format</span><strong>MP3</strong></div></section></div>
        </div>}
        {page === 'history' && <section className="panel history-panel" id="history"><div className="panel-heading"><div><h2><RotateCcw size={20}/> Mix History</h2><p>Completed mix metadata saved in this browser only. Audio is not retained.</p></div><button className="subtle" disabled={!history.length} onClick={() => { setHistory([]); try { localStorage.removeItem('mixmaster_history') } catch { /* Storage may be unavailable */ } }}>Clear</button></div>{history.length ? <div className="history-list">{history.map((item,i) => <div className="history-item" key={i}><strong>MixMaster AI Nonstop</strong><span>{item.tracks} tracks · {item.created}</span></div>)}</div> : <p className="history-empty">Your completed mixes will appear here.</p>}</section>}
        <footer><span>MixMaster AI · Development MVP · Experimental beat-phase alignment · Experimental phrase-aware transitions</span><span>Only upload audio you have permission to use.</span></footer>
      </div>
    </main>
  </div>
}
