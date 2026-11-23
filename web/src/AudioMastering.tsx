import './styles/audio-mastering.css'
import { useEffect, useRef, useState } from 'react'
import { Activity, AudioLines, Check, ChevronRight, Download, FileAudio, Headphones, LoaderCircle, RotateCcw, SlidersHorizontal, Sparkles, UploadCloud, X } from 'lucide-react'

type Preset = 'balanced' | 'club' | 'streaming' | 'warm' | 'dynamic' | 'custom'
type ExportFormat = 'wav' | 'mp3' | 'flac'
type CompressionStyle = 'gentle' | 'medium' | 'strong'
type AudioMeasurements = { integrated_lufs: number | null; true_peak_dbtp: number | null; loudness_range_lu: number | null }
type Comparison = { before: AudioMeasurements; after: AudioMeasurements }
const formats = new Set(['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'])
const presets: { id: Preset; title: string; subtitle: string }[] = [
  { id: 'balanced', title: 'Balanced', subtitle: 'Natural, controlled tone' },
  { id: 'club', title: 'Loud / Club', subtitle: 'Punchier and louder' },
  { id: 'streaming', title: 'Streaming', subtitle: 'Target -14 LUFS / -1 dBTP' },
  { id: 'warm', title: 'Warm / Analog', subtitle: 'Rounder bass and softer highs' },
  { id: 'dynamic', title: 'Dynamic', subtitle: 'Preserve more musical contrast' },
  { id: 'custom', title: 'Custom', subtitle: 'Set loudness and EQ yourself' },
]
const presetTargets: Record<Preset, { loudness: number; ceiling: number }> = {
  balanced: { loudness: -14, ceiling: -1.5 },
  club: { loudness: -10, ceiling: -1 },
  streaming: { loudness: -14, ceiling: -1 },
  warm: { loudness: -16, ceiling: -1.5 },
  dynamic: { loudness: -17, ceiling: -2 },
  custom: { loudness: -14, ceiling: -1.5 },
}
function Slider({ label, value, onChange, min, max, step, unit, disabled = false }: {
  label: string; value: number; onChange: (value: number) => void
  min: number; max: number; step: number; unit: string; disabled?: boolean
}) {
  return <label className="master-slider"><span>{label}<strong>{value} {unit}</strong></span>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      onChange={e => onChange(Number(e.target.value))}/>
  </label>
}
export default function AudioMastering() {
  const [file, setFile] = useState<File | null>(null)
  const [preset, setPreset] = useState<Preset>('balanced')
  const [target, setTarget] = useState(-14)
  const [peak, setPeak] = useState(-1.5)
  const [bass, setBass] = useState(0)
  const [mid, setMid] = useState(0)
  const [presence, setPresence] = useState(0)
  const [treble, setTreble] = useState(0)
  const [compression, setCompression] = useState(false)
  const [compressionStyle, setCompressionStyle] = useState<CompressionStyle>('gentle')
  const [stereoWidth, setStereoWidth] = useState(100)
  const [highpass, setHighpass] = useState(0)
  const [limiter, setLimiter] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('wav')
  const [dragActive, setDragActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [output, setOutput] = useState<string | null>(null)
  const [completedFormat, setCompletedFormat] = useState<ExportFormat>('wav')
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    if (!busy) return
    const start = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [busy])

  function invalidateOutput() { setOutput(null); setComparison(null) }
  function choosePreset(next: Preset) { setPreset(next); invalidateOutput() }
  function select(next?: File) {
    if (!next || busy) return
    if (!formats.has(next.name.split('.').pop()?.toLowerCase() || '') || next.size === 0 || next.size > 200 * 1024 * 1024) {
      setError('Choose a supported audio file up to 200 MiB.')
      return
    }
    setFile(next); invalidateOutput(); setError('')
  }
  function resetAdvanced() {
    setMid(0); setPresence(0); setStereoWidth(100); setHighpass(0)
    setCompressionStyle('gentle'); setLimiter(false); invalidateOutput()
  }

  async function master() {
    if (!file || busy) return
    setBusy(true); setError(''); setElapsed(0); invalidateOutput()
    const controller = new AbortController()
    abort.current = controller
    try {
      const data = new FormData()
      data.append('song', file)
      data.append('preset', preset)
      data.append('target_lufs', String(target))
      data.append('true_peak', String(peak))
      data.append('bass_db', String(bass))
      data.append('mid_db', String(mid))
      data.append('presence_db', String(presence))
      data.append('treble_db', String(treble))
      data.append('compression', String(compression))
      data.append('compression_style', compressionStyle)
      data.append('stereo_width', String(stereoWidth))
      data.append('highpass_hz', String(highpass))
      data.append('limiter', String(limiter))
      data.append('output_format', exportFormat)
      const response = await fetch('/api/mastering/jobs', { method: 'POST', body: data, signal: controller.signal })
      if (!response.ok) {
        let detail = 'Unable to start mastering.'
        try { const body = await response.json(); if (typeof body.detail === 'string') detail = body.detail } catch { /* non-JSON response */ }
        throw new Error(detail)
      }
      const created: { id: string } = await response.json()
      if (!/^[a-f0-9]{32}$/.test(created.id)) throw new Error('Invalid mastering job ID.')
      while (!controller.signal.aborted) {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, 2000)
          controller.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Canceled')) }, { once: true })
        })
        const statusResponse = await fetch('/api/mastering/jobs/' + created.id, { signal: controller.signal })
        if (!statusResponse.ok) throw new Error('Unable to check mastering status.')
        const status: { status: string; error?: string; measurements?: Comparison | null; output_format?: ExportFormat } = await statusResponse.json()
        if (status.status === 'failed') throw new Error(status.error || 'Mastering failed.')
        if (status.status === 'complete') {
          setComparison(status.measurements || null)
          setCompletedFormat(status.output_format || exportFormat)
          setOutput('/api/mastering/jobs/' + created.id + '/download')
          break
        }
      }
    } catch (err) {
      setError(controller.signal.aborted
        ? 'Stopped checking progress. Server processing may continue.'
        : err instanceof Error ? err.message : 'Mastering failed.')
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  return <div className="master-page master-studio">
    <section className="master-hero">
      <div className="master-hero-copy">
        <div className="master-eyebrow"><span className="master-live-dot"/> MIXMASTER AI <span className="master-eyebrow-divider"/> MASTERING SUITE / 01</div>
        <h2>Give every sound<br/><em>its final form.</em></h2>
        <p>A beautifully precise finishing room for your music. Shape tone, refine dynamics, and create a master ready for the world.</p>
        <div className="master-hero-tags"><span><Check size={12}/> 6 SIGNATURE STYLES</span><span><Check size={12}/> 4-BAND EQ</span><span><Check size={12}/> STUDIO EXPORT</span></div>
      </div>
      <div className="master-hero-art" aria-hidden="true">
        <div className="master-art-orbit master-art-orbit-one"/><div className="master-art-orbit master-art-orbit-two"/>
        <div className="master-art-disc"><div className="master-art-disc-inner"><AudioLines size={39}/></div></div>
        <div className="master-art-wave">{Array.from({length: 37}, (_, i) => <i key={i} style={{height: `${15 + Math.abs(Math.sin(i * .47) * Math.cos(i * .19)) * 78}%`}}/>)}</div>
        <div className="master-art-caption">SONIC PRECISION <span>✦</span> CREATIVE FREEDOM</div>
      </div>
    </section>
    <div className="master-flow" aria-label="Mastering workflow">
      <div className="master-flow-step is-active"><span>01</span><div><strong>Import audio</strong><small>Choose your track</small></div></div>
      <ChevronRight size={16} aria-hidden="true"/>
      <div className={'master-flow-step' + (file ? ' is-active' : '')}><span>02</span><div><strong>Shape the sound</strong><small>Set your signature</small></div></div>
      <ChevronRight size={16} aria-hidden="true"/>
      <div className={'master-flow-step' + (output ? ' is-active' : '')}><span>03</span><div><strong>Listen & deliver</strong><small>Compare and export</small></div></div>
    </div>
    <div className="master-grid">
      <section className="master-panel master-workspace">
        <div className="master-section-kicker">01 / SOURCE AUDIO</div>
        <div className="master-panel-title"><span className="master-title-icon"><UploadCloud size={20}/></span><div><h3>Start with your sound</h3><p>Every great master begins with a great recording.</p></div></div>
        <input className="hidden" ref={picker} type="file" accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,audio/*"
          onChange={e => { select(e.target.files?.[0]); e.target.value = '' }}/>
        <div className={"master-drop" + (dragActive ? " is-dragging" : "")} role="button" aria-label="Choose an audio file to master" tabIndex={0} aria-disabled={busy} onClick={() => !busy && picker.current?.click()}
          onKeyDown={e => { if (!busy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); picker.current?.click() } }}
          onDragEnter={e => { e.preventDefault(); if (!busy) setDragActive(true) }}
          onDragLeave={e => { e.preventDefault(); setDragActive(false) }}
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); setDragActive(false); select(e.dataTransfer.files[0]) }}>
          <span className="master-drop-icon"><UploadCloud size={27}/></span><strong>{dragActive ? 'Release to import your track' : 'Drop your track into the studio'}</strong>
          <span>Drag & drop or <b>browse files</b> to get started</span><small>MP3 · WAV · FLAC · M4A · OGG · AAC &nbsp; / &nbsp; MAX 200 MiB</small>
        </div>
        {file && <div className="master-selected"><FileAudio size={20}/><div><strong>{file.name}</strong><small>{(file.size / 1048576).toFixed(1)} MiB</small></div>
          <button type="button" disabled={busy} onClick={() => { setFile(null); invalidateOutput() }} aria-label="Remove song"><X size={17}/></button></div>}

        <div className="master-subsection-head"><div><div className="master-section-kicker">02 / SOUND CHARACTER</div><h4 className="master-label">Choose your signature</h4><p>One starting point. Endless possibilities.</p></div><Sparkles size={19}/></div>
        <div className="master-presets">
          {presets.map(item => <button type="button" key={item.id}
            className={'master-preset' + (preset === item.id ? ' selected' : '')}
            onClick={() => choosePreset(item.id)} disabled={busy} aria-pressed={preset === item.id}>
            <span className="master-preset-top"><span className="master-preset-glyph" aria-hidden="true">{item.id === 'balanced' ? '◈' : item.id === 'club' ? '◉' : item.id === 'streaming' ? '≋' : item.id === 'warm' ? '◐' : item.id === 'dynamic' ? '⌁' : '✳'}</span>{preset === item.id && <Check size={14}/>}</span><strong>{item.title}</strong><small>{item.subtitle}</small>
          </button>)}
        </div>
        <p className="master-hint">Selected target: <strong>{preset === 'custom' ? target : presetTargets[preset].loudness} LUFS</strong> · true peak ceiling: <strong>{preset === 'custom' ? peak : presetTargets[preset].ceiling} dBTP</strong>. Targets are approximate.</p>

        {preset === 'custom' && <div className="master-controls">
          <h4 className="master-section-label">Custom mastering</h4>
          <Slider label="Target loudness" value={target} onChange={v => { setTarget(v); invalidateOutput() }} min={-20} max={-9} step={0.5} unit="LUFS" disabled={busy}/>
          <Slider label="True peak ceiling" value={peak} onChange={v => { setPeak(v); invalidateOutput() }} min={-3} max={-0.5} step={0.5} unit="dBTP" disabled={busy}/>
          <Slider label="Bass" value={bass} onChange={v => { setBass(v); invalidateOutput() }} min={-6} max={6} step={0.5} unit="dB" disabled={busy}/>
          <Slider label="Treble" value={treble} onChange={v => { setTreble(v); invalidateOutput() }} min={-6} max={6} step={0.5} unit="dB" disabled={busy}/>
          <label className="master-compression"><input type="checkbox" checked={compression} disabled={busy}
            onChange={e => { setCompression(e.target.checked); invalidateOutput() }}/> Enable compression</label>
        </div>}

        <details className="master-advanced">
          <summary><span className="master-advanced-summary-icon"><SlidersHorizontal size={18}/></span><span><strong>Advanced mastering</strong><small>Fine-tune the details that make your sound yours</small></span><span className="master-expand-indicator">+</span></summary>
          <div className="master-controls">
            <div className="master-advanced-top"><h4 className="master-section-label">Tone & stereo image</h4>
              <button type="button" disabled={busy} onClick={resetAdvanced}><RotateCcw size={13}/> Reset</button></div>
            <Slider label="Midrange (900 Hz)" value={mid} onChange={v => { setMid(v); invalidateOutput() }} min={-6} max={6} step={0.5} unit="dB" disabled={busy}/>
            <Slider label="Presence (3.5 kHz)" value={presence} onChange={v => { setPresence(v); invalidateOutput() }} min={-6} max={6} step={0.5} unit="dB" disabled={busy}/>
            <Slider label="Stereo width" value={stereoWidth} onChange={v => { setStereoWidth(v); invalidateOutput() }} min={0} max={150} step={5} unit="%" disabled={busy}/>
            <label className="master-select-field"><span>High-pass / rumble filter</span>
              <select disabled={busy} value={highpass} onChange={e => { setHighpass(Number(e.target.value)); invalidateOutput() }}>
                <option value={0}>Off</option><option value={25}>25 Hz</option><option value={40}>40 Hz</option><option value={60}>60 Hz</option><option value={80}>80 Hz</option>
              </select>
            </label>
            <h4 className="master-section-label">Dynamics</h4>
            <p className="master-hint">Compression intensity only affects presets with compression enabled. For Custom, turn on compression above.</p>
            <label className="master-select-field"><span>Compression intensity</span>
              <select disabled={busy} value={compressionStyle} onChange={e => { setCompressionStyle(e.target.value as CompressionStyle); invalidateOutput() }}>
                <option value="gentle">Gentle · 2:1</option><option value="medium">Medium · 3:1</option><option value="strong">Strong · 4:1</option>
              </select>
            </label>
            <label className="master-compression"><input type="checkbox" checked={limiter} disabled={busy}
              onChange={e => { setLimiter(e.target.checked); invalidateOutput() }}/> Additional sample-peak limiter</label>
            <p className="master-hint">The limiter is not a substitute for measured true-peak checks.</p>
          </div>
        </details>

        <div className="master-export-options">
          <div className="master-subsection-head"><div><div className="master-section-kicker">03 / DELIVERY</div><h4 className="master-label">Choose your format</h4><p>High-quality output, ready for your next destination.</p></div><Download size={19}/></div>
          <div className="master-format-options">
            {([
              ['wav', 'WAV', '24-bit lossless'],
              ['mp3', 'MP3', '320 kbps'],
              ['flac', 'FLAC', '24-bit lossless'],
            ] as const).map(([key, label, description]) =>
              <button key={key} type="button" className={exportFormat === key ? 'selected' : ''}
                onClick={() => { setExportFormat(key); invalidateOutput() }} disabled={busy}
                aria-pressed={exportFormat === key}><strong>{label}</strong><small>{description}</small></button>)}
          </div>
        </div>

        <button className="master-action master-main-action" disabled={!file || busy} onClick={() => void master()}>
          {busy ? <><LoaderCircle className="spin" size={19}/> Mastering your song…</> : <><Sparkles size={19}/> Create My Master <ChevronRight size={18}/></>}
        </button>
        {busy && <p className="master-status" role="status">Mastering in progress · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} elapsed <button onClick={() => abort.current?.abort()}>Stop checking</button></p>}
        {error && <p className="master-error" role="alert">{error}</p>}
      </section>

      <section className="master-panel master-monitor">
        <div className="master-section-kicker">MONITORING / A-B REFERENCE</div>
        <div className="master-panel-title"><span className="master-title-icon"><Headphones size={20}/></span><div><h3>The listening room</h3><p>Hear the difference. Trust your ears.</p></div></div>
        <div className="master-monitor-display" aria-hidden="true">
          <div className="master-monitor-display-head"><span><span className="master-live-dot"/> STEREO OUTPUT</span><span>{output ? 'MASTER READY' : 'AWAITING AUDIO'}</span></div>
          <div className="master-monitor-wave">{Array.from({length: 55}, (_, i) => <i key={i} style={{height: `${10 + Math.abs(Math.sin(i * .35) * Math.cos(i * .11)) * 85}%`}}/>)}</div>
          <div className="master-monitor-display-foot"><span>L</span><span>STEREO MONITOR</span><span>R</span></div>
        </div>
        {file && <div className="master-player"><div className="master-player-heading"><span className="master-player-letter">A</span><div><strong>Original mix</strong><small>Unprocessed reference</small></div></div><OriginalPlayer file={file}/></div>}
        {output ? <div className="master-player master-ready"><div className="master-player-heading"><span className="master-player-letter is-mastered">B</span><div><strong>Final master</strong><small>Processing complete · {completedFormat.toUpperCase()} export</small></div><Check size={18}/></div>
          <audio controls src={output} aria-label="Mastered song preview"/>
          <a className="master-action" href={output} download><Download size={18}/> Download {completedFormat.toUpperCase()}</a>
        </div> : <div className="master-placeholder"><span className="master-placeholder-icon"><Headphones size={31}/></span><h3>Your next sound starts here</h3><p>Import a track, choose your signature and hit Create My Master. Your finished audio will appear here.</p></div>}
      </section>
    </div>

    {comparison && <section className="master-panel master-comparison">
      <div className="master-section-kicker">THE NUMBERS BEHIND THE SOUND</div><div className="master-panel-title"><span className="master-title-icon"><Activity size={20}/></span><div><h3>Mastering insights</h3><p>Before & after measurements from FFmpeg EBU R128 analysis.</p></div></div>
      <div className="master-comparison-grid">
        {([
          ['Integrated loudness', 'integrated_lufs', 'LUFS', 'Higher (less negative) means louder overall'],
          ['True peak', 'true_peak_dbtp', 'dBTP', 'Closer to zero means less peak headroom'],
          ['Loudness range', 'loudness_range_lu', 'LU', 'Lower values mean less loudness variation'],
        ] as const).map(([label, key, unit, hint]) => <div className="master-metric" key={key}>
          <strong>{label}</strong>
          <div className="master-metric-values">
            <div><small>BEFORE</small><b>{comparison.before[key] === null ? '—' : comparison.before[key]} <em>{unit}</em></b></div>
            <span aria-hidden="true">→</span>
            <div><small>AFTER</small><b>{comparison.after[key] === null ? '—' : comparison.after[key]} <em>{unit}</em></b></div>
          </div><p>{hint}</p>
        </div>)}
      </div>
      {comparison.before.integrated_lufs !== null && comparison.after.integrated_lufs !== null &&
        <p className="master-comparison-summary">Overall loudness change: <strong>
          {(comparison.after.integrated_lufs - comparison.before.integrated_lufs) > 0 ? '+' : ''}
          {(comparison.after.integrated_lufs - comparison.before.integrated_lufs).toFixed(1)} LU
        </strong> (measured difference).</p>}
      <p className="master-footnote">Measurements describe loudness, peak level and dynamics, not subjective fidelity. Compare at matched playback volume.</p>
    </section>}
    <p className="master-footnote">Loudness targets are goals, not guaranteed measurements. Mastering cannot repair clipping or restore missing detail.</p>
  </div>
}
function OriginalPlayer({ file }: { file: File }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return <audio controls src={url || undefined} aria-label="Original song preview"/>
}
