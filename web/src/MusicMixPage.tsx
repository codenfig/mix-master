import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, Check, Download, FileAudio, Headphones, ListMusic, Music2, Play, Sparkles, UploadCloud, X } from 'lucide-react'
import './styles/music-mix.css'

type Track = { name: string; bpm: number; key: string; energy: number; duration: number }
type Analysis = { tracks: Track[]; order_indices: number[]; progression: string }
type Mode = 'build-up' | 'cool-down' | 'balanced' | 'wave'
const modes: { id: Mode; label: string; description: string; icon: string }[] = [
  { id: 'build-up', label: 'Build Up', description: 'Calm → energetic', icon: '▂▄▆█' },
  { id: 'cool-down', label: 'Cool Down', description: 'Energetic → calm', icon: '█▆▄▂' },
  { id: 'wave', label: 'Energy Wave', description: 'Low and high', icon: '∿∿' },
  { id: 'balanced', label: 'Balanced', description: 'Similar energy', icon: '▅▅▅▅' },
]
const time = (value: number) => {
  const seconds = Math.max(0, Math.round(value))
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}
const accepted = /\.(mp3|wav|flac|m4a|ogg|aac)$/i

export default function MusicMixPage() {
  const [files, setFiles] = useState<File[]>([])
  const [mode, setMode] = useState<Mode>('build-up')
  const [transition, setTransition] = useState(8)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [audio, setAudio] = useState<string | null>(null)
  const [busy, setBusy] = useState<'analyze' | 'render' | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => { controller.current?.abort() }, [])
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio) }, [audio])

  function reset() { setAnalysis(null); setAudio(null); setError('') }
  function addFiles(incoming: File[]) {
    setFiles(incoming)
    reset()
    if (input.current) input.current.value = ''
  }
  function payload() {
    const body = new FormData()
    files.forEach(file => body.append('songs', file))
    body.append('progression', mode)
    body.append('transition', String(transition))
    return body
  }
  async function run(action: 'analyze' | 'render') {
    const abort = new AbortController()
    controller.current = abort
    setBusy(action)
    setError('')
    try {
      const response = await fetch('/api/music-mix/' + action, { method: 'POST', body: payload(), signal: abort.signal })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { detail?: string }
        throw new Error(body.detail || 'Music Mix request failed (' + response.status + ')')
      }
      if (action === 'analyze') setAnalysis(await response.json() as Analysis)
      else setAudio(URL.createObjectURL(await response.blob()))
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError'))
        setError(err instanceof Error ? err.message : 'Music Mix failed')
    } finally {
      controller.current = null
      setBusy(null)
    }
  }
  const valid = files.length >= 2 && files.length <= 20 && files.every(f => accepted.test(f.name) && f.size > 0 && f.size <= 200 * 1024 * 1024)
  const ordered = analysis?.order_indices.map(i => analysis.tracks[i]) || []
  const maxEnergy = Math.max(0.00001, ...ordered.map(t => t.energy))
  const totalDuration = ordered.reduce((sum, track) => sum + track.duration, 0) - Math.max(0, ordered.length - 1) * transition
  const levels = ordered.map(t => Math.max(6, Math.round(t.energy / maxEnergy * 100)))
  const estimated = ordered.length > 0

  return <div className="music-mix-page">
    <header className="music-mix-hero">
      <div className="music-mix-hero-copy">
        <span className="music-mix-kicker"><Sparkles size={14}/> SMART AUDIO WORKFLOW</span>
        <h2>Music Mix <span>— Energy Flow</span></h2>
        <p>Combine multiple complete songs into one seamless mix, automatically arranged by energy.</p>
      </div>
      <div className="music-mix-hero-art" aria-hidden="true">
        <div className="music-mix-art-bars">{[22,38,26,58,43,75,49,91,64,100,76,54,83,46,65,32,48].map((height,i) => <i key={i} style={{height:height+'%'}}/>)}</div>
        <div className="music-mix-art-disc"><Headphones size={42}/></div>
      </div>
    </header>

    <div className="music-mix-steps" aria-label="Mix creation steps">
      {['Upload songs','Analyze energy','Arrange by energy','Create mix'].map((step,i) =>
        <div key={step} className="music-mix-step"><span>{i+1}</span><strong>{step}</strong>{i<3 && <ArrowRight size={15}/>}</div>)}
    </div>

    <div className="music-mix-setup">
      <section className="music-mix-upload">
        <div className={'music-mix-dropzone'+(dragging?' is-dragging':'')}
          role="button" tabIndex={busy? -1 : 0} aria-label="Upload 2 to 20 audio files"
          onClick={() => !busy && input.current?.click()}
          onKeyDown={e => { if ((e.key==='Enter'||e.key===' ')&&!busy) {e.preventDefault();input.current?.click()} }}
          onDragOver={e => {e.preventDefault();if(!busy)setDragging(true)}}
          onDragLeave={e => {e.preventDefault();setDragging(false)}}
          onDrop={e => {e.preventDefault();setDragging(false);if(!busy)addFiles(Array.from(e.dataTransfer.files))}}>
          <div className="music-mix-upload-icon"><UploadCloud size={30}/></div>
          <strong>Upload Multiple Songs</strong>
          <span>Drag and drop or click to select 2–20 audio files</span>
          <small>MP3 · WAV · FLAC · M4A · OGG · AAC</small>
          <input ref={input} type="file" multiple accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,audio/*"
            disabled={!!busy} onChange={e => addFiles(Array.from(e.target.files || []))} />
        </div>
        <div className="music-mix-file-heading"><span>{files.length} song{files.length===1?'':'s'} selected</span>{files.length>0 && <button disabled={!!busy} onClick={()=>addFiles([])}><X size={14}/> Clear</button>}</div>
        {files.length>0 && <div className="music-mix-files">{files.map((file,i)=><div key={i} className="music-mix-file"><FileAudio size={15}/><span title={file.name}>{file.name}</span><small>{(file.size/1024/1024).toFixed(1)} MB</small></div>)}</div>}
        {!valid && files.length>0 && <p className="music-mix-validation">Choose 2–20 supported audio files, up to 200 MB each.</p>}
      </section>

      <section className="music-mix-controls">
        <h3>Energy Progression</h3>
        <div className="music-mix-modes">{modes.map(option=><button key={option.id}
          className={'music-mix-mode'+(mode===option.id?' selected':'')}
          aria-pressed={mode===option.id} disabled={!!busy}
          onClick={()=>{setMode(option.id);reset()}}>
          <span className="music-mix-mode-icon">{option.icon}</span>
          <strong>{option.label}</strong><small>{option.description}</small>
          {mode===option.id && <Check className="music-mix-mode-check" size={14}/>}
        </button>)}</div>
        <div className="music-mix-slider-heading"><label htmlFor="music-mix-transition">Crossfade Transition</label><strong>{transition} seconds</strong></div>
        <input id="music-mix-transition" className="music-mix-slider" type="range" min={4} max={32}
          value={transition} disabled={!!busy} onChange={e=>{setTransition(Number(e.target.value));reset()}}/>
        <div className="music-mix-slider-labels"><span>4 seconds</span><span>32 seconds</span></div>
      </section>
    </div>

    <section className="music-mix-order">
      <div className="music-mix-section-title"><div><h3><Activity size={20}/> Song Order <span>(by Energy)</span></h3>
        <p>{estimated ? ordered.length+' songs arranged for '+modes.find(m=>m.id===mode)?.label : 'Analyze your uploaded songs to see their energy-based order'}</p></div>
        {estimated && <span className="music-mix-count">{ordered.length} tracks</span>}
      </div>
      {estimated ? <div className="music-mix-track-row">{ordered.map((track,i)=><div className="music-mix-track-wrap" key={i}>
        <div className="music-mix-track"><div className="music-mix-track-art"><Music2 size={28}/><b>{i+1}</b></div>
          <div className="music-mix-track-body"><strong title={track.name}>{track.name}</strong>
            <small>{Math.round(track.bpm)} BPM · {time(track.duration)}</small>
            <div className="music-mix-energy-label"><span>Relative energy</span><span>{Math.round(track.energy/maxEnergy*100)}%</span></div>
            <div className="music-mix-energy-meter"><span style={{width:levels[i]+'%'}}/></div>
          </div></div>
        {i<ordered.length-1 && <ArrowRight className="music-mix-track-arrow" size={18}/>}
      </div>)}</div>
      : <div className="music-mix-empty"><ListMusic size={28}/><p>Your energy-sorted songs will appear here.</p><span>Upload at least two songs, then select Analyze energy &amp; arrange.</span></div>}
    </section>

    <section className="music-mix-timeline">
      <div className="music-mix-section-title"><div><h3>Mix Timeline <span>(Complete Mix)</span></h3>
        <p>{estimated ? 'Estimated song sequence with '+transition+'-second crossfades' : 'Your complete energy journey will appear after analysis'}</p></div>
        {estimated && <span className="music-mix-count">≈ {time(Math.max(0,totalDuration))}</span>}
      </div>
      <div className="music-mix-timeline-chart" aria-label="Energy progression timeline">
        {estimated ? <div className="music-mix-timeline-segments">{ordered.map((track,i)=><div className="music-mix-timeline-segment" key={i}
          style={{flex:Math.max(1,track.duration), '--level':levels[i]+'%'} as React.CSSProperties}>
          <div className="music-mix-timeline-fill"/><span>Song {i+1}</span>
        </div>)}</div> : <div className="music-mix-timeline-placeholder">{[24,36,48,62,78,94].map((h,i)=><i key={i} style={{height:h+'%'}}/>)}</div>}
        <div className="music-mix-timeline-axis"><span>0:00</span><span>{estimated ? time(Math.max(0,totalDuration)) : 'End of mix'}</span></div>
      </div>
    </section>

    <div className="music-mix-actions">
      <button className="music-mix-analyze" disabled={!valid || !!busy} onClick={()=>void run('analyze')}>
        <Activity size={18}/>{busy==='analyze'?'Analyzing songs…':'Analyze energy & arrange'}
      </button>
      <button className="music-mix-create" disabled={!valid || !!busy} onClick={()=>void run('render')}>
        <Music2 size={20}/>{busy==='render'?'Creating your mix…':'Create Music Mix'}<ArrowRight size={18}/>
      </button>
      {busy && <button className="music-mix-cancel" onClick={()=>controller.current?.abort()}>Cancel request</button>}
    </div>
    {error && <p className="music-mix-error" role="alert">{error}</p>}
    {audio && <section className="music-mix-result"><h3><Check size={20}/> Your Music Mix is ready</h3>
      <audio controls src={audio}/><a className="music-mix-download" href={audio} download="Music_Mix.mp3"><Download size={18}/> Download Music Mix MP3</a></section>}
    <p className="music-mix-footnote">Audio is processed by your local server. Energy is estimated from loudness. Only mix audio you have permission to use.</p>
  </div>
}
