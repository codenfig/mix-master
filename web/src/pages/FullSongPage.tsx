import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Clock3, Download, Headphones, Mic2, Music2, Search, Sparkles, WandSparkles, RefreshCw, FileText, SlidersHorizontal, Trash2, Heart, CheckCircle2, AlertTriangle, X, Shuffle, ChevronRight, Plus, HelpCircle, Share2, MoreVertical, Play, Pause, SkipBack, SkipForward, Pencil, Copy, AudioLines, ShieldCheck } from 'lucide-react'
import '../styles/full-song.css'

type Voice = 'female' | 'male' | 'duet'
type Output = 'full_song' | 'instrumental' | 'vocals'
type SavedSong = {id:string;name:string;category:string;created_at:string;size:number;mime:string;song_title?:string;has_artwork?:number;license_status?:string}
const genres = ['Afro-pop', 'Rumba', 'Dancehall', 'Bongo Flava', 'Pop', 'Afrobeat', 'Country Pop']

export default function FullSongPage() {
  const [customMode,setCustomMode] = useState(false)
  const [voicePanelOpen,setVoicePanelOpen] = useState(false)
  const [stylePanel,setStylePanel] = useState<'genre'|'mood'|'voice'|'tempo'|null>(null)
  const styleOptions={genre:['Afro-pop','Rumba','Dancehall','Bongo Flava','Pop','Afrobeat','Country Pop'],mood:['Uplifting','Romantic','Dreamy','Energetic','Calm','Melancholic'],voice:['Warm vocals','Soft harmonies','Soulful','Choir','Instrumental'],tempo:['Slow groove','Mid-tempo','Fast','Dance rhythm']} as const
  const randomStyles=['Uplifting Afro-pop, joyful guitars, warm bass and melodic percussion','Dreamy Rumba, soft guitar melodies, gentle groove and lush harmonies','Energetic Bongo Flava, punchy drums, bright synths and catchy hooks','Romantic Country Pop, acoustic guitars, steady drums and heartfelt melodies']
  const [privateMode,setPrivateMode] = useState(false)
  const projectInput = useRef<HTMLInputElement>(null)
  const importedLyrics = useRef(false)
  const [title, setTitle] = useState('I See You')
  const [description, setDescription] = useState('Sparkling country-pop guitar, upbeat rhythm and bright melodic hooks.')
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
  const playerRef=useRef<HTMLAudioElement>(null)
  const [playing,setPlaying]=useState(false)
  const [playTime,setPlayTime]=useState(0)
  const [playDuration,setPlayDuration]=useState(0)
  const [search, setSearch] = useState('')
  const [favoritesOnly,setFavoritesOnly] = useState(false)
  const [favorites,setFavorites] = useState<string[]>(()=>{try{const saved=JSON.parse(localStorage.getItem('mixmaster-favorites-v1')||'[]') as unknown;return Array.isArray(saved)?saved.filter((id):id is string=>typeof id==='string'):[]}catch{return []}})
  const [confirmDelete,setConfirmDelete] = useState<SavedSong|null>(null)
  const [toast,setToast] = useState<{message:string;kind:'success'|'error'|'info'}|null>(null)
  useEffect(()=>{try{localStorage.setItem('mixmaster-favorites-v1',JSON.stringify(favorites))}catch{}},[favorites])
  useEffect(()=>{if(!toast)return;const timer=window.setTimeout(()=>setToast(null),4000);return()=>window.clearTimeout(timer)},[toast])
  function toggleFavorite(song:SavedSong){const isFavorite=favorites.includes(song.id);setFavorites(current=>isFavorite?current.filter(id=>id!==song.id):[...current,song.id]);setToast({kind:'success',message:isFavorite?'Removed from favorites':'Added to favorites ♥'})}
  const [songs,setSongs] = useState<SavedSong[]>([])
  const [selectedId,setSelectedId] = useState('')
  const [libraryLoading,setLibraryLoading] = useState(false)
  const [libraryError,setLibraryError] = useState('')
  const [libraryNotice,setLibraryNotice] = useState('')
  const [editMusicSong,setEditMusicSong] = useState<SavedSong|null>(null)
  const [editMusicTitle,setEditMusicTitle] = useState('')
  const [editMusicStyle,setEditMusicStyle] = useState('')
  const [editMusicLyrics,setEditMusicLyrics] = useState('')
  const [licenseSong,setLicenseSong] = useState<SavedSong|null>(null)
  const [extendSong,setExtendSong] = useState<SavedSong|null>(null)
  const [extendInstructions,setExtendInstructions] = useState('Continue naturally from the ending of the selected song. Preserve its tempo, key, rhythm, instruments, vocal character and overall style. Add a fresh verse or instrumental passage, build toward a satisfying chorus or outro, and avoid an abrupt restart.')
  const [extendAt,setExtendAt] = useState(0)
  const [extendAudioDuration,setExtendAudioDuration] = useState(0)
  const [extendDuration,setExtendDuration] = useState(30)
  const [extendLyrics,setExtendLyrics] = useState('')
  const [extendTitle,setExtendTitle] = useState('')
  const [extendCapabilities,setExtendCapabilities] = useState<{available:boolean;merge_available:boolean;reason:string|null}|null>(null)
  const [extendJobId,setExtendJobId] = useState('')
  const [extendStage,setExtendStage] = useState('')
  const [extendError,setExtendError] = useState('')
  const [extendResult,setExtendResult] = useState<{id:string;name:string}|null>(null)
  const extendPreviewRef=useRef<HTMLAudioElement|null>(null)
  useEffect(()=>{if(!extendSong)return;let active=true;setExtendAudioDuration(0);setExtendAt(0);setExtendResult(null);setExtendError('');setExtendTitle((songMetadata[extendSong.id]?.title||extendSong.song_title||extendSong.name.replace(/\\.wav$/i,''))+' Extended');setExtendLyrics(songMetadata[extendSong.id]?.lyrics||'');setExtendCapabilities(null);void fetch('/api/full-song/extensions/capabilities').then(async response=>{if(!response.ok)throw Error('Extension service unavailable');return response.json() as Promise<{available:boolean;merge_available:boolean;reason:string|null}>}).then(data=>{if(active)setExtendCapabilities(data)}).catch(e=>{if(active)setExtendError(e instanceof Error?e.message:'Extension service unavailable')});return()=>{active=false}},[extendSong])
  useEffect(()=>{if(!extendJobId)return;let active=true;const poll=async()=>{try{const response=await fetch('/api/full-song/extensions/'+encodeURIComponent(extendJobId));if(!response.ok)throw Error('Could not check extension progress');const data=await response.json() as {status:string;stage:string;error:string|null;file:{id:string;name:string}|null};if(!active)return;setExtendStage(data.stage);if(data.status==='completed'){setExtendJobId('');setExtendResult(data.file);setRefreshKey(v=>v+1);if(data.file)setSelectedId(data.file.id)}else if(data.status==='failed'){setExtendJobId('');setExtendError(data.error||'Extension failed')}}catch(e){if(active){setExtendJobId('');setExtendError(e instanceof Error?e.message:'Extension status failed')}}};void poll();const timer=window.setInterval(()=>void poll(),2000);return()=>{active=false;window.clearInterval(timer)}},[extendJobId])
  async function submitExtension(song:SavedSong){setExtendError('');setExtendResult(null);try{const response=await fetch('/api/full-song/extensions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_file_id:song.id,start_seconds:extendAt,duration_seconds:extendDuration,prompt:extendInstructions,lyrics:extendLyrics,title:extendTitle})});const data=await response.json() as {id?:string;detail?:string};if(!response.ok)throw Error(data.detail||'Extension could not start');if(!data.id)throw Error('Extension job ID missing');setExtendStage('queued');setExtendJobId(data.id)}catch(e){setExtendError(e instanceof Error?e.message:'Extension could not start')}}
  const [licenseEmail,setLicenseEmail] = useState('')
  const [requestingLicense,setRequestingLicense] = useState(false)
  const [licenseRequestId,setLicenseRequestId] = useState('')
  const [startingCheckout,setStartingCheckout] = useState(false)
  const [deletingId,setDeletingId] = useState<string | null>(null)
  const [refreshKey,setRefreshKey] = useState(0)
  const [showDetails,setShowDetails] = useState(true)
  const [detailTab,setDetailTab] = useState<'lyrics'|'details'|'stems'>('details')
  useEffect(()=>{let active=true;const load=async()=>{setLibraryLoading(true);try{const response=await fetch('/api/generated-files');if(!response.ok)throw new Error('Could not load music library');const data=await response.json() as {files:SavedSong[]};if(active){const items=data.files.filter(f=>f.category==='full_song'||f.category==='text_to_song');setSongs(items);setSelectedId(previous=>items.some(f=>f.id===previous)?previous:items[0]?.id||'');setLibraryError('')}}catch(e){if(active)setLibraryError(e instanceof Error?e.message:'Library unavailable')}finally{if(active)setLibraryLoading(false)}};void load();return()=>{active=false}},[refreshKey])
  async function deleteSong(song:SavedSong) {
    if(deletingId!==null)return
    setDeletingId(song.id)
    setLibraryError('')
    setLibraryNotice('')
    try {
      const response=await fetch('/api/generated-files/'+encodeURIComponent(song.id),{method:'DELETE'})
      if(!response.ok){
        const body=await response.json().catch(()=>null) as {detail?:string}|null
        throw new Error(body?.detail||'Could not delete song ('+response.status+').')
      }
      setSongs(current=>{
        const remaining=current.filter(item=>item.id!==song.id)
        setSelectedId(previous=>previous===song.id?(remaining[0]?.id||''):previous)
        return remaining
      })
      setFavorites(current=>current.filter(id=>id!==song.id))
      setConfirmDelete(null)
      setToast({kind:'success',message:'Song deleted successfully.'})
    }catch(e){setToast({kind:'error',message:e instanceof Error?e.message:'Could not delete song.'})}
    finally{setDeletingId(null)}
  }
  async function requestLicense(song:SavedSong){
    if(!licenseEmail.trim()){setLibraryError('Enter a contact email.');return}
    setRequestingLicense(true);setLibraryError('');setLibraryNotice('')
    try{
      const response=await fetch('/api/generated-files/'+encodeURIComponent(song.id)+'/commercial-license-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:licenseEmail})})
      const data=await response.json() as {detail?:string;message?:string;id?:string}
      if(!response.ok)throw new Error(data.detail||'License request failed.')
      setLicenseRequestId(data.id||'')
      setLibraryNotice(data.message||'Request received.')
    }catch(e){setLibraryError(e instanceof Error?e.message:'License request failed.')}
    finally{setRequestingLicense(false)}
  }
  async function startLicenseCheckout(){
    if(!licenseRequestId)return
    setStartingCheckout(true);setLibraryError('')
    try{
      const response=await fetch('/api/commercial-licenses/requests/'+encodeURIComponent(licenseRequestId)+'/checkout',{method:'POST'})
      const data=await response.json() as {detail?:string;checkout_url?:string}
      if(!response.ok)throw new Error(data.detail||'Checkout is not ready.')
      if(!data.checkout_url||!data.checkout_url.startsWith('https://checkout.stripe.com/'))throw new Error('Invalid Stripe checkout URL.')
      window.location.assign(data.checkout_url)
    }catch(e){setLibraryError(e instanceof Error?e.message:'Checkout could not start.');setStartingCheckout(false)}
  }
  function selectAndPlay(song:SavedSong){setSelectedId(song.id);setShowDetails(true);setPlaying(true)}
  useEffect(()=>{const audio=playerRef.current;if(!audio)return;audio.load();setPlayTime(0);setPlayDuration(0);if(playing)void audio.play().catch(()=>setPlaying(false))},[selectedId])
  function togglePlayback(){const audio=playerRef.current;if(!audio)return;if(audio.paused){void audio.play().then(()=>setPlaying(true)).catch(()=>setToast({kind:'error',message:'Unable to play this track.'}))}else{audio.pause();setPlaying(false)}}
  function skipSong(step:number){if(!filteredSongs.length)return;const index=filteredSongs.findIndex(song=>song.id===selectedId);const next=filteredSongs[(Math.max(index,0)+step+filteredSongs.length)%filteredSongs.length];if(next)selectAndPlay(next)}
  function formatTime(value:number){if(!Number.isFinite(value))return '00:00';return Math.floor(value/60).toString().padStart(2,'0')+':'+Math.floor(value%60).toString().padStart(2,'0')}
  async function downloadSong(song:SavedSong){
    try{
      const response=await fetch('/api/generated-files/'+encodeURIComponent(song.id)+'/download')
      if(!response.ok)throw new Error('Download failed ('+response.status+').')
      const blob=await response.blob()
      const filename=(displaySongTitle(song).replace(/[\\/:*?"<>|\\x00-\\x1f]/g,'').trim()||'Song')+'.wav'
      const url=URL.createObjectURL(blob)
      const link=document.createElement('a')
      link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove()
      window.setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(e){setLibraryError(e instanceof Error?e.message:'Unable to download song')}
  }
  async function shareSong(song:SavedSong){const url=new URL('/api/generated-files/'+song.id+'/stream',window.location.origin).href;try{if(navigator.share)await navigator.share({title:song.song_title||song.name,url});else{await navigator.clipboard.writeText(url);setToast({kind:'success',message:'Song link copied to clipboard'})}}catch(e){if(e instanceof Error&&e.name!=='AbortError')setToast({kind:'error',message:'Could not share this song.'})}}
  const selectedSong=songs.find(f=>f.id===selectedId)
  const filteredSongs=songs.filter(f=>(!favoritesOnly||favorites.includes(f.id))&&(f.song_title||f.name).toLowerCase().includes(search.trim().toLowerCase()))
  const [songMetadata,setSongMetadata] = useState<Record<string,{title:string;style:string;lyrics:string}>>(()=>{try{return JSON.parse(localStorage.getItem('mixmaster-song-metadata-v1')||'{}') as Record<string,{title:string;style:string;lyrics:string}>}catch{return {}}})
  const metadataRef=useRef(songMetadata)
  const saveSongMetadata=(id:string,meta:{title:string;style:string;lyrics:string})=>{const next={...metadataRef.current,[id]:meta};metadataRef.current=next;setSongMetadata(next);try{localStorage.setItem('mixmaster-song-metadata-v1',JSON.stringify(next))}catch{}}
  const pendingSongMetadata=useRef<{title:string;style:string;lyrics:string}|null>(null)
  const [songTitleOverrides,setSongTitleOverrides] = useState<Record<string,string>>(()=>{try{return JSON.parse(localStorage.getItem('mixmaster-song-title-overrides')||'{}') as Record<string,string>}catch{return {}}})
  const displaySongTitle = (song:SavedSong) => { const meta=songMetadata[song.id]?.title?.trim();if(meta)return meta; const override=songTitleOverrides[song.id]?.trim(); if(override)return override; const saved=song.song_title?.trim(); if(saved && !/^mixmaster[_\s-]*full[_\s-]*song$/i.test(saved))return saved; return song.name.replace(/\\.(wav|mp3|flac)$/i,'').replace(/_/g,' ') }
  const renameSong = (song:SavedSong,newTitle:string) => { const next={...songTitleOverrides,[song.id]:newTitle.slice(0,120)};setSongTitleOverrides(next);try{localStorage.setItem('mixmaster-song-title-overrides',JSON.stringify(next))}catch{} }
  const coverFor = (song:SavedSong) => song.has_artwork?'/api/generated-files/'+song.id+'/artwork':'/cover-'+(Math.max(0,songs.findIndex(item=>item.id===song.id))%4+1)+'.svg'
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
        if(job.status==='completed'&&job.file&&job.download_url){if(pendingSongMetadata.current)saveSongMetadata(job.file.id,pendingSongMetadata.current);pendingSongMetadata.current=null;setSelectedId(job.file.id);setRefreshKey(k=>k+1);setGenerating(false);setJobId('')}
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
    if(!title.trim()){setError('Enter a song title before generating.');return}
    pendingSongMetadata.current={title:title.trim(),style:description.trim(),lyrics:output==='instrumental'?'':lyrics}
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
    {toast&&<div className={'mm-sweet-toast '+toast.kind} role={toast.kind==='error'?'alert':'status'}><span>{toast.kind==='error'?<AlertTriangle size={22}/>:<CheckCircle2 size={22}/>}</span><strong>{toast.message}</strong><button type="button" aria-label="Dismiss notification" onClick={()=>setToast(null)}><X size={17}/></button></div>}
    {editMusicSong&&<div className="mm-sweet-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditMusicSong(null)}}><form className="mm-sweet-dialog" onSubmit={e=>{e.preventDefault();if(editMusicTitle.trim()){renameSong(editMusicSong,editMusicTitle.trim());saveSongMetadata(editMusicSong.id,{title:editMusicTitle.trim(),style:editMusicStyle.trim(),lyrics:editMusicLyrics.trim()});setEditMusicSong(null);setToast({kind:'success',message:'Song title saved in this browser.'})}}}><h3>Edit Music Details</h3><label>Song Title<input required maxLength={120} value={editMusicTitle} onChange={e=>setEditMusicTitle(e.target.value)} /></label><label>Style / Prompt<textarea rows={3} value={editMusicStyle} onChange={e=>setEditMusicStyle(e.target.value)} placeholder="Describe the music style"/></label><label>Lyrics<textarea rows={5} value={editMusicLyrics} onChange={e=>setEditMusicLyrics(e.target.value)} placeholder="Lyrics, if any"/></label><p>These details are saved in this browser, not on the server.</p><div className="mm-sweet-actions"><button type="button" onClick={()=>setEditMusicSong(null)}>Cancel</button><button type="submit">Save</button></div></form></div>}
    {extendSong&&<div className="mm-sweet-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!extendJobId)setExtendSong(null)}}><div className="mm-sweet-dialog mm-extend-dialog" role="dialog" aria-modal="true" aria-label="Extend Music">
      <h3><AudioLines size={19}/> Extend Music</h3><p>Continue <strong>{displaySongTitle(extendSong)}</strong> from a chosen point using the original audio as context.</p>
      <audio ref={extendPreviewRef} controls preload="metadata" src={'/api/generated-files/'+encodeURIComponent(extendSong.id)+'/stream'} onLoadedMetadata={e=>{const length=e.currentTarget.duration;if(Number.isFinite(length))setExtendAudioDuration(length)}}/>
      <label>Continue from {extendAt.toFixed(1)}s {extendAudioDuration>0?'of '+extendAudioDuration.toFixed(1)+'s':''}<input type="range" min={0} max={Math.max(0,extendAudioDuration-0.1)} step={0.1} value={Math.min(extendAt,Math.max(0,extendAudioDuration-0.1))} disabled={!extendAudioDuration||!!extendJobId} onChange={e=>{const point=Number(e.target.value);setExtendAt(point);if(extendPreviewRef.current)extendPreviewRef.current.currentTime=point}}/></label>
      <button type="button" onClick={()=>{if(extendPreviewRef.current){extendPreviewRef.current.currentTime=extendAt;void extendPreviewRef.current.play().catch(()=>{})}}}>Preview from extension point</button>
      <form onSubmit={e=>{e.preventDefault();void submitExtension(extendSong)}}>
        <label>Extended song title<input required maxLength={120} value={extendTitle} onChange={e=>setExtendTitle(e.target.value)} disabled={!!extendJobId}/></label>
        <label>Continuation prompt<textarea required rows={3} maxLength={2000} value={extendInstructions} onChange={e=>setExtendInstructions(e.target.value)} disabled={!!extendJobId}/></label>
        <label>Additional lyrics<textarea rows={4} maxLength={12000} value={extendLyrics} onChange={e=>setExtendLyrics(e.target.value)} disabled={!!extendJobId}/></label>
        <label>Extension length<select value={extendDuration} onChange={e=>setExtendDuration(Number(e.target.value))} disabled={!!extendJobId}><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={120}>2 minutes</option><option value={180}>3 minutes</option></select></label>
        {extendCapabilities&&!extendCapabilities.available&&<p role="status">Audio extension unavailable: {extendCapabilities.reason}</p>}
        {extendCapabilities?.available&&!extendCapabilities.merge_available&&<p role="status">FFmpeg is not installed; the continuation will be saved separately without a merged song.</p>}
        {extendJobId&&<p role="status">Extension progress: {extendStage||'queued'}…</p>}
        {extendError&&<p role="alert">{extendError}</p>}
        {extendResult&&<p role="status">Extended audio saved to My Music. <a href={'/api/generated-files/'+encodeURIComponent(extendResult.id)+'/download'}>Download WAV</a> · <button type="button" onClick={()=>{setSelectedId(extendResult.id);setExtendSong(null)}}>Open song</button></p>}
        <div className="mm-sweet-actions"><button type="button" disabled={!!extendJobId} onClick={()=>setExtendSong(null)}>Close</button><button type="submit" disabled={!extendCapabilities?.available||!extendAudioDuration||!!extendJobId}>{extendJobId?'Generating…':'Generate Extension'}</button></div>
      </form>
    </div></div>}
    {licenseSong&&<div className="mm-sweet-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setLicenseSong(null)}}><form className="mm-sweet-dialog" onSubmit={e=>{e.preventDefault();void requestLicense(licenseSong)}}><h3>Commercial License</h3><p>Request a commercial license for {displaySongTitle(licenseSong)}. A request alone does not grant rights; operator approval is required.</p><label>Contact email<input type="email" required value={licenseEmail} onChange={e=>setLicenseEmail(e.target.value)} placeholder="you@example.com"/></label>{libraryError&&<p role="alert">{libraryError}</p>}{libraryNotice&&<p role="status">{libraryNotice}</p>}{licenseRequestId&&<button type="button" disabled={startingCheckout} onClick={()=>void startLicenseCheckout()}>{startingCheckout?'Opening checkout…':'Continue to checkout (after approval)'}</button>}<div className="mm-sweet-actions"><button type="button" onClick={()=>setLicenseSong(null)}>Close</button><button type="submit" disabled={requestingLicense}>{requestingLicense?'Requesting…':'Request License'}</button></div></form></div>}
    {confirmDelete&&<div className="mm-sweet-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!deletingId)setConfirmDelete(null)}}><div className="mm-sweet-dialog" role="alertdialog" aria-modal="true" aria-labelledby="mm-confirm-title" aria-describedby="mm-confirm-description"><div className="mm-sweet-icon"><Trash2 size={30}/></div><h3 id="mm-confirm-title">Delete this song?</h3><p id="mm-confirm-description"><strong>{confirmDelete.song_title||confirmDelete.name}</strong> will be permanently removed from My Music. This cannot be undone.</p><div className="mm-sweet-actions"><button type="button" disabled={!!deletingId} onClick={()=>setConfirmDelete(null)}>Keep song</button><button type="button" disabled={!!deletingId} className="danger" onClick={()=>void deleteSong(confirmDelete)}>{deletingId?'Deleting…':'Yes, delete'}</button></div></div></div>}
    <div className="mm-generator-top"><div><span className="mm-generator-kicker"><Sparkles size={14}/> MIXMASTER AI STUDIO</span><h2>Music Generator</h2><p>Describe a song, shape its sound, and explore your creations.</p></div><a className="mm-generator-plan-link" href="#/pricing"><Sparkles size={16}/> Plans & credits <ArrowRight size={15}/></a></div>
    <div className="mm-generator-layout">
      <div className="mm-generator-compose">
        <div className="mm-generator-panel-head"><div><WandSparkles size={19}/><strong>Create Music</strong></div><button type="button" className="mm-generator-engine mm-engine-refresh" title="Check local generation engine" onClick={()=>setEngineRefresh(v=>v+1)}><RefreshCw size={12}/>{capabilities[output]?'Ready':'Not connected'}</button></div>
        <div className="fullsong-mode-bar" role="group" aria-label="Music generation mode"><button type="button" aria-pressed={!customMode} className={!customMode?'active':''} onClick={()=>{setCustomMode(false);setOutput('instrumental')}}>Simple</button><button type="button" aria-pressed={customMode} className={customMode?'active':''} onClick={()=>setCustomMode(true)}>Custom</button></div>
        {customMode&&<label>Lyrics <span className="mm-generator-hint">Write your own lyrics · verses and chorus</span><textarea rows={10} value={lyrics} maxLength={5000} onChange={e=>setLyrics(e.target.value)} placeholder="[Verse 1]&#10;Tonight we dance beneath the stars&#10;&#10;[Chorus]&#10;I see you…"/></label>}
        {customMode&&<div className="mm-lyric-tools"><a href="#/lyrics-generator" className="mm-lyrics-generator-link"><WandSparkles size={13}/> AI Lyrics Generator</a><button type="button" onClick={()=>setLyrics('[Verse 1]\nTonight we dance beneath the stars\nFeel the rhythm in our hearts\n\n[Pre-Chorus]\nEvery step will lead us closer\n\n[Chorus]\nI see you, shining in the light\nTogether we can dance all night\n\n[Verse 2]\n\n[Bridge]\n\n[Final Chorus]')}>Lyric starter · local template</button><span>{lyrics.length}/5000</span></div>}
        <div className="mm-style-section"><label htmlFor="mm-style-text">{customMode?'Style of Music':'Song Description'} <HelpCircle size={15} aria-label="Describe the instruments, genre, mood and rhythm"/></label><div className="mm-style-box"><textarea id="mm-style-text" rows={5} value={description} maxLength={customMode?1000:400} onChange={e=>setDescription(e.target.value)} placeholder="Enter style of music"/><span className="mm-style-count">{description.length}/{customMode?1000:400}</span><div className="mm-style-palette"><button type="button" className="mm-random-style" onClick={()=>{const next=randomStyles[Math.floor(Math.random()*randomStyles.length)];setDescription(next);setToast({kind:'success',message:'A fresh music style is ready'})}}><Shuffle size={17}/> Random Style</button>{(['genre','mood','voice','tempo'] as const).map(kind=><button type="button" key={kind} className={stylePanel===kind?'active':''} aria-expanded={stylePanel===kind} onClick={()=>setStylePanel(current=>current===kind?null:kind)}># {kind==='mood'?'Moods':kind==='voice'?'Voices':kind==='tempo'?'Tempos':'Genre'} <ChevronRight size={16}/></button>)}</div>{stylePanel&&<div className="mm-style-options" aria-label={stylePanel+' suggestions'}>{styleOptions[stylePanel].map(option=><button type="button" key={option} onClick={()=>{setDescription(current=>current.trim()?current.trim().replace(/[,;\\s]*$/, '')+', '+option:option);if(stylePanel==='genre'&&genres.includes(option))setGenre(option);setStylePanel(null)}}>{option}</button>)}</div>}</div></div>
        <div className="fullsong-toggles"><label className="fullsong-switch"><input type="checkbox" checked={output==='instrumental'} onChange={e=>{setOutput(e.target.checked?'instrumental':'full_song');if(!e.target.checked)setCustomMode(true)}}/><span>Instrumental</span><small>Music without vocals</small></label><label className="fullsong-switch"><input type="checkbox" checked={privateMode} onChange={e=>setPrivateMode(e.target.checked)}/><span>Private</span><small>Not yet supported</small></label></div>
        {customMode&&<><div className="mm-voice-accordion"><button type="button" onClick={()=>setVoicePanelOpen(v=>!v)} aria-expanded={voicePanelOpen}><span className="mm-voice-plus"><Plus size={20}/></span><strong>Voice</strong><span className="mm-voice-new">NEW</span><ChevronRight size={19}/></button>{voicePanelOpen&&<div className="mm-voice-details"><p>Choose the vocal character for your song. Voice generation requires a compatible singing engine.</p><label>Lead voice<select value={voice} onChange={e=>setVoice(e.target.value as Voice)}><option value="female">Female</option><option value="male">Male</option><option value="duet">Duet</option></select></label></div>}</div><div className="mm-vocal-gender"><span>Vocal Gender</span><div role="group" aria-label="Vocal gender"><button type="button" className={voice==='male'?'active':''} aria-pressed={voice==='male'} onClick={()=>setVoice('male')}>Male</button><button type="button" className={voice==='female'?'active':''} aria-pressed={voice==='female'} onClick={()=>setVoice('female')}>Female</button></div></div></>}
        <label className="mm-visible-title">Song Title<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} placeholder="Enter the name of your song" aria-label="Song title"/></label>
        {privateMode&&<p className="fullsong-privacy-warning" role="status">Private mode is not available yet. Generation is disabled because generated files do not have per-user access controls.</p>}
        <details className="mm-generator-settings"><summary><SlidersHorizontal size={15}/> Style & generation settings</summary><div className="fullsong-grid">

          <label>Genre<select value={genre} onChange={e=>setGenre(e.target.value)}>{genres.map(g=><option key={g}>{g}</option>)}</select></label>
          <label>Tempo (BPM)<input type="number" min={60} max={180} value={bpm} onChange={e=>setBpm(Number(e.target.value))}/></label>
          <label>Song length<select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}><option value={2}>2 minutes</option><option value={3}>3 minutes</option><option value={4}>4 minutes</option></select></label>

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
        <button type="button" className={'mm-favorites-filter'+(favoritesOnly?' active':'')} aria-pressed={favoritesOnly} onClick={()=>setFavoritesOnly(v=>!v)}><Heart size={16} fill={favoritesOnly?'currentColor':'none'}/> {favoritesOnly?'Showing favorites':'Favorites'} <span>{favorites.filter(id=>songs.some(song=>song.id===id)).length}</span></button>
        <label className="mm-generator-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Music" aria-label="Search generated music"/></label>
        {libraryError&&<p className="mm-generator-library-error" role="alert">{libraryError}</p>}
        {libraryNotice&&<p className="mm-generator-library-notice" role="status">{libraryNotice}</p>}
        <div className="mm-generator-song-list">
          {filteredSongs.map((song,index)=><div key={song.id} className={'mm-generator-song-row'+(selectedId===song.id?' selected':'')}><button type="button" className="mm-song-select" onClick={()=>{setSelectedId(song.id);setShowDetails(true)}}><span className={'mm-song-art mm-song-art-'+index%4}><img src={coverFor(song)} alt="" loading="lazy"/></span><span className="mm-song-meta"><strong>{displaySongTitle(song)}</strong><small>{new Date(song.created_at).toLocaleString()}</small><span className="mm-song-chip">{song.category==='full_song'?'Full Song':'Text to Song'}</span></span><span className="mm-song-row-actions"><Play size={15}/></span></button><button type="button" className="mm-song-quick" title="Play song" aria-label={'Play '+song.name} onClick={()=>selectAndPlay(song)}><Play size={16}/></button><button type="button" className="mm-song-quick" title="Show song details" aria-label={'Show details for '+song.name} onClick={()=>{setSelectedId(song.id);setShowDetails(true);setDetailTab('details')}}><FileText size={16}/></button><button type="button" className="mm-song-quick" title="Download song" aria-label={'Download '+displaySongTitle(song)} onClick={()=>void downloadSong(song)}><Download size={16}/></button><button type="button" className={'mm-song-favorite'+(favorites.includes(song.id)?' active':'')} title={favorites.includes(song.id)?'Remove from favorites':'Add to favorites'} aria-label={favorites.includes(song.id)?'Remove '+song.name+' from favorites':'Add '+song.name+' to favorites'} aria-pressed={favorites.includes(song.id)} onClick={()=>toggleFavorite(song)}><Heart size={17} fill={favorites.includes(song.id)?'currentColor':'none'}/></button><button type="button" className="mm-song-quick" title="Share song" aria-label={'Share '+song.name} onClick={()=>void shareSong(song)}><Share2 size={16}/></button><details className="mm-song-more"><summary title="More song actions" aria-label={'More actions for '+song.name}><MoreVertical size={17}/></summary><div className="mm-song-more-menu">
            <button type="button" onClick={()=>{setEditMusicSong(song);setEditMusicTitle(displaySongTitle(song));setEditMusicStyle(songMetadata[song.id]?.style||'');setEditMusicLyrics(songMetadata[song.id]?.lyrics||'')}}><Pencil size={15} aria-hidden="true"/> Edit Music Details</button>
            <button type="button" onClick={()=>{const meta=songMetadata[song.id];setTitle(displaySongTitle(song));if(meta?.style)setDescription(meta.style);if(meta?.lyrics){setLyrics(meta.lyrics);setCustomMode(true);setOutput('full_song')}else setCustomMode(false);setSelectedId(song.id);setToast({kind:'success',message:meta?.style?'Saved song details loaded into Create Music.':'Song title loaded. This track has no saved prompt; enter its style before generating.'})}}><Copy size={15} aria-hidden="true"/> Reuse Prompt</button>
            <button type="button" onClick={()=>{setSelectedId(song.id);setExtendSong(song)}}><AudioLines size={15} aria-hidden="true"/> Extend</button>
            <button type="button" onClick={()=>{setLicenseSong(song);setSelectedId(song.id)}}><ShieldCheck size={15} aria-hidden="true"/> License</button>
            <button type="button" disabled={deletingId!==null} onClick={()=>setConfirmDelete(song)}><Trash2 size={15} aria-hidden="true"/> Delete</button>
          </div></details></div>)}
          {!libraryLoading&&!filteredSongs.length&&<div className="mm-generator-empty"><div><Music2 size={34}/></div><strong>{search?'No matching tracks':'Your music will appear here'}</strong><p>{search?'Try a different search.':'Create a track to start your music library.'}</p></div>}
          {libraryLoading&&<p className="mm-generator-loading">Loading music…</p>}
        </div>
        <div className="mm-generator-library-footer"><a href="#/generated-files">All generated files <ArrowRight size={14}/></a></div>
      </div>
      {showDetails&&<aside className="mm-generator-detail mm-lyrics-only-panel" aria-label="Song name, style and lyrics">
        {selectedSong?<div className="mm-lyrics-only-content">
          <div className="mm-detail-art mm-song-cover-top"><div className="mm-detail-vinyl"><div className="mm-detail-vinyl-core"><img src={coverFor(selectedSong)} alt={"Cover artwork for "+(displaySongTitle(selectedSong))}/></div></div><span className="mm-detail-bars" aria-hidden="true">{Array.from({length:11},(_,i)=><i key={i} style={{height:15+Math.abs(Math.sin(i*.7))*58}}/>)}</span></div>
          <div className="mm-song-info-field"><span>Song name</span><h3>{displaySongTitle(selectedSong)}</h3>{(!selectedSong.song_title||/^mixmaster[_\s-]*full[_\s-]*song$/i.test(selectedSong.song_title))&&<label className="mm-song-rename-label">Set song title<input type="text" maxLength={120} value={songTitleOverrides[selectedSong.id]||''} onChange={e=>renameSong(selectedSong,e.target.value)} placeholder="Enter the correct song name" aria-label="Set title for this saved song"/><small>Saved in this browser for older tracks without title metadata</small></label>}</div>
          <div className="mm-song-info-field"><span>Style</span><p>{songMetadata[selectedSong.id]?.style||'No saved style for this track'}</p></div>
          <div className="mm-song-info-field"><span>Lyrics</span>{songMetadata[selectedSong.id]?.lyrics?.trim()?<><pre>{songMetadata[selectedSong.id].lyrics}</pre></>:<p className="mm-lyrics-only-empty">No lyrics are saved with this track.</p>}</div>
        </div>:<p className="mm-lyrics-only-empty">Select a song to view its saved name, style and lyrics.</p>}
      </aside>}
    </div>
    {selectedSong&&<div className="mm-generator-player mm-reference-player"><span className="mm-player-art"><img src={coverFor(selectedSong)} alt=""/></span><div className="mm-player-title"><strong>{displaySongTitle(selectedSong)}</strong><small>MixMaster AI</small></div><div className="mm-player-controls"><button type="button" title="Previous song" aria-label="Previous song" onClick={()=>skipSong(-1)}><SkipBack size={18}/></button><button type="button" className="mm-player-play" title={playing?'Pause':'Play'} aria-label={playing?'Pause':'Play'} onClick={togglePlayback}>{playing?<Pause size={20}/>:<Play size={20}/>}</button><button type="button" title="Next song" aria-label="Next song" onClick={()=>skipSong(1)}><SkipForward size={18}/></button></div><span className="mm-player-clock">{formatTime(playTime)}</span><input className="mm-player-seek" type="range" min={0} max={Math.max(playDuration,1)} step={0.1} value={Math.min(playTime,Math.max(playDuration,1))} aria-label="Seek song" onChange={e=>{if(playerRef.current)playerRef.current.currentTime=Number(e.target.value)}}/><span className="mm-player-clock">{formatTime(playDuration)}</span><button type="button" className="mm-player-share" title="Share song" aria-label="Share song" onClick={()=>void shareSong(selectedSong)}><Share2 size={18}/></button><button type="button" className={'mm-player-heart'+(favorites.includes(selectedSong.id)?' active':'')} title="Toggle favorite" aria-label="Toggle favorite" onClick={()=>toggleFavorite(selectedSong)}><Heart size={18} fill={favorites.includes(selectedSong.id)?'currentColor':'none'}/></button><button type="button" onClick={()=>void downloadSong(selectedSong)} title="Download selected song"><Download size={19}/></button><audio ref={playerRef} src={'/api/generated-files/'+selectedSong.id+'/stream'} preload="metadata" onLoadedMetadata={e=>setPlayDuration(e.currentTarget.duration)} onTimeUpdate={e=>setPlayTime(e.currentTarget.currentTime)} onEnded={()=>{setPlaying(false);skipSong(1)}} onPause={()=>setPlaying(false)} onPlay={()=>setPlaying(true)} /></div>}
  </section>
}
