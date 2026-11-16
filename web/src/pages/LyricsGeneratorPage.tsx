import { useEffect, useState } from 'react'
import { Copy, Download, Music2, RefreshCw, Send, Sparkles } from 'lucide-react'
import '../styles/lyrics-generator.css'

type Status = {available:boolean;model:string;reason:string|null}
type GenerateResult = {lyrics:string;model:string;mode:string}
const LANGUAGES=['English','Swahili','French','Spanish','Portuguese','Hindi','Arabic','German','Italian']
const DEFAULT_LYRICS=''
const key='mixmaster-lyrics-draft'

export default function LyricsGeneratorPage(){
  const [topic,setTopic]=useState('')
  const [genre,setGenre]=useState('Afro-pop')
  const [mood,setMood]=useState('Uplifting')
  const [language,setLanguage]=useState('English')
  const [structure,setStructure]=useState('standard')
  const [voice,setVoice]=useState('Any')
  const [lyrics,setLyrics]=useState(()=>{try{return localStorage.getItem(key)||DEFAULT_LYRICS}catch{return DEFAULT_LYRICS}})
  const [status,setStatus]=useState<Status|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [copied,setCopied]=useState(false)
  const [modelUsed,setModelUsed]=useState('')
  const refreshStatus=async()=>{
    try{const res=await fetch('/api/lyrics/status');if(!res.ok)throw Error('Lyrics service is unavailable');setStatus(await res.json())}
    catch{setStatus({available:false,model:'llama3.2:3b',reason:'Start the MixMaster backend and Ollama.'})}
  }
  useEffect(()=>{void refreshStatus()},[])
  useEffect(()=>{try{localStorage.setItem(key,lyrics)}catch{}},[lyrics])
  const generate=async(mode:'song'|'chorus')=>{
    if(!topic.trim()){setError('Enter a topic or story for your song.');return}
    setBusy(true);setError('');setCopied(false)
    try{
      const res=await fetch('/api/lyrics/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,genre,mood,language,structure,voice,existing_lyrics:lyrics,mode})})
      const data=await res.json() as GenerateResult & {detail?:string}
      if(!res.ok)throw Error(typeof data.detail==='string'?data.detail:'Lyrics generation failed.')
      if(mode==='song')setLyrics(data.lyrics)
      else {
        const replacement=data.lyrics.trim()
        const chorus=/\[Chorus\][\s\S]*?(?=\n\s*\[[^\]]+\]|$)/i
        setLyrics(previous=>chorus.test(previous)?previous.replace(chorus,replacement):previous.trim()+'\n\n'+replacement)
      }
      setModelUsed(data.model)
    }catch(e){setError(e instanceof Error?e.message:'Could not generate lyrics.')}
    finally{setBusy(false)}
  }
  const copy=async()=>{try{await navigator.clipboard.writeText(lyrics);setCopied(true)}catch{setError('Clipboard access is unavailable. Select the lyrics and copy manually.')}}
  const save=()=>{const blob=new Blob([lyrics],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='mixmaster-lyrics.txt';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}
  const useInSong=()=>{try{sessionStorage.setItem('mixmaster-imported-lyrics',lyrics)}catch{setError('Could not transfer lyrics to Music Generator.');return}window.location.hash='/full-song'}
  return <div className="mm-lyrics">
    <header className="mm-lyrics-header"><span className="mm-lyrics-emblem"><Music2 size={25}/></span><div><span className="mm-lyrics-kicker"><Sparkles size={13}/> LOCAL AI SONGWRITING</span><h2>AI Lyrics Generator</h2><p>Write original, singable lyrics on your Mac. No paid APIs or cloud generation.</p></div></header>
    <div className="mm-lyrics-grid">
      <section className="mm-lyrics-panel mm-lyrics-controls">
        <h3>Describe your song</h3>
        <label>Song topic or story<textarea value={topic} maxLength={300} rows={4} placeholder="A joyful song about finding hope and celebrating together…" onChange={e=>setTopic(e.target.value)}/></label>
        <div className="mm-lyrics-fields">
          <label>Genre<input value={genre} maxLength={80} onChange={e=>setGenre(e.target.value)}/></label>
          <label>Mood<input value={mood} maxLength={80} onChange={e=>setMood(e.target.value)}/></label>
          <label>Language<select value={language} onChange={e=>setLanguage(e.target.value)}>{LANGUAGES.map(x=><option key={x}>{x}</option>)}</select></label>
          <label>Song length<select value={structure} onChange={e=>setStructure(e.target.value)}><option value="short">Short</option><option value="standard">Standard</option><option value="extended">Extended</option></select></label>
          <label>Vocal style<select value={voice} onChange={e=>setVoice(e.target.value)}><option>Any</option><option>Male</option><option>Female</option><option>Duet</option><option>Choir</option></select></label>
        </div>
        <button className="mm-lyrics-generate" disabled={busy||!status?.available} onClick={()=>void generate('song')}><Sparkles size={18}/>{busy?'Writing lyrics…':'Generate Lyrics'}</button>
        <button className="mm-lyrics-outline" disabled={busy||!status?.available||!lyrics.trim()} onClick={()=>void generate('chorus')}><RefreshCw size={16}/> Regenerate Chorus</button>
        <div className="mm-lyrics-model"><span className={status?.available?'mm-lyrics-online':'mm-lyrics-offline'}/><div><strong>{status?.available?'Local model ready':'Local model not ready'}</strong><small>{status?.available?status.model:status?.reason||'Checking local Ollama…'}</small></div><button onClick={()=>void refreshStatus()} type="button">Check</button></div>
        {!status?.available&&<p className="mm-lyrics-setup">Install <code>ollama</code>, then run <code>ollama pull llama3.2:3b</code> and start Ollama locally. The MixMaster backend must also be running.</p>}
        {error&&<p role="alert" className="mm-lyrics-error">{error}</p>}
      </section>
      <section className="mm-lyrics-panel mm-lyrics-editor">
        <div className="mm-lyrics-editor-top"><div><h3>Your lyrics</h3><p>Editable draft · automatically saved in this browser</p></div><span>{lyrics.length}/12000</span></div>
        <textarea aria-label="Generated lyrics" value={lyrics} maxLength={12000} placeholder={'[Verse 1]\n\n[Pre-Chorus]\n\n[Chorus]\n'} onChange={e=>setLyrics(e.target.value)}/>
        {modelUsed&&<small>Generated locally with {modelUsed}. Review and edit before use.</small>}
        <div className="mm-lyrics-actions"><button disabled={!lyrics.trim()} onClick={()=>void copy()}><Copy size={15}/>{copied?'Copied':'Copy'}</button><button disabled={!lyrics.trim()} onClick={save}><Download size={15}/>Save .txt</button><button className="mm-lyrics-use" disabled={!lyrics.trim()} onClick={useInSong}><Send size={15}/>Use in Music Generator</button></div>
      </section>
    </div>
  </div>
}
