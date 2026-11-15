import './styles/audio-mastering.css'
import { useEffect, useRef, useState } from 'react'
import { AudioLines, Download, FileAudio, LoaderCircle, SlidersHorizontal, Sparkles, UploadCloud, X } from 'lucide-react'

type Preset = 'balanced' | 'club' | 'custom'
type AudioMeasurements = { integrated_lufs: number | null; true_peak_dbtp: number | null; loudness_range_lu: number | null }
type Comparison = { before: AudioMeasurements; after: AudioMeasurements }
const formats = new Set(['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'])
export default function AudioMastering() {
  const [file, setFile] = useState<File | null>(null)
  const [preset, setPreset] = useState<Preset>('balanced')
  const [target, setTarget] = useState(-14)
  const [peak, setPeak] = useState(-1.5)
  const [bass, setBass] = useState(0)
  const [treble, setTreble] = useState(0)
  const [compression, setCompression] = useState(false)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [output, setOutput] = useState<string | null>(null)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => { if (!busy) return; const start = Date.now(); const timer = window.setInterval(() => setElapsed(Math.floor((Date.now()-start)/1000)), 1000); return () => window.clearInterval(timer) }, [busy])
  function select(next?: File) {
    if (!next || busy) return
    if (!formats.has(next.name.split('.').pop()?.toLowerCase() || '') || next.size === 0 || next.size > 200*1024*1024) { setError('Choose a supported audio file up to 200 MiB.'); return }
    setFile(next); setOutput(null); setComparison(null); setError('')
  }
  async function master() {
    if (!file || busy) return
    setBusy(true); setError(''); setElapsed(0); setOutput(null); setComparison(null)
    const controller = new AbortController(); abort.current = controller
    try {
      const data = new FormData()
      data.append('song', file); data.append('preset', preset)
      data.append('target_lufs', String(target)); data.append('true_peak', String(peak))
      data.append('bass_db', String(bass)); data.append('treble_db', String(treble))
      data.append('compression', String(compression))
      const response = await fetch('/api/mastering/jobs', { method: 'POST', body: data, signal: controller.signal })
      if (!response.ok) { let detail = 'Unable to start mastering.'; try { const body = await response.json(); if (typeof body.detail === 'string') detail = body.detail } catch { /* ignore */ } throw new Error(detail) }
      const created: { id: string } = await response.json()
      if (!/^[a-f0-9]{32}$/.test(created.id)) throw new Error('Invalid mastering job ID.')
      while (!controller.signal.aborted) {
        await new Promise<void>((resolve, reject) => { const timer = window.setTimeout(resolve, 2000); controller.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Canceled')) }, { once: true }) })
        const statusResponse = await fetch('/api/mastering/jobs/' + created.id, { signal: controller.signal })
        if (!statusResponse.ok) throw new Error('Unable to check mastering status.')
        const status: { status: string; error?: string; measurements?: Comparison | null } = await statusResponse.json()
        if (status.status === 'failed') throw new Error(status.error || 'Mastering failed.')
        if (status.status === 'complete') { setComparison(status.measurements || null); setOutput('/api/mastering/jobs/' + created.id + '/download'); break }
      }
    } catch (err) { setError(controller.signal.aborted ? 'Stopped checking progress. Server processing may continue.' : err instanceof Error ? err.message : 'Mastering failed.') }
    finally { setBusy(false); abort.current = null }
  }
  return <div className="master-page">
    <section className="master-hero"><div className="master-eyebrow"><Sparkles size={16}/> PROFESSIONAL AUDIO FINISHING</div><h2>Audio <em>Mastering.</em></h2><p>Polish your sound, balance the tone and achieve powerful loudness while controlling peaks.</p><div className="master-hero-tags"><span>LOUDNESS NORMALIZATION</span><span>EQ & DYNAMICS</span><span>WAV EXPORT</span></div><div className="master-hero-icon" aria-hidden="true"><AudioLines size={55}/></div></section>
    <div className="master-grid"><section className="master-panel"><div className="master-panel-title"><UploadCloud size={22}/><div><h3>Upload your song</h3><p>Select one song to master.</p></div></div>
      <input className="hidden" ref={picker} type="file" accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,audio/*" onChange={e=>{select(e.target.files?.[0]);e.target.value=''}}/>
      <div className="master-drop" role="button" tabIndex={0} onClick={()=>!busy&&picker.current?.click()} onKeyDown={e=>{if(!busy&&(e.key==='Enter'||e.key===' ')){e.preventDefault();picker.current?.click()}}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();select(e.dataTransfer.files[0])}}><FileAudio size={35}/><strong>Drop your audio here</strong><span>or click to browse · MP3, WAV, FLAC, M4A, OGG, AAC · 200 MiB max</span></div>
      {file&&<div className="master-selected"><FileAudio size={20}/><div><strong>{file.name}</strong><small>{(file.size/1048576).toFixed(1)} MiB</small></div><button type="button" disabled={busy} onClick={()=>{setFile(null);setOutput(null);setComparison(null)}} aria-label="Remove song"><X size={17}/></button></div>}
      <h4 className="master-label">Mastering style</h4><div className="master-presets">{([['balanced','Balanced','Natural, controlled sound'],['club','Loud / Club','Punchier and louder'],['custom','Custom','Fine-tune your master']] as const).map(([key,title,subtitle])=><button key={key} className={'master-preset'+(preset===key?' selected':'')} onClick={()=>setPreset(key)} disabled={busy}><strong>{title}</strong><small>{subtitle}</small></button>)}</div>
      {preset==='custom'&&<div className="master-controls">{([['Target loudness',target,setTarget,-20,-9,0.5,'LUFS'],['True peak ceiling',peak,setPeak,-3,-0.5,0.5,'dBTP'],['Bass',bass,setBass,-6,6,0.5,'dB'],['Treble',treble,setTreble,-6,6,0.5,'dB']] as const).map(([label,value,set,min,max,step,unit])=><label key={label}><span>{label}<strong>{value} {unit}</strong></span><input type="range" min={min} max={max} step={step} value={value} disabled={busy} onChange={e=>set(Number(e.target.value))}/></label>)}<label className="master-compression"><input type="checkbox" checked={compression} disabled={busy} onChange={e=>setCompression(e.target.checked)}/> Gentle dynamic compression</label></div>}
      <button className="master-action" disabled={!file||busy} onClick={master}>{busy?<><LoaderCircle className="spin" size={19}/> Mastering your song…</>:<><SlidersHorizontal size={19}/> Master My Song</>}</button>
      {busy&&<p className="master-status" role="status">Mastering in progress · {Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,'0')} elapsed <button onClick={()=>abort.current?.abort()}>Stop checking</button></p>}
      {error&&<p className="master-error" role="alert">{error}</p>}
    </section>
    <section className="master-panel"><div className="master-panel-title"><AudioLines size={22}/><div><h3>Listen & export</h3><p>Compare the original with your mastered version.</p></div></div>
      {file&&<div className="master-player"><strong>Original song</strong><OriginalPlayer file={file}/></div>}
      {output?<div className="master-player master-ready"><strong>Mastered song</strong><span>Processing complete · 24-bit WAV</span><audio controls src={output}/><a className="master-action" href={output} download><Download size={18}/> Download Mastered WAV</a></div>:<div className="master-placeholder"><AudioLines size={49}/><h3>Your mastered song will appear here</h3><p>Upload a track and select your mastering style to begin.</p></div>}
    </section></div>
    {comparison&&<section className="master-panel master-comparison">
      <div className="master-panel-title"><AudioLines size={22}/><div><h3>Before vs. After — Sound Measurements</h3><p>Measured across the full song using FFmpeg EBU R128 analysis.</p></div></div>
      <div className="master-comparison-grid">
        {([['Integrated loudness','integrated_lufs','LUFS','Higher (less negative) means louder overall'],['True peak','true_peak_dbtp','dBTP','Higher (closer to 0) means less peak headroom'],['Loudness range','loudness_range_lu','LU','Lower values indicate less loudness variation']] as const).map(([label,key,unit,hint])=><div className="master-metric" key={key}>
          <strong>{label}</strong>
          <div className="master-metric-values"><div><small>BEFORE</small><b>{comparison.before[key]===null?'—':comparison.before[key]} <em>{unit}</em></b></div><span aria-hidden="true">→</span><div><small>AFTER</small><b>{comparison.after[key]===null?'—':comparison.after[key]} <em>{unit}</em></b></div></div>
          <p>{hint}</p>
        </div>)}
      </div>
      {comparison.before.integrated_lufs!==null&&comparison.after.integrated_lufs!==null&&<p className="master-comparison-summary">Overall loudness change: <strong>{(comparison.after.integrated_lufs-comparison.before.integrated_lufs)>0?'+':''}{(comparison.after.integrated_lufs-comparison.before.integrated_lufs).toFixed(1)} LU</strong> (measured difference).</p>}
      <p className="master-footnote">These metrics describe loudness and dynamics, not subjective fidelity, clarity or distortion. Compare the players at matched listening volume to judge sound quality.</p>
    </section>}
    <p className="master-footnote">Loudness targets are goals, not guaranteed measurements. Highly compressed source audio may not benefit from further loudness processing. Mastering cannot repair clipped recordings.</p>
  </div>
}
function OriginalPlayer({file}:{file:File}) {
  const [url,setUrl] = useState('')
  useEffect(()=>{const next=URL.createObjectURL(file);setUrl(next);return ()=>URL.revokeObjectURL(next)},[file])
  return <audio controls src={url||undefined} aria-label="Original song preview"/>
}
