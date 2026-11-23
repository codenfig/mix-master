import { useEffect, useState } from 'react'
import { ArrowRight, AudioLines, FileAudio, FolderOpen, Headphones, LayoutDashboard, ListMusic, Music2, Sparkles } from 'lucide-react'
import OverviewPage from './pages/OverviewPage'
import MusicMixPage from './MusicMixPage'
import GeneratedFilesPage from './pages/GeneratedFilesPage'
import VocalRemover from './VocalRemover'
import StemSplitter from './StemSplitter'
import AudioMastering from './AudioMastering'
import VoiceStudio from './VoiceStudio'

type Page = 'overview' | 'music-mix' | 'vocal-remover' | 'stem-splitter' | 'audio-mastering' | 'voice-studio' | 'generated-files'
const pages: {id: Page; label: string; subtitle: string; icon: typeof Music2}[] = [
  {id:'overview',label:'Overview',subtitle:'Your audio production workspace',icon:LayoutDashboard},
  {id:'music-mix',label:'Music Mix',subtitle:'Arrange your uploaded tracks by energy',icon:ListMusic},
  {id:'vocal-remover',label:'Vocal Remover',subtitle:'Separate vocals and instruments',icon:AudioLines},
  {id:'stem-splitter',label:'Stem Splitter',subtitle:'Separate individual musical elements',icon:FileAudio},
  {id:'audio-mastering',label:'Audio Mastering',subtitle:'Polish tone, dynamics and loudness',icon:Sparkles},
  {id:'voice-studio',label:'AI Voice Studio',subtitle:'Voice processing and conversion',icon:Headphones},
  {id:'generated-files',label:'Processed Files',subtitle:'Browse your saved audio processing outputs',icon:FolderOpen},
]
function readPage(): Page {
  const path=window.location.hash.replace(/^#\/?/, '')
  return pages.find(p=>p.id===path)?.id || 'overview'
}
export default function App(){
  const [page,setPage]=useState<Page>(readPage)
  useEffect(()=>{const handler=()=>setPage(readPage());window.addEventListener('hashchange',handler);return()=>window.removeEventListener('hashchange',handler)},[])
  const navigate=(target:Page)=>{window.location.hash='/'+target;setPage(target);window.scrollTo(0,0)}
  const active=pages.find(p=>p.id===page)!
  return <div className="app mix-app">
    <aside className="sidebar mm-sidebar">
      <a href="#/overview" className="brand mm-brand" aria-label="MixMaster AI home">
        <div className="brand-icon"><img src="/mixmaster-mark.svg" alt="" width={40} height={40}/></div>
        <div><strong>MixMaster <span>AI</span></strong><small>MIX · PROCESS · MASTER</small></div>
      </a>
      <div className="nav-label">AUDIO WORKSPACE</div>
      <nav aria-label="Audio processing tools">{pages.map(entry=>{
        const Icon=entry.icon
        return <a key={entry.id} href={'#/'+entry.id} aria-current={page===entry.id?'page':undefined}
          className={'nav'+(page===entry.id?' active':'')} onClick={()=>setPage(entry.id)}>
          <Icon size={18}/><span>{entry.label}</span>
        </a>
      })}</nav>
      <div className="sidebar-bottom"><div className="mix-help"><Music2 size={19}/><strong>Make every track count.</strong><small>Analyze, mix, separate and master audio you have permission to use.</small></div></div>
    </aside>
    <main className="main">
      <header className="topbar mm-topbar">
        <nav className="mm-top-nav" aria-label="Quick navigation"><a href="#/music-mix" className={page==='music-mix'?'active':''}><ListMusic size={16}/> Music Mix</a><a href="#/audio-mastering" className={page==='audio-mastering'?'active':''}><Sparkles size={16}/> Mastering</a><a href="#/stem-splitter" className={page==='stem-splitter'?'active':''}><FileAudio size={16}/> Stems</a></nav>
        <span className="mm-top-status"><span className="online-dot"/> Audio Workspace</span>
      </header>
      <div className={'content content-'+page} key={page}>
        <div className="page-heading"><div><div className="eyebrow"><Sparkles size={14}/> MIXMASTER AUDIO STUDIO</div><h1>{active.label}</h1><p>{active.subtitle}</p></div><div className="page-heading-actions"><button className="action primary" onClick={()=>navigate('music-mix')}><ListMusic size={16}/> Music Mix <ArrowRight size={16}/></button></div></div>
        {page==='overview'&&<OverviewPage/>}
        {page==='music-mix'&&<MusicMixPage/>}
        {page==='vocal-remover'&&<VocalRemover/>}
        {page==='stem-splitter'&&<StemSplitter/>}
        {page==='audio-mastering'&&<AudioMastering/>}
        {page==='voice-studio'&&<VoiceStudio/>}
        {page==='generated-files'&&<GeneratedFilesPage/>}
        <footer><span>MixMaster AI · Audio production</span><span>Use audio you have rights to.</span></footer>
      </div>
    </main>
  </div>
}
