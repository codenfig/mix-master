import './styles/audio-mastering.css'
import { useEffect, useRef, useState } from 'react'
import { Activity, AudioLines, Download, FileAudio, LoaderCircle, RotateCcw, SlidersHorizontal, Sparkles, UploadCloud, X } from 'lucide-react'

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

  return <div className="master-page">
    <section className="master-hero">
      <div className="master-eyebrow"><Sparkles size={16}/> PROFESSIONAL AUDIO FINISHING</div>
      <h2>Audio <em>Mastering.</em></h2>
      <p>Polish tonal balance, control dynamics and export a carefully measured master.</p>
      <div className="master-hero-tags"><span>6 MASTERING STYLES</span><span>4-BAND EQ</span><span>STEREO & DYNAMICS</span><span>WAV · MP3 · FLAC</span></div>
      <div className="master-hero-icon" aria-hidden="true"><AudioLines size={55}/></div>
    </section>

    <div className="master-grid">
      <section className="master-panel">
        <div className="master-panel-title"><UploadCloud size={22}/><div><h3>Upload your song</h3><p>Upload one audio file to master.</p></div></div>
        <input className="hidden" ref={picker} type="file" accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,audio/*"
          onChange={e => { select(e.target.files?.[0]); e.target.value = '' }}/>
        <div className="master-drop" role="button" tabIndex={0} onClick={() => !busy && picker.current?.click()}
          onKeyDown={e => { if (!busy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); picker.current?.click() } }}
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); select(e.dataTransfer.files[0]) }}>
          <FileAudio size={35}/><strong>Drop your audio here</strong>
          <span>or click to browse · MP3, WAV, FLAC, M4A, OGG, AAC · 200 MiB max</span>
        </div>
        {file && <div className="master-selected"><FileAudio size={20}/><div><strong>{file.name}</strong><small>{(file.size / 1048576).toFixed(1)} MiB</small></div>
          <button type="button" disabled={busy} onClick={() => { setFile(null); invalidateOutput() }} aria-label="Remove song"><X size={17}/></button></div>}

        <h4 className="master-label">Mastering style</h4>
        <div className="master-presets">
          {presets.map(item => <button type="button" key={item.id}
            className={'master-preset' + (preset === item.id ? ' selected' : '')}
            onClick={() => choosePreset(item.id)} disabled={busy} aria-pressed={preset === item.id}>
            <strong>{item.title}</strong><small>{item.subtitle}</small>
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
          <summary><SlidersHorizontal size={18}/> Advanced mastering controls</summary>
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
          <h4 className="master-label">Export format</h4>
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

        <button className="master-action" disabled={!file || busy} onClick={() => void master()}>
          {busy ? <><LoaderCircle className="spin" size={19}/> Mastering your song…</> : <><SlidersHorizontal size={19}/> Master My Song</>}
        </button>
        {busy && <p className="master-status" role="status">Mastering in progress · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} elapsed <button onClick={() => abort.current?.abort()}>Stop checking</button></p>}
        {error && <p className="master-error" role="alert">{error}</p>}
      </section>

      <section className="master-panel">
        <div className="master-panel-title"><AudioLines size={22}/><div><h3>Listen & export</h3><p>Compare the original and mastered versions.</p></div></div>
        {file && <div className="master-player"><strong>Original song</strong><OriginalPlayer file={file}/></div>}
        {output ? <div className="master-player master-ready"><strong>Mastered song</strong><span>Processing complete · {completedFormat.toUpperCase()} export</span>
          <audio controls src={output} aria-label="Mastered song preview"/>
          <a className="master-action" href={output} download><Download size={18}/> Download {completedFormat.toUpperCase()}</a>
        </div> : <div className="master-placeholder"><AudioLines size={49}/><h3>Your mastered song will appear here</h3><p>Select a song and a mastering style to begin.</p></div>}
      </section>
    </div>

    {comparison && <section className="master-panel master-comparison">
      <div className="master-panel-title"><Activity size={22}/><div><h3>Before vs. After — Sound Measurements</h3><p>Full-song measurements from FFmpeg EBU R128 analysis.</p></div></div>
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
