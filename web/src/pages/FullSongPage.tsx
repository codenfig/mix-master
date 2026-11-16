import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Clock3, Download, Headphones, Mic2, Music2, Search, Sparkles, WandSparkles, RefreshCw, FileText, SlidersHorizontal } from 'lucide-react'
import '../styles/full-song.css'

type Voice = 'female' | 'male' | 'duet'
type Output = 'full_song' | 'instrumental' | 'vocals'
type SavedSong = {id:string;name:string;category:string;created_at:string;size:number;mime:string}
const genres = ['Afro-pop', 'Rumba', 'Dancehall', 'Bongo Flava', 'Pop', 'Afrobeat', 'Country Pop']

export default function FullSongPage() {
  const [customMode,setCustomMode] = useState(true)
  const [privateMode,setPrivateMode] = useState(false)
  const projectInput = useRef<HTMLInputElement>(null)
  const importedLyrics = useRef(false)
  const [title, setTitle] = useState('I See You')
  const [description, setDescription] = useState('Uplifting Afro-pop with joyful rumba guitar, dancehall bounce, melodic bass, skanking keys, whistles and a wide uplifting chorus.')
  const [lyrics, setLyrics] = useState('[Verse 1]\n\n[Pre-Chorus]\n\n[Chorus]\nI see you\n\n[Verse 2]\n\n[Bridge]\n\n[Final Chorus]')
  useEffect(()=>{
    try {
      const imported = sessionStorage.getItem('mixmaster-imported-lyrics')
      if(imported){importedLyrics.current=true;setLyrics(imported);setCustomMode(true);sessionStorage.removeItem('mixmaster-imported-lyrics')}
    } catch { /* browser storage may be unavailable */ }
  },[])
  const [voice, setVoice] = useState<Voice>('female')
  const [genre, setGenre] = useState('Afro-pop')
  const [output, setOutput] = useState<Output>('instrumental')
  const [bpm, setBpm] = useState(110)
  const [minutes, setMinutes] = useState(3)
  const [saving, setSaving] = useState(false)
  const [draftRestored,setDraftRestored] = useState(false)
  useEffect(()=>{
    try{
      const saved=localStorage.getItem('mixmaster-song-draft-v1')
      if(saved){
        const draft=JSON.parse(saved) as Record<string,unknown>
        if(typeof draft.title==='string')setTitle(draft.title.slice(0,120))
        if(typeof draft.description==='string')setDescription(draft.description.slice(0,2000))
        if(typeof draft.lyrics==='string'&&!importedLyrics.current)setLyrics(draft.lyrics.slice(0,12000))
        if(typeof draft.genre==='string'&&genres.includes(draft.genre))setGenre(draft.genre)
        if(draft.voice==='female'||draft.voice==='male'||draft.voice==='duet')setVoice(draft.voice)
        if(draft.output==='full_song'||draft.output==='instrumental'||draft.output==='vocals')setOutput(draft.output)
        if(typeof draft.bpm==='number'&&draft.bpm>=60&&draft.bpm<=180)setBpm(draft.bpm)
        if(draft.minutes===2||draft.minutes===3||draft.minutes===4)setMinutes(draft.minutes)
      }
    }catch{/* Invalid browser draft should not prevent rendering. */}
    setDraftRestored(true)
  },[])
  useEffect(()=>{
    if(!draftRestored)return
    try{localStorage.setItem('mixmaster-song-draft-v1',JSON.stringify({title,description,lyrics,genre,voice,output,bpm,minutes}))}catch{}
  },[draftRestored,title,description,lyrics,genre,voice,output,bpm,minutes])
  async function importProject(file:File){
    if(file.size>200000){setError('Project JSON is too large.');return}
    try{
      const data=JSON.parse(await file.text()) as Record<string,unknown>
      if(typeof data.title!=='string'||typeof data.description!=='string'||typeof data.lyrics!=='string')throw Error('Invalid MixMaster project JSON.')
      if(data.title.length>120||data.description.length>2000||data.lyrics.length>12000)throw Error('Project exceeds supported text limits.')
      setTitle(data.title);setDescription(data.description);setLyrics(data.lyrics);setCustomMode(true)
      if(typeof data.genre==='string'&&genres.includes(data.genre))setGenre(data.genre)
      if(data.voice==='female'||data.voice==='male'||data.voice==='duet')setVoice(data.voice)
      if(data.output==='full_song'||data.output==='instrumental'||data.output==='vocals')setOutput(data.output)
      if(typeof data.bpm==='number'&&data.bpm>=60&&data.bpm<=180)setBpm(data.bpm)
      if(data.minutes===2||data.minutes===3||data.minutes===4)setMinutes(data.minutes)
      setError('');setStatus('Project loaded into the editor.')
    }catch(e){setError(e instanceof Error?e.message:'Could not read project.')}
  }
  const [search, setSearch] = useState('')
  const [songs,setSongs] = useState<SavedSong[]>([])
  const [selectedId,setSelectedId] = useState('')
  const [libraryLoading,setLibraryLoading] = useState(false)
  const [libraryError,setLibraryError] = useState('')
  const [refreshKey,setRefreshKey] = useState(0)
  const [showDetails,setShowDetails] = useState(true)
  const [detailTab,setDetailTab] = useState<'lyrics'|'details'|'stems'>('details')
  useEffect(()=>{let active=true;const load=async()=>{setLibraryLoading(true);try{const response=await fetch('/api/generated-files');if(!response.ok)throw new Error('Could not load music library');const data=await response.json() as {files:SavedSong[]};if(active){const items=data.files.filter(f=>f.category==='full_song'||f.category==='text_to_song');setSongs(items);setSelectedId(previous=>items.some(f=>f.id===previous)?previous:items[0]?.id||'');setLibraryError('')}}catch(e){if(active)setLibraryError(e instanceof Error?e.message:'Library unavailable')}finally{if(active)setLibraryLoading(false)}};void load();return()=>{active=false}},[refreshKey])
  const selectedSong=songs.find(f=>f.id===selectedId)
  const filteredSongs=songs.filter(f=>f.name.toLowerCase().includes(search.trim().toLowerCase()))
  const coverFor = (song:SavedSong) => '/cover-'+(Math.max(0,songs.findIndex(item=>item.id===song.id))%4+1)+'.svg'
  const [planning,setPlanning] = useState(false)
  const [plan,setPlan] = useState<{estimated_seconds:number;total_bars:number;sections:{name:string;bars:number;start_seconds:number;duration_seconds:number;energy:number}[]}|null>(null)
  async function previewArrangement(){setPlanning(true);setError('');setPlan(null);const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),10000);try{const response=await fetch('/api/full-song/arrangement',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({title,description,lyrics:customMode?lyrics:'',voice,genre,output,bpm,minutes})});if(!response.ok)throw new Error('Could not plan arrangement ('+response.status+').');setPlan(await response.json())}catch(e){setError(controller.signal.aborted?'Arrangement preview timed out.':e instanceof Error?e.message:'Could not preview arrangement.')}finally{window.clearTimeout(timer);setPlanning(false)}}
  const [capabilities,setCapabilities] = useState({instrumental:false,vocals:false,full_song:false})
  const [engineMessage,setEngineMessage] = useState('Checking local engine…')
  const [engineRefresh,setEngineRefresh] = useState(0)
  const [generating,setGenerating] = useState(false)
  useEffect(()=>{const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),8000);void fetch('/api/full-song/engine',{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('Backend unavailable');return response.json() as Promise<{generation_available:boolean;reason:string|null;capabilities?:{instrumental:boolean;vocals:boolean;full_song:boolean}}>}).then(data=>{setCapabilities(data.capabilities||{instrumental:false,vocals:false,full_song:false});setEngineMessage(data.generation_available?'Local engine configured':data.reason||'Engine unavailable')}).catch(()=>setEngineMessage('Backend unavailable. Restart Python server.')).finally(()=>window.clearTimeout(timer));return ()=>{controller.abort();window.clearTimeout(timer)}},[engineRefresh])
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
        if(job.status==='completed'&&job.file&&job.download_url){setSelectedId(job.file.id);setRefreshKey(k=>k+1);setGenerating(false);setJobId('')}
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
    setGenerating(true);setError('');setJobElapsed(0);setJobStage('queued')
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
    <div className="mm-generator-top"><div><span className="mm-generator-kicker"><Sparkles size={14}/> MIXMASTER AI STUDIO</span><h2>Music Generator</h2><p>Describe a song, shape its sound, and explore your creations.</p></div><a className="mm-generator-plan-link" href="#/pricing"><Sparkles size={16}/> Plans & credits <ArrowRight size={15}/></a></div>
    <div className="mm-generator-layout">
      <div className="mm-generator-compose">
        <div className="mm-generator-panel-head"><div><WandSparkles size={19}/><strong>Create Music</strong></div><button type="button" className="mm-generator-engine mm-engine-refresh" title="Check local generation engine" onClick={()=>setEngineRefresh(v=>v+1)}><RefreshCw size={12}/>{capabilities[output]?'Ready':'Not connected'}</button></div>
        <div className="fullsong-mode-bar" role="group" aria-label="Music generation mode"><button type="button" aria-pressed={!customMode} className={!customMode?'active':''} onClick={()=>{setCustomMode(false);setOutput('instrumental')}}>Simple</button><button type="button" aria-pressed={customMode} className={customMode?'active':''} onClick={()=>setCustomMode(true)}>Custom</button></div>
        {customMode&&<label>Lyrics <span className="mm-generator-hint">Use [Verse], [Pre-Chorus], [Chorus], [Bridge]</span><textarea rows={10} value={lyrics} maxLength={12000} onChange={e=>setLyrics(e.target.value)} placeholder="[Verse 1]&#10;Tonight we dance beneath the stars&#10;&#10;[Chorus]&#10;I see you…"/></label>}
        {customMode&&<div className="mm-lyric-tools"><a href="#/lyrics-generator" className="mm-lyrics-generator-link"><WandSparkles size={13}/> AI Lyrics Generator</a><button type="button" onClick={()=>setLyrics('[Verse 1]\nTonight we dance beneath the stars\nFeel the rhythm in our hearts\n\n[Pre-Chorus]\nEvery step will lead us closer\n\n[Chorus]\nI see you, shining in the light\nTogether we can dance all night\n\n[Verse 2]\n\n[Bridge]\n\n[Final Chorus]')}>Lyric starter · local template</button><span>{lyrics.length}/12000</span></div>}
        <label className="mm-generator-description">{customMode?"Style of music":"Song description"} <span className="fullsong-count">{description.length}/{customMode?2000:400}</span><textarea rows={6} value={description} maxLength={customMode?2000:400} onChange={e=>setDescription(e.target.value)} placeholder="A joyful Afro-pop song with rumba guitars, warm bass, bright whistles, uplifting harmonies…"/></label>
        <div className="mm-generator-tags"><button type="button" onClick={()=>setDescription("Joyful Afro-pop, rumba guitars, melodic bass, skanking keys, hand drums and bright whistles")}>Afro-pop</button><button type="button" onClick={()=>setDescription("Warm dancehall groove, syncopated drums, bouncy bass and uplifting chorus")}>Dancehall</button><button type="button" onClick={()=>setDescription("Sparkling country-pop guitar, upbeat rhythm and bright melodic hooks")}>Country pop</button></div>
        <div className="fullsong-toggles"><label className="fullsong-switch"><input type="checkbox" checked={output==='instrumental'} onChange={e=>{setOutput(e.target.checked?'instrumental':'full_song');if(!e.target.checked)setCustomMode(true)}}/><span>Instrumental</span><small>Music without vocals</small></label><label className="fullsong-switch"><input type="checkbox" checked={privateMode} onChange={e=>setPrivateMode(e.target.checked)}/><span>Private</span><small>Not yet supported</small></label></div>
        {privateMode&&<p className="fullsong-privacy-warning" role="status">Private mode is not available yet. Generation is disabled because generated files do not have per-user access controls.</p>}
        <details className="mm-generator-settings"><summary><SlidersHorizontal size={15}/> Style & generation settings</summary><div className="fullsong-grid">        {customMode&&<label>Song title<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} placeholder="Give your song a title"/></label>}

          <label>Genre<select value={genre} onChange={e=>setGenre(e.target.value)}>{genres.map(g=><option key={g}>{g}</option>)}</select></label>
          <label>Tempo (BPM)<input type="number" min={60} max={180} value={bpm} onChange={e=>setBpm(Number(e.target.value))}/></label>
          <label>Song length<select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}><option value={2}>2 minutes</option><option value={3}>3 minutes</option><option value={4}>4 minutes</option></select></label>
          {customMode&&<label>Lead voice<select value={voice} onChange={e=>setVoice(e.target.value as Voice)}><option value="female">Female</option><option value="male">Male</option><option value="duet">Duet</option></select></label>}
          {customMode&&<label>Output<select value={output} onChange={e=>setOutput(e.target.value as Output)}><option value="full_song">Full song with vocals</option><option value="instrumental">Instrumental only</option><option value="vocals">Vocals only</option></select></label>}
        </div></details>
        <button className="mm-generator-primary" type="button" disabled={!capabilities[output]||generating||privateMode||!description.trim()||(output!=='instrumental'&&!lyrics.trim())} onClick={()=>void generate()}><Sparkles size={18}/>{generating?'Generating music…':capabilities[output]?'Generate Music':'Singing engine not connected'}<ArrowRight size={18}/></button>
        
        {generating&&<div className="mm-generator-progress" role="status"><Clock3 size={16}/> {jobStage||'Queued'} · {Math.round(jobElapsed)}s elapsed <button type="button" onClick={()=>void cancelGeneration()}>Cancel</button></div>}
        <details className="mm-generator-advanced"><summary>Advanced song tools</summary><input ref={projectInput} type="file" accept=".json,application/json" style={{display:"none"}} aria-label="Import song project" onChange={e=>{const file=e.target.files?.[0];if(file)void importProject(file);e.target.value=""}}/><div className="fullsong-actions"><button type="button" onClick={()=>projectInput.current?.click()}>Import project JSON</button><button type="button" disabled={planning} onClick={()=>void previewArrangement()}>{planning?'Planning…':'Preview arrangement'}</button><button type="button" disabled={saving} onClick={()=>void saveDraft()}>{saving?'Saving…':'Save draft'}</button><button type="button" onClick={()=>{const data={title,description,lyrics,voice,genre,output,bpm,minutes};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='mixmaster-song-project.json';link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}}><Download size={16}/> Export project JSON</button></div></details>
        {plan&&<div className="fullsong-banner"><strong>Arrangement · {plan.total_bars} bars · ~{Math.round(plan.estimated_seconds)}s</strong><div className="fullsong-timeline">{plan.sections.map((section,index)=><div key={index} className="fullsong-section" style={{flexGrow:section.bars,opacity:0.65+section.energy*0.35}} title={section.name+' · '+section.bars+' bars'}><span>{section.name}</span><small>{section.bars} bars</small></div>)}</div><p className="fullsong-footnote">Arrangement preview is a plan; your selected engine may not follow it exactly.</p></div>}
        {status&&<p role="status" className="fullsong-banner">{status}</p>}
        {error&&<p role="alert" className="textsong-error">{error}</p>}
      </div>
      <div className="mm-generator-library">
        <div className="mm-generator-library-head"><div><Headphones size={19}/><strong>My Music</strong><span className="mm-song-count">{songs.length}</span></div><div className="mm-generator-library-actions"><button type="button" title="Refresh library" onClick={()=>setRefreshKey(k=>k+1)} disabled={libraryLoading}><RefreshCw size={16}/></button><button type="button" title="Toggle details" aria-pressed={showDetails} onClick={()=>setShowDetails(v=>!v)}><FileText size={16}/></button></div></div>
        <label className="mm-generator-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Music" aria-label="Search generated music"/></label>
        {libraryError&&<p className="mm-generator-library-error" role="alert">{libraryError}</p>}
        <div className="mm-generator-song-list">
          {filteredSongs.map((song,index)=><button type="button" key={song.id} className={'mm-generator-song-row'+(selectedId===song.id?' selected':'')} onClick={()=>{setSelectedId(song.id);setShowDetails(true)}}><span className={'mm-song-art mm-song-art-'+index%4}><img src={coverFor(song)} alt="" loading="lazy"/></span><span className="mm-song-meta"><strong>{song.name.replace(/\.(wav|mp3|flac)$/i,'')}</strong><small>{new Date(song.created_at).toLocaleString()}</small><span className="mm-song-chip">{song.category==='full_song'?'Full Song':'Text to Song'}</span></span><span className="mm-song-row-actions"><ArrowRight size={15}/></span></button>)}
          {!libraryLoading&&!filteredSongs.length&&<div className="mm-generator-empty"><div><Music2 size={34}/></div><strong>{search?'No matching tracks':'Your music will appear here'}</strong><p>{search?'Try a different search.':'Create a track to start your music library.'}</p></div>}
          {libraryLoading&&<p className="mm-generator-loading">Loading music…</p>}
        </div>
        <div className="mm-generator-library-footer"><a href="#/generated-files">All generated files <ArrowRight size={14}/></a></div>
      </div>
      {showDetails&&<aside className="mm-generator-detail">
        {selectedSong?<><div className="mm-detail-art"><div className="mm-detail-vinyl"><div className="mm-detail-vinyl-core"><img src={coverFor(selectedSong)} alt=""/></div></div><span className="mm-detail-bars" aria-hidden="true">{Array.from({length:11},(_,i)=><i key={i} style={{height:15+Math.abs(Math.sin(i*.7))*58}}/>)}</span></div><h3>{selectedSong.name.replace(/\.(wav|mp3|flac)$/i,'')}</h3><div className="mm-detail-chips"><span>{selectedSong.category==='full_song'?'Full Song':'Instrumental'}</span><span>{(selectedSong.size/1048576).toFixed(1)} MB</span></div><small>{new Date(selectedSong.created_at).toLocaleString()}</small><div className="mm-detail-actions"><a href={'/api/generated-files/'+selectedSong.id+'/download'}><Download size={16}/> Download</a></div><div className="mm-detail-tabs" role="tablist" aria-label="Track information"><button type="button" role="tab" aria-selected={detailTab==='lyrics'} className={detailTab==='lyrics'?'active':''} onClick={()=>setDetailTab('lyrics')}>Lyrics</button><button type="button" role="tab" aria-selected={detailTab==='details'} className={detailTab==='details'?'active':''} onClick={()=>setDetailTab('details')}>Details</button><button type="button" role="tab" aria-selected={detailTab==='stems'} className={detailTab==='stems'?'active':''} onClick={()=>setDetailTab('stems')}>Stems</button></div>
        <div className="mm-detail-tab-content" role="tabpanel">{detailTab==='details'?<><h4>Music details</h4><p>Generated with MixMaster AI. Saved audio is ready to listen to or download.</p></>:detailTab==='lyrics'?<p>Lyrics aren't saved with this generated audio yet. Your draft lyrics remain in the generator on the left.</p>:<div><p>Separate this track into drums, bass, vocals and other sounds using the Stem Splitter.</p><a href="#/stem-splitter" className="mm-detail-stems-link">Open Stem Splitter <ArrowRight size={14}/></a></div>}</div>
        </>:<div className="mm-generator-empty"><Music2 size={34}/><strong>Select a song</strong><p>Your selected track and player will appear here.</p></div>}
        <div className="mm-generator-info"><Mic2 size={17}/><div><strong>Engine status</strong><p>{engineMessage}</p><small>Instrumentals: {capabilities.instrumental?'ready':'unavailable'} · Singing: {capabilities.full_song?'configured':'not connected'}</small></div></div>
      </aside>}
    </div>
    {selectedSong&&<div className="mm-generator-player"><span className="mm-player-art"><img src={coverFor(selectedSong)} alt=""/></span><div><strong>{selectedSong.name}</strong><small>MixMaster AI</small></div><audio key={'bottom-'+selectedSong.id} controls src={'/api/generated-files/'+selectedSong.id+'/stream'}/><a href={'/api/generated-files/'+selectedSong.id+'/download'} title="Download selected song"><Download size={19}/></a></div>}
  </section>
}
