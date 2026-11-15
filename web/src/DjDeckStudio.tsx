import { useEffect, useRef, useState } from 'react'
import { AudioLines, Disc3, Headphones, Pause, Play, RotateCcw, SlidersHorizontal, UploadCloud, Volume2 } from 'lucide-react'
import './styles/dj-decks.css'

type Props = { files: File[]; bpm?: number; onUpload: () => void }
const bars = Array.from({length:62}, (_,i) => 16 + Math.round(Math.abs(Math.sin(i*1.37) * Math.cos(i*.22)) * 71))

export default function DjDeckStudio({files,bpm,onUpload}:Props) {
  const [sources,setSources] = useState<string[]>([])
  const [playing,setPlaying] = useState<[boolean,boolean]>([false,false])
  const [crossfade,setCrossfade] = useState(50)
  const [positions,setPositions] = useState<[number,number]>([0,0])
  const leftRef = useRef<HTMLAudioElement>(null)
  const rightRef = useRef<HTMLAudioElement>(null)
  const players = [leftRef,rightRef]

  useEffect(()=>{
    const urls = files.slice(0,2).map(file=>URL.createObjectURL(file))
    setSources(urls)
    setPlaying([false,false]);setPositions([0,0])
    return ()=> urls.forEach(url=>URL.revokeObjectURL(url))
  },[files])
  useEffect(()=>{
    if(leftRef.current) leftRef.current.volume = (100-crossfade)/100
    if(rightRef.current) rightRef.current.volume = crossfade/100
  },[crossfade,sources])
  async function toggle(index:0|1) {
    const player=players[index].current
    if(!player||!sources[index])return
    if(!player.paused){player.pause();return}
    try{await player.play()}catch{setPlaying(old=>old.map((v,i)=>i===index?false:v) as [boolean,boolean])}
  }
  function cue(index:0|1) {
    const player=players[index].current
    if(!player)return
    player.pause();player.currentTime=0
    setPositions(old=>old.map((v,i)=>i===index?0:v) as [number,number])
  }
  return <section className="mm-decks" aria-label="DJ mixing preview">
    <header className="mm-decks-heading"><div><span className="mm-decks-eyebrow"><SlidersHorizontal size={16}/> DJ STUDIO · LIVE DECKS</span><h2>Two decks. One perfect flow.</h2><p>Preview your uploaded tracks, cue each deck and blend them with the crossfader. Export settings are below.</p></div><span className="mm-decks-status"><Headphones size={15}/> Browser preview</span></header>
    <div className="mm-decks-grid">
      {([0,1] as const).map(index=><section className={'mm-deck mm-deck-'+index} key={index}>
        <div className="mm-deck-track"><span className="mm-deck-mini-art"><AudioLines size={22}/></span><div><small>DECK {index===0?'A':'B'}</small><strong title={files[index]?.name}>{files[index]?.name||'No track loaded'}</strong><span>{files[index]?'Ready to preview':'Upload at least '+(index+1)+' tracks'}</span></div></div>
        <div className="mm-deck-wave" aria-hidden="true">{bars.map((height,i)=><i key={i} style={{height:(i%7===0?height*.7:height)+'%'}}/>)}</div>
        <div className={'mm-deck-vinyl'+(playing[index]?' is-spinning':'')} aria-hidden="true"><div className="mm-deck-vinyl-center"><Disc3 size={38}/></div></div>
        <div className="mm-deck-transport"><button type="button" onClick={()=>cue(index)} disabled={!sources[index]}><RotateCcw size={14}/> CUE</button><button type="button" className="mm-deck-play" disabled={!sources[index]} aria-label={(playing[index]?'Pause':'Play')+' deck '+(index===0?'A':'B')} onClick={()=>void toggle(index)}>{playing[index]?<Pause size={20} fill="currentColor"/>:<Play size={20} fill="currentColor"/>}</button><span className="mm-deck-clock">{Math.floor(positions[index]/60).toString().padStart(2,'0')}:{Math.floor(positions[index]%60).toString().padStart(2,'0')}</span></div>
        <audio ref={players[index]} src={sources[index]} preload="metadata" onPlay={()=>setPlaying(old=>old.map((v,i)=>i===index?true:v) as [boolean,boolean])} onPause={()=>setPlaying(old=>old.map((v,i)=>i===index?false:v) as [boolean,boolean])} onTimeUpdate={e=>{const value=e.currentTarget.currentTime;setPositions(old=>old.map((v,i)=>i===index?value:v) as [number,number])}} onEnded={()=>setPlaying(old=>old.map((v,i)=>i===index?false:v) as [boolean,boolean])}/>
      </section>)}
      <aside className="mm-deck-mixer"><div className="mm-mixer-header"><SlidersHorizontal size={18}/> MIXER</div><fieldset className="mm-mixer-effects"><legend>Effects · not connected yet</legend>{["Reverb","Echo","Delay","Flanger","Phaser"].map(effect=><label key={effect}><span>{effect}</span><input type="checkbox" disabled aria-label={effect+" unavailable in browser preview"}/></label>)}</fieldset><div className="mm-mixer-info"><span>ANALYZED BPM</span><strong>{bpm?Math.round(bpm):'—'}</strong></div><div className="mm-mixer-info"><span>TRACKS LOADED</span><strong>{files.length}</strong></div><div className="mm-mixer-info"><span>DECK A</span><strong>{100-crossfade}%</strong></div><div className="mm-mixer-info"><span>DECK B</span><strong>{crossfade}%</strong></div><div className="mm-mixer-guide"><Volume2 size={17}/> Audio blend is a local browser preview. Final DJ mixes use your existing render engine.</div></aside>
    </div>
    <div className="mm-crossfader"><div><span>DECK A</span><strong>Crossfader</strong><span>DECK B</span></div><input type="range" min={0} max={100} value={crossfade} onChange={e=>setCrossfade(Number(e.target.value))} aria-label="Balance deck A and deck B"/></div>
    {!files.length&&<button className="mm-decks-upload" type="button" onClick={onUpload}><UploadCloud size={16}/> Upload tracks below to activate both decks</button>}
  </section>
}
