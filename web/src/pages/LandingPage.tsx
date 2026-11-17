import { useState } from 'react'
import { ArrowRight, AudioLines, Check, ChevronDown, Disc3, Headphones, Menu, Mic2, Music2, Play, ShieldCheck, SlidersHorizontal, Sparkles, WandSparkles, X } from 'lucide-react'
import '../styles/landing.css'

const features = [
  { icon: Music2, label: 'AI Music Generator', text: 'Shape a song from a prompt, lyrics and your preferred style.' },
  { icon: WandSparkles, label: 'Lyrics & Creative Tools', text: 'Draft lyrics, explore genres and customize your arrangements.' },
  { icon: AudioLines, label: 'Vocal & Stem Tools', text: 'Separate instruments and vocals for deeper creative control.' },
  { icon: SlidersHorizontal, label: 'Mixing & Mastering', text: 'Prepare, refine and export audio from one creative workspace.' },
]
const steps = [
  { number: '01', title: 'Describe your sound', text: 'Choose a genre, mood, voice or write your own lyrics.' },
  { number: '02', title: 'Create your track', text: 'Use the available music engine to turn your idea into audio.' },
  { number: '03', title: 'Refine & save', text: 'Preview, download and organize your work in My Music.' },
]
type PublicRoute = 'landing' | 'features' | 'how-it-works' | 'studio-preview' | 'faq'
const publicRoutes: Record<string, PublicRoute> = { features: 'features', 'how-it-works': 'how-it-works', showcase: 'studio-preview', questions: 'faq' }
const routeTitles: Record<Exclude<PublicRoute, 'landing'>, { eyebrow: string; title: string; description: string }> = {
  features: { eyebrow: 'EXPLORE THE TOOLKIT', title: 'Everything you need to create.', description: 'Discover the creative tools that power MixMaster AI.' },
  'how-it-works': { eyebrow: 'YOUR CREATIVE JOURNEY', title: 'Your idea. Your music.', description: 'Three straightforward steps from inspiration to a track.' },
  'studio-preview': { eyebrow: 'MEET YOUR WORKSPACE', title: 'A studio built for creators.', description: 'See how the music creation experience comes together.' },
  faq: { eyebrow: 'HELP & ANSWERS', title: 'Frequently asked questions.', description: 'Useful answers before you start creating.' },
}
export default function LandingPage({ route = 'landing' }: { route?: PublicRoute }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [faqOpen, setFaqOpen] = useState<number | null>(0)
  const [notice, setNotice] = useState(false)
  const [selectedGenre, setSelectedGenre] = useState('Afro-pop')
  const genres = ['Afro-pop', 'Bongo Flava', 'R&B', 'Dancehall']
  const navigateTo = (section: string) => { const next = publicRoutes[section]; if (next) window.location.hash = '/' + next; setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }) }
  const isHome = route === 'landing'
  const enter = () => { window.location.hash = '/full-song' }
  return <div className="mm-landing">
    <header className="ml-nav">
      <a className="ml-logo" href="#/" aria-label="MixMaster AI home"><span><Music2 size={23}/></span><strong>MixMaster <em>AI</em></strong></a>
      <nav className={menuOpen?'ml-links open':'ml-links'} aria-label="Landing navigation">
        <button type="button" onClick={()=>navigateTo('features')}>Features</button><button type="button" onClick={()=>navigateTo('how-it-works')}>How it works</button><button type="button" onClick={()=>navigateTo('showcase')}>Studio preview</button><button type="button" onClick={()=>navigateTo('questions')}>FAQ</button>
      </nav>
      <div className="ml-nav-actions"><button type="button" className="ml-login" onClick={()=>setNotice(true)}>Log in</button><button type="button" className="ml-btn ml-btn-primary ml-nav-cta" onClick={enter}>Open Studio <ArrowRight size={16}/></button></div>
      <button type="button" className="ml-mobile-menu" aria-label={menuOpen?'Close menu':'Open menu'} aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?<X size={23}/>:<Menu size={23}/>}</button>
    </header>
    <main>
      {isHome && <section className="ml-hero ml-hero-v2">
        <div className="ml-hero-glow" aria-hidden="true"/>
        <div className="ml-hero-copy">
          <div className="ml-eyebrow"><span className="ml-live-dot"/> INTRODUCING YOUR AI MUSIC STUDIO</div>
          <h1>Make music.<br/><span>Make it yours.</span></h1>
          <p>From a single idea to a song you can call your own. Write lyrics, discover your sound and create with a studio built for imagination.</p>
          <div className="ml-hero-actions"><button className="ml-btn ml-btn-primary" type="button" onClick={enter}>Create your first song <ArrowRight size={18}/></button><button className="ml-btn ml-btn-outline" type="button" onClick={()=>navigateTo('features')}><Play size={17}/> Explore the tools</button></div>
          <div className="ml-hero-foot"><span><Check size={15}/> Lyrics & song creation</span><span><Check size={15}/> Vocal & audio tools</span></div>
          <div className="ml-hero-genres"><small>EXPLORE A SOUND</small><div>{genres.map(genre=><button type="button" key={genre} aria-pressed={selectedGenre===genre} className={selectedGenre===genre?'active':''} onClick={()=>setSelectedGenre(genre)}>{genre}</button>)}</div></div>
        </div>
        <div className="ml-hero-stage" aria-label="Interactive illustration of the MixMaster music studio">
          <div className="ml-stage-top"><span><span className="ml-visual-led"/> MIXMASTER / STUDIO</span><span>NOW CREATING <Sparkles size={13}/></span></div>
          <div className="ml-stage-main"><div className="ml-stage-record"><div className="ml-stage-record-center"><Music2 size={35}/></div></div><div className="ml-stage-orbit ml-stage-orbit-a"/><div className="ml-stage-orbit ml-stage-orbit-b"/></div>
          <div className="ml-stage-track"><div><small>YOUR NEXT SOUND</small><strong>{selectedGenre} · Original creation</strong><span>Made with MixMaster AI</span></div><div className="ml-stage-play"><AudioLines size={21}/></div></div>
          <div className="ml-stage-wave" aria-hidden="true">{Array.from({length:48},(_,i)=><i key={i} style={{height:(18+Math.abs(Math.sin(i*.53)*Math.cos(i*.17))*76)+'%'}}/>)}</div>
          <div className="ml-stage-bottom"><span><Disc3 size={15}/> YOUR MUSIC, YOUR WAY</span><span>CREATIVE SESSION 001</span></div>
        </div>
      </section>
NaN aria-label="Creative capabilities"><div><span><Mic2 size={17}/> Vocal Reduction</span><span><Music2 size={17}/> Song Creation</span><span><AudioLines size={17}/> Vocal Isolator</span><span><Headphones size={17}/> Audio Editing</span><span><SlidersHorizontal size={17}/> Mastering</span></div></section>}
      {(isHome || route === 'features') && <section className="ml-section" id="features"><div className="ml-section-intro"><div className="ml-eyebrow">ALL THE TOOLS. ONE STUDIO.</div><h2>Your creative process, <span>uninterrupted.</span></h2><p>One intuitive space to explore ideas, experiment with audio and keep your creative process moving.</p></div><div className="ml-feature-grid">{features.map(({icon:Icon,label,text},i)=><article className="ml-feature" key={label}><div className="ml-feature-icon"><Icon size={23}/></div><span className="ml-feature-index">0{i+1}</span><h3>{label}</h3><p>{text}</p><button type="button" onClick={enter} aria-label={'Explore '+label}>Explore tool <ArrowRight size={15}/></button></article>)}</div></section>}
      {(isHome || route === 'how-it-works') && <section className="ml-section ml-process" id="how-it-works"><div className="ml-section-intro"><div className="ml-eyebrow">THREE SIMPLE STEPS</div><h2>From first thought to <span>first track.</span></h2></div><div className="ml-steps">{steps.map(step=><article key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>}
      {(isHome || route === 'studio-preview') && <section className="ml-section ml-showcase" id="showcase"><div className="ml-showcase-copy"><div className="ml-eyebrow">YOUR STUDIO AWAITS</div><h2>Less setup.<br/><span>More creating.</span></h2><p>Write lyrics, choose a style, preview your music and find your saved tracks in one workspace. Available tools depend on your configured generation engine.</p><button className="ml-btn ml-btn-primary" type="button" onClick={enter}>Explore Music Generator <ArrowRight size={17}/></button></div><div className="ml-studio-preview"><div className="ml-preview-bar"><span/><span/><span/><small>MUSIC GENERATOR</small></div><div className="ml-preview-body"><div className="ml-preview-label"><Sparkles size={18}/> Create Music</div><div className="ml-preview-toggle"><strong>Simple</strong><span>Custom</span></div><small>Song description</small><div className="ml-preview-input">A soulful Afro-pop track with warm guitars, rhythmic percussion and a bright uplifting chorus...</div><div className="ml-preview-tags"><span>Afro-pop</span><span>Uplifting</span><span>Mid-tempo</span></div><div className="ml-preview-generate"><WandSparkles size={16}/> Generate Music <ArrowRight size={16}/></div></div></div></section>}
      {(isHome || route === 'faq') && <section className="ml-section ml-faq" id="questions"><div className="ml-section-intro"><div className="ml-eyebrow">GOOD TO KNOW</div><h2>Questions, <span>answered.</span></h2></div><div className="ml-faq-list">{[
        ['Can I try the music studio?','You can open the current studio. Some features require a configured backend music-generation engine.'],
        ['Can I use generated songs commercially?','Commercial use is not automatically granted. Individual licensing requires verified rights and payment, and the licensing workflow must be fully configured before launch.'],
        ['Do I need music production experience?','No. Start with a description, explore music styles and adjust the settings as you learn.'],
        ['Can I save and download my work?','The studio includes generated-song storage and download tools. Account-based private libraries are still under development.']
      ].map(([question,answer],i)=><div className="ml-faq-item" key={question}><button type="button" aria-expanded={faqOpen===i} onClick={()=>setFaqOpen(faqOpen===i?null:i)}>{question}<ChevronDown size={19}/></button>{faqOpen===i&&<p>{answer}</p>}</div>)}</div></section>}
      <section className="ml-final"><div className="ml-final-glow"/><h2>Don't just imagine it.<br/><span>Make it music.</span></h2><p>Open your creative workspace and start exploring.</p><button type="button" className="ml-btn ml-btn-primary" onClick={enter}>Open MixMaster Studio <Sparkles size={18}/></button></section>
    </main>
    <footer className="ml-footer"><a href="#/" className="ml-logo"><span><Music2 size={19}/></span><strong>MixMaster <em>AI</em></strong></a><p>Create. Mix. Make it yours.</p><div><button type="button" onClick={()=>navigateTo('features')}>Features</button><button type="button" onClick={()=>navigateTo('questions')}>FAQ</button><button type="button" onClick={()=>navigateTo('how-it-works')}>How it works</button><button type="button" onClick={enter}>Studio</button></div><small>© {new Date().getFullYear()} MixMaster AI</small></footer>
    {notice&&<div className="ml-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setNotice(false)}}><div className="ml-modal" role="alertdialog" aria-modal="true" aria-labelledby="ml-login-title"><button type="button" className="ml-modal-close" aria-label="Close" onClick={()=>setNotice(false)}><X size={19}/></button><ShieldCheck size={32}/><h2 id="ml-login-title">Accounts are coming soon</h2><p>Secure sign-in is not configured yet. You can explore the studio without creating an account, but private libraries and purchases will require authentication when available.</p><button className="ml-btn ml-btn-primary" type="button" onClick={enter}>Explore Studio <ArrowRight size={16}/></button></div></div>}
  </div>
}
