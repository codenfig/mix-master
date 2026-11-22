import { useEffect, useState } from 'react'
import { ArrowRight, AudioLines, ChevronDown, Crown, FileAudio, FolderOpen, LayoutDashboard, ListMusic, Music2, Sparkles, WandSparkles } from 'lucide-react'
import LandingPage from './pages/LandingPage'
import OverviewPage from './pages/OverviewPage'
import MusicMixPage from './MusicMixPage'
import FullSongPage from './pages/FullSongPage'
import GeneratedFilesPage from './pages/GeneratedFilesPage'
import LyricsGeneratorPage from './pages/LyricsGeneratorPage'
import TextToSongPage from './pages/TextToSongPage'
import PricingPage from './pages/PricingPage'
import VocalRemover from './VocalRemover'
import StemSplitter from './StemSplitter'
import AudioMastering from './AudioMastering'
import VoiceStudio from './VoiceStudio'
import './styles/onboarding.css'

type Page =
  | 'landing' | 'features' | 'how-it-works' | 'studio-preview' | 'faq' | 'onboarding'
  | 'overview' | 'full-song' | 'music-mix' | 'generated-files'
  | 'lyrics-generator' | 'text-to-song' | 'pricing'
  | 'vocal-remover' | 'stem-splitter' | 'audio-mastering' | 'voice-studio'

const pages: { id: Page; label: string; subtitle: string }[] = [
  { id: 'landing', label: 'Home', subtitle: 'Create music with MixMaster AI' },
  { id: 'features', label: 'Features', subtitle: 'Explore MixMaster AI tools' },
  { id: 'how-it-works', label: 'How It Works', subtitle: 'From idea to music' },
  { id: 'studio-preview', label: 'Studio Preview', subtitle: 'Explore the creator workspace' },
  { id: 'faq', label: 'FAQ', subtitle: 'Frequently asked questions' },
  { id: 'onboarding', label: 'Welcome', subtitle: 'Discover MixMaster AI' },
  { id: 'overview', label: 'Overview', subtitle: 'Your creative command center' },
  { id: 'full-song', label: 'Music Generator', subtitle: 'Create music with a connected generation engine' },
  { id: 'music-mix', label: 'Music Mix', subtitle: 'Combine full songs by energy and crossfade between them' },
  { id: 'generated-files', label: 'Generated Files', subtitle: 'Browse and download your saved audio outputs' },
  { id: 'lyrics-generator', label: 'AI Lyrics Generator', subtitle: 'Draft original lyrics' },
  { id: 'text-to-song', label: 'Text to Song', subtitle: 'Compose instrumental music from text' },
  { id: 'pricing', label: 'Plans & Pricing', subtitle: 'Explore proposed creator plans' },
  { id: 'vocal-remover', label: 'Vocal Remover', subtitle: 'Separate vocals from instrumentals' },
  { id: 'stem-splitter', label: 'Stem Splitter', subtitle: 'Separate audio into stems' },
  { id: 'audio-mastering', label: 'Audio Mastering', subtitle: 'Polish your music' },
  { id: 'voice-studio', label: 'AI Voice Studio', subtitle: 'Manage voice conversion workflows' },
]
const primaryPages: Page[] = [
  'overview', 'full-song', 'music-mix', 'vocal-remover',
  'stem-splitter', 'audio-mastering', 'generated-files',
]
const publicPages: Page[] = ['landing', 'features', 'how-it-works', 'studio-preview', 'faq']
const removedMixPages = new Set(['studio', 'library', 'preview', 'history', 'settings'])

