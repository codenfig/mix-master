import { useEffect, useState } from 'react'
import { ArrowRight, Clock3, Download, Headphones, Mic2, Music2, Search, Sparkles, WandSparkles } from 'lucide-react'
import '../styles/full-song.css'

type Voice = 'female' | 'male' | 'duet'
type Output = 'full_song' | 'instrumental' | 'vocals'
const genres = ['Afro-pop', 'Rumba', 'Dancehall', 'Bongo Flava', 'Pop', 'Afrobeat', 'Country Pop']

export default function FullSongPage() {
  const [customMode,setCustomMode] = useState(false)
  const [privateMode,setPrivateMode] = useState(false)
  const [title, setTitle] = useState('I See You')
  const [description, setDescription] = useState('Uplifting Afro-pop with joyful rumba guitar, dancehall bounce, melodic bass, skanking keys, whistles and a wide uplifting chorus.')
  const [lyrics, setLyrics] = useState('[Verse 1]\n\n[Pre-Chorus]\n\n[Chorus]\nI see you\n\n[Verse 2]\n\n[Bridge]\n\n[Final Chorus]')
  const [voice, setVoice] = useState<Voice>('female')
  const [genre, setGenre] = useState('Afro-pop')
  const [output, setOutput] = useState<Output>('instrumental')
  const [bpm, setBpm] = useState(110)
  const [minutes, setMinutes] = useState(3)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [planning,setPlanning] = useState(false)
  const [plan,setPlan] = useState<{estimated_seconds:number;total_bars:number;sections:{name:string;bars:number;start_seconds:number;duration_seconds:number;energy:number}[]}|null>(null)
  async function previewArrangement(){setPlanning(true);setError('');setPlan(null);const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),10000);try{const response=await fetch('/api/full-song/arrangement',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({title,description,lyrics:customMode?lyrics:'',voice,genre,output,bpm,minutes})});if(!response.ok)throw new Error('Could not plan arrangement ('+response.status+').');setPlan(await response.json())}catch(e){setError(controller.signal.aborted?'Arrangement preview timed out.':e instanceof Error?e.message:'Could not preview arrangement.')}finally{window.clearTimeout(timer);setPlanning(false)}}
  const [capabilities,setCapabilities] = useState({instrumental:false,vocals:false,full_song:false})
  const [engineMessage,setEngineMessage] = useState('Checking local engine…')
  const [generating,setGenerating] = useState(false)
  const [audio,setAudio] = useState<{file:{id:string;name:string};download_url:string}|null>(null)
  useEffect(()=>{const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),8000);void fetch('/api/full-song/engine',{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('Backend unavailable');return response.json() as Promise<{generation_available:boolean;reason:string|null;capabilities?:{instrumental:boolean;vocals:boolean;full_song:boolean}}>}).then(data=>{setCapabilities(data.capabilities||{instrumental:false,vocals:false,full_song:false});setEngineMessage(data.generation_available?'Local engine configured':data.reason||'Engine unavailable')}).catch(()=>setEngineMessage('Backend unavailable. Restart Python server.')).finally(()=>window.clearTimeout(timer));return ()=>{controller.abort();window.clearTimeout(timer)}},[])
  const [jobId,setJobId] = useState<string>(()=>{try{return window.sessionStorage.getItem('mixmaster-full-song-job')||''}catch{return ''}})
  const [jobStage,setJobStage] = useState('')
  const [jobElapsed,setJobElapsed] = useState(0)
  useEffect(()=>{
    try {if(jobId)window.sessionStorage.setItem('mixmaster-full-song-job',jobId)
    else window.sessionStorage.removeItem('mixmaster-full-song-job')} catch { /* storage may be unavailable */ }
  },[jobId])
  useEffect(()=>{
    if(!jobId)return
    let stopped=false
    const poll=async()=>{
      try{
        const response=await fetch('/api/full-song/jobs/'+jobId)
        if(!response.ok)throw new Error('Could not retrieve job status ('+response.status+').')
        const job=await response.json() as {status:string;stage:string;elapsed_seconds:number;error:string|null;file:{id:string;name:string}|null;download_url:string|null}
        if(stopped)return
        setJobStage(job.stage);setJobElapsed(job.elapsed_seconds)
        if(job.status==='completed'&&job.file&&job.download_url){setAudio({file:job.file,download_url:job.download_url});setGenerating(false);setJobId('')}
        else if(job.status==='failed'||job.status==='cancelled'){setError(job.error|| (job.status==='cancelled'?'Generation cancelled.':'Generation failed.'));setGenerating(false);setJobId('')}
      }catch(e){if(!stopped){setError(e instanceof Error?e.message:'Unable to check generation status.');setGenerating(false);if(e instanceof Error && e.message.includes('404'))setJobId('')}}
    }
    setGenerating(true)
    void poll()
    const interval=window.setInterval(()=>void poll(),2000)
    return ()=>{stopped=true;window.clearInterval(interval)}
  },[jobId])
  async function generate(){
    if(generating||jobId)return
    setGenerating(true);setError('');setAudio(null);setJobElapsed(0);setJobStage('queued')
    const controller=new AbortController()
    const timer=window.setTimeout(()=>controller.abort(),10000)
    try{
      const response=await fetch('/api/full-song/jobs',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({title,description,lyrics:output==='instrumental'?'':lyrics,voice,genre,output,bpm,minutes})})
      if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(typeof body.detail==='string'?body.detail:'Could not start generation ('+response.status+').')}
      const job=await response.json() as {id:string}
      setJobId(job.id)
    }catch(e){setError(controller.signal.aborted?'Backend did not accept the job within 10 seconds.':e instanceof Error?e.message:'Could not start generation.');setGenerating(false)}
    finally{window.clearTimeout(timer)}
  }
  async function cancelGeneration(){
    if(!jobId)return
    try{
      const response=await fetch('/api/full-song/jobs/'+jobId+'/cancel',{method:'POST'})
      if(!response.ok)throw new Error('Cancellation request failed ('+response.status+').')
      setJobStage('cancelling')
    }catch(e){setError(e instanceof Error?e.message:'Could not cancel job.')}
  }
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
  return <section className="fullsong mm-generator">
    <div className="mm-generator-top"><div><span className="mm-generator-kicker"><Sparkles size={14}/> CREATE WITH MIXMASTER AI</span><h2>AI Music Generator</h2><p>Turn your ideas into original music. Describe your sound or write your own lyrics.</p></div><a className="mm-generator-plan-link" href="#/pricing"><Sparkles size={16}/> View plans <ArrowRight size={15}/></a></div>
    <div className="mm-generator-layout">
      <div className="mm-generator-compose">
        <div className="mm-generator-panel-head"><div><WandSparkles size={19}/><strong>Create a song</strong></div><span className="mm-generator-engine">{capabilities[output]?'Engine ready':'Engine unavailable'}</span></div>
        <div className="fullsong-mode-bar" role="group" aria-label="Music generation mode"><button type="button" aria-pressed={!customMode} className={!customMode?'active':''} onClick={()=>{setCustomMode(false);setOutput('instrumental')}}>Simple</button><button type="button" aria-pressed={customMode} className={customMode?'active':''} onClick={()=>setCustomMode(true)}>Custom</button></div>
        {customMode&&<label>Song title<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} placeholder="Give your song a title"/></label>}
        <label className="mm-generator-description">Song description <span className="fullsong-count">{description.length}/{customMode?2000:400}</span><textarea rows={6} value={description} maxLength={customMode?2000:400} onChange={e=>setDescription(e.target.value)} placeholder="A joyful Afro-pop song with rumba guitars, warm bass, bright whistles, uplifting harmonies…"/></label>
        {customMode&&<label>Lyrics <span className="mm-generator-hint">Use [Verse], [Pre-Chorus], [Chorus], [Bridge]</span><textarea rows={10} value={lyrics} maxLength={12000} onChange={e=>setLyrics(e.target.value)} placeholder="[Verse 1]&#10;Tonight we dance beneath the stars&#10;&#10;[Chorus]&#10;I see you…"/></label>}
        <div className="fullsong-toggles"><label className="fullsong-switch"><input type="checkbox" checked={output==='instrumental'} onChange={e=>{setOutput(e.target.checked?'instrumental':'full_song');if(!e.target.checked)setCustomMode(true)}}/><span>Instrumental</span><small>Music without vocals</small></label><label className="fullsong-switch"><input type="checkbox" checked={privateMode} onChange={e=>setPrivateMode(e.target.checked)}/><span>Private</span><small>Not yet supported</small></label></div>
        {privateMode&&<p className="fullsong-privacy-warning" role="status">Private mode is not available yet. Generation is disabled because generated files do not have per-user access controls.</p>}
        <div className="fullsong-grid">
          <label>Genre<select value={genre} onChange={e=>setGenre(e.target.value)}>{genres.map(g=><option key={g}>{g}</option>)}</select></label>
          <label>Tempo (BPM)<input type="number" min={60} max={180} value={bpm} onChange={e=>setBpm(Number(e.target.value))}/></label>
          <label>Song length<select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}><option value={2}>2 minutes</option><option value={3}>3 minutes</option><option value={4}>4 minutes</option></select></label>
          {customMode&&<label>Lead voice<select value={voice} onChange={e=>setVoice(e.target.value as Voice)}><option value="female">Female</option><option value="male">Male</option><option value="duet">Duet</option></select></label>}
          {customMode&&<label>Output<select value={output} onChange={e=>setOutput(e.target.value as Output)}><option value="full_song">Full song with vocals</option><option value="instrumental">Instrumental only</option><option value="vocals">Vocals only</option></select></label>}
        </div>
        <button className="mm-generator-primary" type="button" disabled={!capabilities[output]||generating||privateMode||!description.trim()||(output!=='instrumental'&&!lyrics.trim())} onClick={()=>void generate()}><Sparkles size={18}/>{generating?'Generating music…':capabilities[output]?'Generate Music':'Singing engine not connected'}<ArrowRight size={18}/></button>
        <p className="fullsong-footnote">Instrumentals use your configured local engine. Singing requires a connected, compatible vocal engine. Generation times vary by model and hardware.</p>
        {generating&&<div className="mm-generator-progress" role="status"><Clock3 size={16}/> {jobStage||'Queued'} · {Math.round(jobElapsed)}s elapsed <button type="button" onClick={()=>void cancelGeneration()}>Cancel</button></div>}
        <details className="mm-generator-advanced"><summary>Advanced song tools</summary><div className="fullsong-actions"><button type="button" disabled={planning} onClick={()=>void previewArrangement()}>{planning?'Planning…':'Preview arrangement'}</button><button type="button" disabled={saving} onClick={()=>void saveDraft()}>{saving?'Saving…':'Save draft'}</button><button type="button" onClick={()=>{const data={title,description,lyrics,voice,genre,output,bpm,minutes};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='mixmaster-song-project.json';link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}}><Download size={16}/> Export project JSON</button></div></details>
        {plan&&<div className="fullsong-banner"><strong>Arrangement · {plan.total_bars} bars · ~{Math.round(plan.estimated_seconds)}s</strong><div className="fullsong-timeline">{plan.sections.map((section,index)=><div key={index} className="fullsong-section" style={{flexGrow:section.bars,opacity:0.65+section.energy*0.35}} title={section.name+' · '+section.bars+' bars'}><span>{section.name}</span><small>{section.bars} bars</small></div>)}</div><p className="fullsong-footnote">Arrangement preview is a plan; your selected engine may not follow it exactly.</p></div>}
        {status&&<p role="status" className="fullsong-banner">{status}</p>}
        {error&&<p role="alert" className="textsong-error">{error}</p>}
      </div>
      <aside className="mm-generator-library"><div className="mm-generator-library-head"><div><Headphones size={19}/><strong>My creations</strong></div><a href="#/generated-files">View library <ArrowRight size={14}/></a></div><label className="mm-generator-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search this session" aria-label="Search current session creations"/></label>
        {audio&&(!search.trim()||audio.file.name.toLowerCase().includes(search.trim().toLowerCase()))?<div className="mm-generator-track"><div className="mm-generator-art"><Music2 size={25}/></div><div><strong>{audio.file.name}</strong><span>Generated just now</span></div><audio controls src={'/api/generated-files/'+audio.file.id+'/stream'}/><a href={audio.download_url}><Download size={15}/> Download WAV</a></div>:<div className="mm-generator-empty"><div><Music2 size={34}/></div><strong>{search?'No matching creations':'Your next track starts here'}</strong><p>{search?'Try a different search.':'Generate your first track to preview it here. Previously saved songs are in Generated Files.'}</p></div>}
        <div className="mm-generator-info"><Mic2 size={17}/><div><strong>Engine status</strong><p>{engineMessage}</p><small>Instrumentals: {capabilities.instrumental?'ready':'unavailable'} · Singing: {capabilities.full_song?'configured':'not connected'}</small></div></div>
      </aside>
    </div>
  </section>
}
