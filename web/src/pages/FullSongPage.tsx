import { useEffect, useState } from 'react'
import { Mic2, Music2, Sparkles } from 'lucide-react'
import '../styles/full-song.css'

type Voice = 'female' | 'male' | 'duet'
type Output = 'full_song' | 'instrumental' | 'vocals'
const genres = ['Afro-pop', 'Rumba', 'Dancehall', 'Bongo Flava', 'Pop', 'Afrobeat', 'Country Pop']

export default function FullSongPage() {
  const [title, setTitle] = useState('I See You')
  const [description, setDescription] = useState('Uplifting Afro-pop with joyful rumba guitar, dancehall bounce, melodic bass, skanking keys, whistles and a wide uplifting chorus.')
  const [lyrics, setLyrics] = useState('[Verse 1]\n\n[Pre-Chorus]\n\n[Chorus]\nI see you\n\n[Verse 2]\n\n[Bridge]\n\n[Final Chorus]')
  const [voice, setVoice] = useState<Voice>('female')
  const [genre, setGenre] = useState('Afro-pop')
  const [output, setOutput] = useState<Output>('full_song')
  const [bpm, setBpm] = useState(110)
  const [minutes, setMinutes] = useState(3)
  const [saving, setSaving] = useState(false)
  const [planning,setPlanning] = useState(false)
  const [plan,setPlan] = useState<{estimated_seconds:number;total_bars:number;sections:{name:string;bars:number;start_seconds:number;duration_seconds:number;energy:number}[]}|null>(null)
  async function previewArrangement(){setPlanning(true);setError('');setPlan(null);const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),10000);try{const response=await fetch('/api/full-song/arrangement',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({title,description,lyrics,voice,genre,output,bpm,minutes})});if(!response.ok)throw new Error('Could not plan arrangement ('+response.status+').');setPlan(await response.json())}catch(e){setError(controller.signal.aborted?'Arrangement preview timed out.':e instanceof Error?e.message:'Could not preview arrangement.')}finally{window.clearTimeout(timer);setPlanning(false)}}
  const [capabilities,setCapabilities] = useState({instrumental:false,vocals:false,full_song:false})
  const [engineMessage,setEngineMessage] = useState('Checking local engine…')
  const [generating,setGenerating] = useState(false)
  const [audio,setAudio] = useState<{file:{id:string;name:string};download_url:string}|null>(null)
  useEffect(()=>{const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),8000);void fetch('/api/full-song/engine',{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('Backend unavailable');return response.json() as Promise<{generation_available:boolean;reason:string|null;capabilities?:{instrumental:boolean;vocals:boolean;full_song:boolean}}>}).then(data=>{setCapabilities(data.capabilities||{instrumental:false,vocals:false,full_song:false});setEngineMessage(data.generation_available?'Local engine configured':data.reason||'Engine unavailable')}).catch(()=>setEngineMessage('Backend unavailable. Restart Python server.')).finally(()=>window.clearTimeout(timer));return ()=>{controller.abort();window.clearTimeout(timer)}},[])
  async function generate(){setGenerating(true);setError('');setAudio(null);const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),310000);try{const response=await fetch('/api/full-song/generate',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({title,description,lyrics,voice,genre,output,bpm,minutes})});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(typeof body.detail==='string'?body.detail:'Generation failed ('+response.status+').')}setAudio(await response.json() as {file:{id:string;name:string};download_url:string})}catch(e){setError(controller.signal.aborted?'Local engine timed out.':e instanceof Error?e.message:'Generation failed.')}finally{window.clearTimeout(timer);setGenerating(false)}}
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  async function saveDraft() {
    setSaving(true);setStatus('');setError('')
    const controller = new AbortController()
    const timer = window.setTimeout(()=>controller.abort(),10000)
    try {
      const response = await fetch('/api/full-song/projects', {method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({title,description,lyrics,voice,genre,output,bpm,minutes})})
      if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(typeof body.detail==='string'?body.detail:'Could not save draft ('+response.status+').')}
      const saved=await response.json() as {id:string}
      setStatus('Draft saved locally on the backend. Project ID: '+saved.id)
    }catch(e){setError(controller.signal.aborted?'Backend did not respond within 10 seconds.':e instanceof Error?e.message:'Could not save project.')}
    finally{window.clearTimeout(timer);setSaving(false)}
  }
  return <section className="fullsong">
    <header className="fullsong-heading"><Sparkles size={24}/><div><h2>Full Song Studio</h2><p>Design complete songs with lyrics, vocal direction and arrangements. Generate using a locally installed music engine when available.</p></div></header>
    <div className="fullsong-banner" role="status"><strong>Stage 3 · Offline engine integration</strong><span>Save a project draft to your local Python backend, or export it as JSON.  Generation requires a configured offline executable. No paid API is required.</span></div>
    <label>Song title<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)}/></label>
    <label>Music description<textarea rows={4} value={description} maxLength={2000} onChange={e=>setDescription(e.target.value)}/></label>
    <label>Lyrics and song sections<textarea rows={12} value={lyrics} maxLength={12000} onChange={e=>setLyrics(e.target.value)}/></label>
    <div className="fullsong-grid">
      <label>Lead vocal<select value={voice} onChange={e=>setVoice(e.target.value as Voice)}><option value="female">Female</option><option value="male">Male</option><option value="duet">Duet</option></select></label>
      <label>Style<select value={genre} onChange={e=>setGenre(e.target.value)}>{genres.map(g=><option key={g}>{g}</option>)}</select></label>
      <label>Tempo (BPM)<input type="number" min={60} max={180} value={bpm} onChange={e=>setBpm(Number(e.target.value))}/></label>
      <label>Target length<select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}><option value={2}>2 minutes</option><option value={3}>3 minutes</option><option value={4}>4 minutes</option></select></label>
      <label>Output<select value={output} onChange={e=>setOutput(e.target.value as Output)}><option value="full_song">Full song + vocals</option><option value="instrumental">Instrumental</option><option value="vocals">Vocals only</option></select></label>
    </div>
    <div className="fullsong-actions"><button type="button" disabled={planning} onClick={()=>void previewArrangement()}>{planning?"Planning…":"Preview arrangement"}</button><button type="button" disabled={saving} onClick={()=>void saveDraft()}>{saving?"Saving…":"Save draft to backend"}</button><button type="button" onClick={()=>{const data={title,description,lyrics,voice,genre,output,bpm,minutes};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='mixmaster-song-project.json';link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}}><Music2 size={17}/> Export song project</button><button type="button" disabled={!capabilities[output]||generating} onClick={()=>void generate()} title={!capabilities[output]?"No compatible local engine configured for this output.":engineMessage}><Mic2 size={17}/>{generating?"Generating…":capabilities[output]?(output==="instrumental"?"Generate instrumental preview":"Generate with vocal engine"):"Compatible engine not installed"}</button></div>
    {plan&&<div className="fullsong-banner"><strong>Arrangement · {plan.total_bars} bars · ~{Math.round(plan.estimated_seconds)} seconds</strong><div className="fullsong-timeline">{plan.sections.map((section,index)=><div key={index} className="fullsong-section" style={{flexGrow:section.bars,opacity:0.65+section.energy*0.35}} title={section.name+" · "+section.bars+" bars"}><span>{section.name}</span><small>{section.bars} bars</small></div>)}</div><p className="fullsong-footnote">Planning only: your installed audio engine must implement the arrangement for it to be audible.</p></div>}
    <p className="fullsong-footnote" role="status">Engine status: {engineMessage}. Instrumental: {capabilities.instrumental?"ready":"not installed"}. Singing: {capabilities.vocals?"engine configured":"not installed"}. A configured vocal adapter must independently support your selected voice and lyrics; model quality is not verified.</p>
    {audio&&<div className="fullsong-banner"><strong>Audio generated: {audio.file.name}</strong><audio controls src={"/api/generated-files/"+audio.file.id+"/stream"}/><a href={audio.download_url}>Download WAV</a></div>}
    {status&&<p role="status" className="fullsong-banner">{status}</p>}
    {error&&<p role="alert" className="textsong-error">{error}</p>}
    <p className="fullsong-footnote">Export stores your song settings and lyrics as JSON, not audio. The existing Text to Song page can still produce basic offline instrumentals.</p>
  </section>
}