function readPage(): Page {
  const hash = window.location.hash.replace(/^#\/?/, '')
  if (removedMixPages.has(hash)) return 'music-mix'
  return pages.find(item => item.id === hash)?.id ?? 'landing'
}

function toolIcon(page: Page) {
  switch (page) {
    case 'overview': return LayoutDashboard
    case 'full-song': return Music2
    case 'music-mix': return ListMusic
    case 'vocal-remover': return AudioLines
    case 'stem-splitter': return FileAudio
    case 'audio-mastering': return Sparkles
    case 'generated-files': return FolderOpen
    case 'lyrics-generator': return WandSparkles
    default: return Music2
  }
}

export default function App() {
  const [page, setPage] = useState<Page>(readPage)
  useEffect(() => {
    const onHashChange = () => setPage(readPage())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = (destination: Page) => {
    window.location.hash = '/' + destination
    setPage(destination)
    window.scrollTo(0, 0)
  }

  if (page === 'landing' || page === 'features' || page === 'how-it-works' || page === 'studio-preview' || page === 'faq') {
    return <LandingPage route={page}/>
  }

  if (page === 'onboarding') return <div className="onboard-page">
    <header className="onboard-top">
      <div className="brand"><div className="brand-icon"><img src="/mixmaster-mark.svg" alt="" width={38} height={38}/></div><div><strong>MixMaster <span>AI</span></strong><small>MUSIC CREATION WORKSPACE</small></div></div>
      <button className="onboard-text-link" onClick={() => navigate('overview')}>Open workspace <ArrowRight size={17}/></button>
    </header>
    <main className="onboard-main">
      <div className="onboard-eyebrow"><Sparkles size={16}/> WELCOME TO YOUR MUSIC WORKSPACE</div>
      <h1>Make your music <em>extraordinary.</em></h1>
      <p className="onboard-lead">Generate music, arrange songs by energy, separate vocals, master audio and explore creative tools.</p>
      <div className="onboard-actions">
        <button className="onboard-primary" onClick={() => navigate('full-song')}>Open Music Generator <ArrowRight size={20}/></button>
        <button className="onboard-secondary" onClick={() => navigate('music-mix')}>Open Music Mix</button>
      </div>
      <div className="onboard-features">
        <button onClick={() => navigate('full-song')}><Music2 size={26}/><strong>Music Generator</strong><span>Create original music with a connected engine</span><ArrowRight size={17}/></button>
        <button onClick={() => navigate('music-mix')}><ListMusic size={26}/><strong>Music Mix</strong><span>Arrange uploaded songs by energy</span><ArrowRight size={17}/></button>
        <button onClick={() => navigate('stem-splitter')}><AudioLines size={26}/><strong>Stem Splitter</strong><span>Extract vocals, drums, bass and other stems</span><ArrowRight size={17}/></button>
        <button onClick={() => navigate('audio-mastering')}><Sparkles size={26}/><strong>Audio Mastering</strong><span>Polish loudness, dynamics and tone</span><ArrowRight size={17}/></button>
      </div>
      <p className="onboard-footnote">Music generation and voice conversion require compatible local or remote engines. Only upload audio you have permission to use.</p>
    </main>
  </div>

  const additionalPages = pages.filter(item =>
    !primaryPages.includes(item.id) && !publicPages.includes(item.id) &&
    item.id !== 'onboarding' && item.id !== 'pricing'
  )

  return <div className="app">
    <aside className="sidebar mm-sidebar">
      <a href="#/full-song" className="brand mm-brand" aria-label="MixMaster AI Music Generator">
        <div className="brand-icon"><img src="/mixmaster-mark.svg" alt="" width={42} height={42}/></div>
        <div><strong>MixMaster <span>AI</span></strong><small>CREATE · MIX · MASTER</small></div>
      </a>
      <div className="nav-label">YOUR WORKSPACE</div>
      <nav aria-label="Main tools">
        {pages.filter(item => primaryPages.includes(item.id)).map(item => {
          const Icon = toolIcon(item.id)
          return <a key={item.id} href={'#/' + item.id} aria-current={page === item.id ? 'page' : undefined}
            className={'nav' + (page === item.id ? ' active' : '')} onClick={() => setPage(item.id)}>
            <Icon size={18}/><span>{item.label}</span>
          </a>
        })}
      </nav>
      <details className="mm-more-tools" open={!primaryPages.includes(page) && page !== 'pricing'}>
        <summary>More tools <ChevronDown size={15}/></summary>
        <nav aria-label="Additional tools">
          {additionalPages.map(item => {
            const Icon = toolIcon(item.id)
            return <a key={item.id} href={'#/' + item.id} aria-current={page === item.id ? 'page' : undefined}
              className={'nav' + (page === item.id ? ' active' : '')} onClick={() => setPage(item.id)}>
              <Icon size={18}/><span>{item.label}</span>
            </a>
          })}
        </nav>
      </details>
      <div className="sidebar-bottom">
        <div className="mm-upgrade-card"><div><Crown size={19}/><strong>Pro Music</strong></div><small>Plans preview · proposed creator credits</small><a href="#/pricing" onClick={() => setPage('pricing')}>Explore plans <ArrowRight size={15}/></a></div>
        <button className="onboard-back" onClick={() => navigate('onboarding')}>Welcome &amp; guide</button>
      </div>
    </aside>
    <main className="main">
      <header className="topbar mm-topbar">
        <nav className="mm-top-nav" aria-label="Music workspace shortcuts">
          {([
            {id: 'full-song', label: 'AI Music', icon: Music2},
            {id: 'music-mix', label: 'Music Mix', icon: ListMusic},
            {id: 'stem-splitter', label: 'Stems', icon: AudioLines},
            {id: 'generated-files', label: 'Library', icon: FolderOpen},
          ] as const).map(link =>
            <a key={link.id} href={'#/' + link.id} className={page === link.id ? 'active' : ''}
              aria-current={page === link.id ? 'page' : undefined} onClick={() => setPage(link.id)}>
              <link.icon size={16}/>{link.label}
            </a>
          )}
        </nav>
        <div className="mm-top-actions"><span className="mm-top-status"><span className="online-dot"/> Local Workspace</span><a href="#/pricing" onClick={() => setPage('pricing')} className="mm-top-upgrade"><Crown size={16}/> Upgrade</a></div>
      </header>
      <div className={'content content-' + page + (page === 'overview' ? ' overview-content' : '')} key={page}>
        <div className="page-heading">
          <div><div className="eyebrow"><Sparkles size={14}/> MIXMASTER WORKSPACE</div><h1>{pages.find(item => item.id === page)?.label}</h1><p>{pages.find(item => item.id === page)?.subtitle}</p></div>
          <div className="page-heading-actions"><button className="action primary" onClick={() => navigate('music-mix')}><ListMusic size={16}/> Music Mix <ArrowRight size={16}/></button></div>
        </div>
        {page === 'overview' && <OverviewPage/>}
        {page === 'music-mix' && <MusicMixPage/>}
        {page === 'full-song' && <FullSongPage/>}
        {page === 'generated-files' && <GeneratedFilesPage/>}
        {page === 'lyrics-generator' && <LyricsGeneratorPage/>}
        {page === 'text-to-song' && <TextToSongPage/>}
        {page === 'vocal-remover' && <VocalRemover/>}
        {page === 'stem-splitter' && <StemSplitter/>}
        {page === 'audio-mastering' && <AudioMastering/>}
        {page === 'voice-studio' && <VoiceStudio/>}
        {page === 'pricing' && <PricingPage/>}
        <footer><span>MixMaster AI · Development workspace</span><span>Only upload audio you have permission to use.</span></footer>
      </div>
    </main>
  </div>
}
