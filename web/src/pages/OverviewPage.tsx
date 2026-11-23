import { ArrowRight, AudioLines, FileAudio, FolderOpen, Headphones, ListMusic, Music2, Sparkles } from 'lucide-react'
const tools=[
  {name:'Music Mix',description:'Arrange full tracks by energy and export seamless blends.',href:'#/music-mix',icon:ListMusic},
  {name:'Audio Mastering',description:'Control loudness, equalization, width and dynamics.',href:'#/audio-mastering',icon:Sparkles},
  {name:'Stem Splitter',description:'Isolate instruments and other song components.',href:'#/stem-splitter',icon:FileAudio},
  {name:'Vocal Remover',description:'Extract an instrumental backing from an audio recording.',href:'#/vocal-remover',icon:AudioLines},
  {name:'AI Voice Studio',description:'Run supported voice conversion and processing workflows.',href:'#/voice-studio',icon:Headphones},
  {name:'Processed Files',description:'Browse saved outputs from your audio tools.',href:'#/generated-files',icon:FolderOpen},
]
export default function OverviewPage(){
  return <div className="overview-page">
    <section className="overview-banner"><div className="eyebrow"><Sparkles size={16}/> YOUR AUDIO PRODUCTION WORKSPACE</div><h2>Make every <span>sound count.</span></h2><p>Mix and master tracks, process vocals, and refine recordings in one precision studio.</p><a href="#/music-mix" className="overview-cta">Open Music Mix <ArrowRight size={17}/></a><div className="banner-orb" aria-hidden="true"><Music2 size={55}/></div></section>
    <div className="mix-overview-grid">{tools.map(tool=>{const Icon=tool.icon;return <a key={tool.href} className="mix-overview-card" href={tool.href}><span><Icon size={24}/></span><strong>{tool.name}</strong><p>{tool.description}</p><ArrowRight size={16}/></a>})}</div>
  </div>
}
