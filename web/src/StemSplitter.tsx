import { useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import { AudioLines, Download, FileAudio, LoaderCircle, Music2, UploadCloud, X } from 'lucide-react'

const stems = [
  { key: 'vocals', label: 'Vocals', description: 'Lead and backing voices', icon: '🎙️' },
  { key: 'drums', label: 'Drums', description: 'Kick, snare and percussion', icon: '🥁' },
  { key: 'bass', label: 'Bass', description: 'Low-end instruments', icon: '🎸' },
  { key: 'other', label: 'Other', description: 'Melodies, synths and instruments', icon: '🎹' },
] as const
const extensions = new Set(['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'])

export default function StemSplitter() {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [zipUrl, setZipUrl] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const activeUrls = useRef<string[]>([])
  const clearResults = () => { activeUrls.current.forEach(url => URL.revokeObjectURL(url)); activeUrls.current = []; setUrls({}); setZipUrl(null) }
  useEffect(() => () => { abort.current?.abort(); activeUrls.current.forEach(url => URL.revokeObjectURL(url)) }, [])
  useEffect(() => { if (!busy) return; const start = Date.now(); const id = window.setInterval(() => setElapsed(Math.floor((Date.now()-start)/1000)), 1000); return () => window.clearInterval(id) }, [busy])
  function select(next?: File) {
    if (!next || busy) return
    if (!extensions.has(next.name.split('.').pop()?.toLowerCase() || '') || next.size === 0 || next.size > 200*1024*1024) { setError('Choose a supported audio file up to 200 MiB.'); return }
    clearResults(); setError(''); setFile(next)
  }
  async function split() {
    if (!file || busy) return
    clearResults(); setError(''); setBusy(true); setElapsed(0)
    const controller = new AbortController()
    abort.current = controller
    try {
      const data = new FormData(); data.append('song', file)
      const response = await fetch('/api/stem-splitter', { method: 'POST', body: data, signal: controller.signal })
      if (!response.ok) {
        let detail = 'Stem separation failed (' + response.status + ').'
        try { const body = await response.json(); if (typeof body.detail === 'string') detail = body.detail } catch { /* not JSON */ }
        throw new Error(detail)
      }
      const blob = await response.blob()
      if (!blob.size) throw new Error('The server returned an empty ZIP.')
      const zip = await JSZip.loadAsync(blob)
      const stemUrls: Record<string, string> = {}
      for (const stem of stems) {
        const entry = zip.file(stem.key + '.wav')
        if (!entry) throw new Error('Missing ' + stem.label + ' stem in the ZIP.')
        const audio = await entry.async('blob')
        const url = URL.createObjectURL(new Blob([audio], { type: 'audio/wav' }))
        activeUrls.current.push(url)
        stemUrls[stem.key] = url
      }
      const download = URL.createObjectURL(blob)
      activeUrls.current.push(download)
      setZipUrl(download); setUrls(stemUrls)
    } catch (err) { clearResults(); setError(controller.signal.aborted ? 'Stem splitting canceled.' : err instanceof Error ? err.message : 'Unable to split the audio.') }
    finally { abort.current = null; setBusy(false) }
  }
  const baseName = (file?.name || 'MixMaster').replace(/\.[^.]+$/, '')
  return <div className="stem-page">
    <section className="stem-hero"><div className="stem-eyebrow"><AudioLines size={16}/> AI SOURCE SEPARATION</div><h2>Stem <em>Splitter.</em></h2><p>Unmix your music into four separate layers. Preview vocals, drums, bass and instruments independently.</p><div className="stem-hero-pills"><span>4 STEMS</span><span>AI-POWERED</span><span>WAV EXPORT</span></div><div className="stem-hero-vinyl" aria-hidden="true"><Music2 size={55}/></div></section>
    <section className="stem-panel"><div className="stem-panel-heading"><UploadCloud size={23}/><div><h3>Choose your track</h3><p>Upload one song to begin separation.</p></div></div>
      <input ref={picker} type="file" className="hidden" accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,audio/*" onChange={e => { select(e.target.files?.[0]); e.target.value = '' }}/>
      <div className="stem-drop" role="button" tabIndex={0} onClick={()=>!busy&&picker.current?.click()} onKeyDown={e=>{if(!busy&&(e.key==='Enter'||e.key===' ')){e.preventDefault();picker.current?.click()}}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();select(e.dataTransfer.files[0])}}><FileAudio size={34}/><strong>Drop your song here</strong><span>or click to browse · MP3, WAV, FLAC, M4A, OGG, AAC · Max 200 MiB</span></div>
      {file&&<div className="stem-selected"><FileAudio size={20}/><div><strong>{file.name}</strong><small>{(file.size/1048576).toFixed(1)} MiB</small></div><button disabled={busy} aria-label="Remove file" onClick={()=>{setFile(null);clearResults()}}><X size={17}/></button></div>}
      <button type="button" className="stem-primary" disabled={!file||busy} onClick={split}>{busy?<><LoaderCircle className="spin" size={18}/> Separating audio…</>:<><AudioLines size={18}/> Split Into 4 Stems</>}</button>
      {busy&&<div className="stem-status" role="status">Processing for {Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,'0')} · This can take several minutes. <button onClick={()=>abort.current?.abort()}>Cancel</button></div>}
      {error&&<p className="stem-error" role="alert">{error}</p>}
    </section>
    <div className="stem-results-heading"><div><h3>Your separated stems</h3><p>Play each part or download individual WAV tracks.</p></div>{zipUrl&&<a className="stem-download-all" href={zipUrl} download={baseName+'_stems.zip'}><Download size={17}/> Download All (ZIP)</a>}</div>
    <div className="stem-results">{stems.map(stem=><section className="stem-card" key={stem.key}><div className="stem-card-top"><span className="stem-card-emoji">{stem.icon}</span><div><h4>{stem.label}</h4><p>{stem.description}</p></div></div>{urls[stem.key]?<><audio controls preload="none" src={urls[stem.key]} aria-label={stem.label+' preview'}/><a href={urls[stem.key]} download={baseName+'_'+stem.key+'.wav'} className="stem-stem-download"><Download size={16}/> Download {stem.label}</a></>:<div className="stem-awaiting"><AudioLines size={19}/> Awaiting extraction</div>}</section>)}</div>
    <p className="stem-footnote">AI stem separation is approximate. Some sounds may bleed between stems. Use only music you have permission to process.</p>
  </div>
}
