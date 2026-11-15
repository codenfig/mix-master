import './styles/voice-studio.css'
import { useEffect, useState } from 'react'
import { AudioLines, Download, Mic2, UploadCloud } from 'lucide-react'

type Profile = { id: string; name: string; ready: boolean }
type Job = { id: string; status: string; error: string | null }
type Capabilities = { training_available: boolean; conversion_available: boolean; note: string }
export default function VoiceStudio() {
  const [profiles,setProfiles] = useState<Profile[]>([])
  const [caps,setCaps] = useState<Capabilities | null>(null)
  const [name,setName] = useState('My Voice')
  const [sample,setSample] = useState<File | null>(null)
  const [song,setSong] = useState<File | null>(null)
  const [consent,setConsent] = useState(false)
  const [selected,setSelected] = useState('')
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [output,setOutput] = useState('')
  useEffect(()=>{void refresh()},[])
  async function refresh(){
    try{
      const [a,b]=await Promise.all([fetch('/api/voice-studio/profiles'),fetch('/api/voice-studio/capabilities')])
      if(!a.ok||!b.ok) throw new Error('Voice Studio server is unavailable.')
      setProfiles(await a.json());setCaps(await b.json())
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to load Voice Studio.')}
  }
  async function request(path:string,data?:FormData){
    setBusy(true);setMessage('Working…');setOutput('')
    try{
      const response=await fetch(path,{method:'POST',body:data})
      if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.detail||'Request failed.')}
      const result=await response.json()
      if(!result.status){setMessage('Voice profile saved. Configure the training engine to train it.');await refresh();setSelected(result.id);return}
      const id=result.id as string
      while(true){
        await new Promise(resolve=>setTimeout(resolve,2000))
        const statusResponse=await fetch('/api/voice-studio/jobs/'+id)
        if(!statusResponse.ok)throw new Error('Unable to check job status.')
        const job:Job=await statusResponse.json()
        if(job.status==='failed')throw new Error(job.error||'Processing failed.')
        if(job.status==='complete'){setMessage('Processing complete.');if(path.endsWith('/convert'))setOutput('/api/voice-studio/jobs/'+id+'/download');await refresh();break}
        setMessage(job.status==='queued'?'Waiting for voice worker…':'Voice processing in progress…')
      }
    }catch(e){setMessage(e instanceof Error?e.message:'Voice processing failed.')}
    finally{setBusy(false)}
  }
  function create(){
    if(!sample||!consent)return
    const data=new FormData();data.append('name',name);data.append('sample',sample);data.append('consent','true')
    void request('/api/voice-studio/profiles',data)
  }
  function convert(){
    if(!song||!selected)return
    const data=new FormData();data.append('profile_id',selected);data.append('song',song)
    void request('/api/voice-studio/convert',data)
  }
  return <div className="voice-studio-page">
    <section className="master-hero"><div className="master-eyebrow"><Mic2 size={16}/> PERSONAL AI VOICE MODELS</div><h2>AI Voice <em>Studio.</em></h2><p>Upload your own voice, train a personal model, and convert vocals with a compatible singing-voice engine.</p><div className="master-hero-tags"><span>VOICE PROFILES</span><span>VOICE TRAINING</span><span>VOCAL CONVERSION</span></div></section>
    <div className="master-grid">
      <section className="master-panel"><div className="master-panel-title"><Mic2 size={22}/><div><h3>My voice profile</h3><p>Save recordings of a voice you own or have permission to use.</p></div></div>
        <label className="voice-field">Profile name<input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
        <label className="voice-field">Voice recording (WAV, MP3, FLAC or M4A)<input type="file" accept=".wav,.mp3,.flac,.m4a" onChange={e=>setSample(e.target.files?.[0]||null)}/></label>
        <label className="voice-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I own this voice or have explicit permission to train it.</label>
        <button className="master-action" disabled={busy||!sample||!consent||!name.trim()} onClick={create}><UploadCloud size={18}/> Save Voice Profile</button>
        <h4 className="master-label">Saved profiles</h4>
        {profiles.length===0?<p>No voice profiles saved in this server session.</p>:profiles.map(p=><div className="voice-profile" key={p.id}><div><strong>{p.name}</strong><small>{p.ready?'Trained':'Not trained'}</small></div><button disabled={busy||!caps?.training_available||p.ready} onClick={()=>void request('/api/voice-studio/profiles/'+p.id+'/train')}>Train</button></div>)}
      </section>
      <section className="master-panel"><div className="master-panel-title"><AudioLines size={22}/><div><h3>Convert singing voice</h3><p>Use a trained model with an installed SVC engine.</p></div></div>
        <label className="voice-field">Trained voice<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose voice profile</option>{profiles.filter(p=>p.ready).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="voice-field">Song or isolated vocal<input type="file" accept=".wav,.mp3,.flac,.m4a" onChange={e=>setSong(e.target.files?.[0]||null)}/></label>
        <button className="master-action" disabled={busy||!caps?.conversion_available||!selected||!song} onClick={convert}><Mic2 size={18}/> Convert Voice</button>
        {output&&<div className="master-player master-ready"><strong>Converted audio</strong><audio controls src={output}/><a href={output} download className="master-action"><Download size={18}/> Download WAV</a></div>}
        <p className="voice-note">Engine status: training {caps?.training_available?'configured':'not configured'} · conversion {caps?.conversion_available?'configured':'not configured'}. The conversion adapter expects an external engine; it does not automatically separate vocals or remix the instrumental.</p>
      </section>
    </div>
    {message&&<p className="master-status" role="status">{message}</p>}
  </div>
}
