import { useState } from 'react'
import { Download, Music2, Sparkles } from 'lucide-react'
import '../styles/text-to-song.css'

const defaultText = 'Tonight we dance beneath the stars\nFeel the rhythm in our hearts'
type Result = { file: {id:string;name:string;size:number};download_url:string }
export default function TextToSongPage() {
 const [text,setText]=useState(defaultText)
 const [genre,setGenre]=useState('afrobeat')
 const [bpm,setBpm]=useState(110)
 const [key,setKey]=useState('A')
 const [bars,setBars]=useState(16)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [result,setResult]=useState<Result|null>(null)
 async function generate(){
  setBusy(true);setError('');setResult(null)
  try{
   const response=await fetch('/api/text-to-song',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,genre,bpm,key,bars,output:'instrumental'})})
   if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(typeof body.detail==='string'?body.detail:'Generation failed ('+response.status+').')}
   setResult(await response.json() as Result)
  }catch(e){setError(e instanceof Error?e.message:'Could not generate instrumental.')}
  finally{setBusy(false)}
 }
 return <section className="textsong">
  <div className="textsong-hero"><Sparkles size={25}/><div><h2>Text to Song Studio</h2><p>Create original rule-based instrumental music offline. No AI API or external model required.</p></div></div>
  <label htmlFor="song-text">Lyrics or inspiration</label>
  <textarea id="song-text" value={text} onChange={e=>setText(e.target.value)} maxLength={2000} rows={4} placeholder="Describe the mood or enter lyrics…"/>
  <p className="textsong-note">Your text seeds the instrumental melody. This mode does not sing or speak the words.</p>
  <div className="textsong-fields"><label>Genre<select value={genre} onChange={e=>setGenre(e.target.value)}>{[['afrobeat','Afrobeat'],['amapiano','Amapiano'],['bongo','Bongo Flava'],['hiphop','Hip-Hop'],['house','House'],['pop','Pop']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
  <label>Tempo (BPM)<input type="number" min={60} max={180} value={bpm} onChange={e=>setBpm(Number(e.target.value))}/></label>
  <label>Key<select value={key} onChange={e=>setKey(e.target.value)}>{['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map(k=><option key={k}>{k}</option>)}</select></label>
  <label>Length<select value={bars} onChange={e=>setBars(Number(e.target.value))}>{[8,16,24,32].map(n=><option value={n} key={n}>{n} bars</option>)}</select></label></div>
  <button className="textsong-generate" disabled={busy||!text.trim()||bpm<60||bpm>180} onClick={()=>void generate()}><Music2 size={18}/>{busy?'Composing…':'Generate instrumental'}</button>
  {error&&<p className="textsong-error" role="alert">{error}</p>}
  {result&&<div className="textsong-result"><strong>Instrumental saved successfully</strong><p>{result.file.name} · {(result.file.size/1048576).toFixed(1)} MiB</p><audio controls src={result.download_url} preload="none"/><a href={result.download_url}><Download size={17}/> Download WAV</a><small>Also available in Generated Files → Text to Song.</small></div>}
 </section>
}
