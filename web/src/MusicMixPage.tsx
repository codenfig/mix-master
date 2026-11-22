import { useEffect, useState } from 'react'

type Track = { name: string; bpm: number; key: string; energy: number; duration: number }
type Analysis = { tracks: Track[]; order_indices: number[]; progression: string }
type Mode = 'build-up' | 'cool-down' | 'balanced' | 'wave'

export default function MusicMixPage() {
  const [files, setFiles] = useState<File[]>([])
  const [mode, setMode] = useState<Mode>('build-up')
  const [transition, setTransition] = useState(8)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [audio, setAudio] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [controller, setController] = useState<AbortController | null>(null)

  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio) }, [audio])
  function reset() { setAnalysis(null); setAudio(null); setError('') }
  function data() {
    const body = new FormData()
    files.forEach(file => body.append('songs', file))
    body.append('progression', mode)
    body.append('transition', String(transition))
    return body
  }
  async function run(action: 'analyze' | 'render') {
    const abort = new AbortController()
    setController(abort)
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/music-mix/' + action, { method: 'POST', body: data(), signal: abort.signal })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { detail?: string }
        throw new Error(body.detail || 'Music Mix request failed (' + response.status + ')')
      }
      if (action === 'analyze') setAnalysis(await response.json() as Analysis)
      else setAudio(URL.createObjectURL(await response.blob()))
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError'))
        setError(err instanceof Error ? err.message : 'Music Mix failed')
    } finally { setBusy(false); setController(null) }
  }
  const valid = files.length >= 2 && files.length <= 20 && files.every(f =>
    /\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name) && f.size > 0 && f.size <= 200 * 1024 * 1024)
  const ordered = analysis?.order_indices.map(i => analysis.tracks[i]) || []
  const maxEnergy = Math.max(0.00001, ...ordered.map(t => t.energy))
  return <div className="panel" style={{maxWidth:900, margin:'0 auto', padding:24, display:'grid', gap:20}}>
    <div><h2>Music Mix — Energy Flow</h2><p>Combine complete songs into one continuous listening journey. Separate from DJ Studio: no beatmatching or live decks.</p></div>
    <label style={{display:'grid', gap:8}}>Upload 2–20 songs
      <input type="file" multiple accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,audio/*"
        disabled={busy} onChange={e => { setFiles(Array.from(e.target.files || [])); reset() }} />
    </label>
    <div aria-live="polite">{files.length} songs selected {files.length > 20 ? '(maximum 20)' : ''}</div>
    <label style={{display:'grid', gap:8}}>Energy progression
      <select value={mode} disabled={busy} onChange={e => {setMode(e.target.value as Mode); reset()}}>
        <option value="build-up">Build Up — calm to energetic (default)</option>
        <option value="cool-down">Cool Down — energetic to calm</option>
        <option value="balanced">Balanced — similar energy together</option>
        <option value="wave">Energy Wave — alternate low and high</option>
      </select>
    </label>
    <label>Crossfade transition: {transition} seconds
      <input type="range" min={4} max={32} value={transition} disabled={busy}
        onChange={e => {setTransition(Number(e.target.value)); reset()}} style={{display:'block',width:'100%'}}/>
    </label>
    <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
      <button className="action secondary" disabled={!valid || busy} onClick={() => void run('analyze')}>Analyze energy &amp; arrange</button>
      <button className="action primary" disabled={!valid || busy} onClick={() => void run('render')}>{busy ? 'Processing…' : 'Create Music Mix'}</button>
      {busy && <button className="action secondary" onClick={() => controller?.abort()}>Stop waiting</button>}
    </div>
    {error && <p role="alert" style={{color:'#ff8787'}}>{error}</p>}
    {ordered.length > 0 && <section aria-label="Energy-based song order"><h3>Suggested listening order</h3>
      <ol>{ordered.map((track,i) => <li key={i} style={{padding:'8px 0'}}>
        <strong>{track.name}</strong> — {Math.round(track.bpm)} BPM
        <div aria-label={'Relative energy ' + Math.round(track.energy / maxEnergy * 100) + '%'}
          style={{height:7, background:'#263c43', borderRadius:4, marginTop:6}}>
          <div style={{width:(track.energy / maxEnergy * 100)+'%', height:'100%', background:'#00dde5', borderRadius:4}} />
        </div>
      </li>)}</ol>
      <p>Energy is estimated from audio loudness, not a perceptual quality score.</p>
    </section>}
    {audio && <section><h3>Your Music Mix is ready</h3><audio controls src={audio} style={{width:'100%'}} />
      <a className="action primary" href={audio} download="Music_Mix.mp3" style={{display:'inline-block',marginTop:12}}>Download Music Mix MP3</a>
    </section>}
    <small>Processing happens on your local audio server. Use only audio you have permission to mix.</small>
  </div>
}
