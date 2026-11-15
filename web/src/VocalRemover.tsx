import { useEffect, useRef, useState } from 'react'
import { AudioLines, Download, FileAudio, LoaderCircle, MicOff, UploadCloud, X } from 'lucide-react'

const accepted = ['mp3','wav','flac','m4a','ogg','aac']
export default function VocalRemover() {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [output, setOutput] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)
  const outputRef = useRef<string | null>(null)
  useEffect(() => () => { controller.current?.abort(); if (outputRef.current) URL.revokeObjectURL(outputRef.current) }, [])
  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now()-started)/1000)), 1000)
    return () => window.clearInterval(timer)
  }, [busy])
  function select(next?: File) {
    if (!next) return
    if (!accepted.includes(next.name.split('.').pop()?.toLowerCase() || '') || next.size === 0 || next.size > 200*1024*1024) {
      setError('Choose a supported audio file between 1 byte and 200 MiB.')
      return
    }
    if (outputRef.current) URL.revokeObjectURL(outputRef.current)
    outputRef.current = null
    setOutput(null); setError(''); setFile(next)
  }
  async function extract() {
    if (!file || busy) return
    setBusy(true); setElapsed(0); setError('')
    const abort = new AbortController()
    controller.current = abort
    try {
      const data = new FormData()
      data.append('song', file)
      const response = await fetch('/api/vocal-remover/jobs', { method: 'POST', body: data, signal: abort.signal })
      if (!response.ok) {
        let detail = 'Unable to start vocal removal (' + response.status + ').'
        try { const body = await response.json(); if (typeof body.detail === 'string') detail = body.detail } catch { /* not JSON */ }
        throw new Error(detail)
      }
      const created: { id: string } = await response.json()
      if (!/^[a-f0-9]{32}$/.test(created.id)) throw new Error('Invalid processing job ID.')
      const jobId = created.id
      sessionStorage.setItem('mixmaster_vocal_job', jobId)
      while (!abort.signal.aborted) {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, 2500)
          abort.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Canceled')) }, { once: true })
        })
        const statusResponse = await fetch('/api/vocal-remover/jobs/' + jobId, { signal: abort.signal })
        if (!statusResponse.ok) throw new Error('Unable to check extraction status.')
        const status: { status: string; error?: string } = await statusResponse.json()
        if (status.status === 'failed') throw new Error(status.error || 'Vocal removal failed.')
        if (status.status === 'complete') {
          const downloadUrl = '/api/vocal-remover/jobs/' + jobId + '/download'
          if (outputRef.current) URL.revokeObjectURL(outputRef.current)
          outputRef.current = null
          setOutput(downloadUrl)
          sessionStorage.removeItem('mixmaster_vocal_job')
          break
        }
      }
    } catch (err) {
      if (abort.signal.aborted) setError('Stopped checking progress. The server may continue processing.')
      else setError(err instanceof Error ? err.message : 'Unable to remove vocals.')
    } finally { setBusy(false); controller.current = null }
  }
  return <div className="vocal-page">
    <section className="vocal-hero"><div className="vocal-eyebrow"><MicOff size={16}/> AI AUDIO SEPARATION</div><h2>Vocal <em>Remover.</em></h2><p>Separate the singing from your favorite track and keep the instrumental beat. Powered by AI stem separation.</p><div className="vocal-chips"><span>VOCAL ISOLATION</span><span>INSTRUMENTAL EXPORT</span><span>WAV QUALITY</span></div><div className="vocal-hero-disc" aria-hidden="true"><div><AudioLines size={46}/></div></div></section>
    <div className="vocal-grid"><section className="vocal-panel"><div className="vocal-panel-title"><UploadCloud size={22}/><div><h3>Upload a song</h3><p>Choose the audio you want to separate.</p></div></div>
      <input ref={input} type="file" accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,audio/*" className="hidden" onChange={e=>{select(e.target.files?.[0]);e.target.value=''}}/>
      <div className="vocal-drop" role="button" tabIndex={0} onClick={()=>!busy&&input.current?.click()} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&!busy){e.preventDefault();input.current?.click()}}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)select(e.dataTransfer.files[0])}}><FileAudio size={38}/><strong>Drop your audio here</strong><span>or click to browse your files</span><span className="vocal-file-types">MP3 · WAV · FLAC · M4A · OGG · AAC · Up to 200 MiB</span></div>
      {file&&<div className="vocal-file"><FileAudio size={21}/><div><strong>{file.name}</strong><small>{(file.size/1048576).toFixed(1)} MiB · Ready for extraction</small></div><button type="button" disabled={busy} onClick={()=>{setFile(null);setOutput(null);if(outputRef.current)URL.revokeObjectURL(outputRef.current);outputRef.current=null}} aria-label="Remove selected file"><X size={18}/></button></div>}
      <button className="vocal-action" type="button" disabled={!file||busy} onClick={extract}>{busy?<><LoaderCircle className="spin" size={19}/> Removing vocals…</>:<><MicOff size={19}/> Remove Vocals</>}</button>
      {busy&&<div className="vocal-processing" role="status">Separating vocals and instrumental… {Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,'0')} elapsed. Processing may take several minutes. <button type="button" onClick={()=>controller.current?.abort()}>Cancel</button></div>}
      {error&&<p className="vocal-error" role="alert">{error}</p>}
    </section>
    <section className="vocal-panel"><div className="vocal-panel-title"><AudioLines size={22}/><div><h3>Instrumental preview</h3><p>Listen to your track without lead vocals.</p></div></div>
      {output?<div className="vocal-result"><div className="vocal-result-disc"><AudioLines size={45}/></div><strong>Instrumental ready</strong><p>AI-separated accompaniment · WAV</p><audio controls src={output} aria-label="Instrumental audio preview"/><a className="vocal-action" href={output} download><Download size={19}/> Download Instrumental</a></div>:<div className="vocal-empty"><MicOff size={49}/><h3>Your instrumental will appear here</h3><p>Upload a song and select Remove Vocals to hear the result.</p></div>}
    </section></div><p className="vocal-note">AI separation is approximate: some vocal residue or instrumental artifacts may remain. Process audio you have permission to use.</p>
  </div>
}
