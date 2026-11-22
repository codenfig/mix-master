import { ArrowRight, AudioLines, FolderOpen, ListMusic, Music2, Sparkles, WandSparkles } from 'lucide-react'

export default function OverviewPage() {
  return <div className="overview-page">
    <section className="overview-banner">
      <div className="overview-banner-glow" aria-hidden="true"/>
      <div className="eyebrow"><Sparkles size={16}/> YOUR MUSIC WORKSPACE</div>
      <h2>Make your music <span>flow.</span></h2>
      <p>Generate original music, build energy-based playlists, separate audio stems and master your songs in one workspace.</p>
      <a href="#/music-mix" className="overview-cta">Open Music Mix <ArrowRight size={17}/></a>
      <div className="banner-orb"><Music2 size={58}/></div>
    </section>
    <div className="overview-grid overview-tools">
      <a className="panel overview-tool" href="#/full-song"><Music2 size={25}/><h2>Music Generator</h2><p>Compose songs using a configured generation engine.</p><span>Open generator <ArrowRight size={15}/></span></a>
      <a className="panel overview-tool" href="#/music-mix"><ListMusic size={25}/><h2>Music Mix</h2><p>Upload two to twenty songs, arrange them by energy and export a continuous mix.</p><span>Start mixing <ArrowRight size={15}/></span></a>
      <a className="panel overview-tool" href="#/stem-splitter"><AudioLines size={25}/><h2>Stem Splitter</h2><p>Separate vocals and instruments for further creative work.</p><span>Open stems <ArrowRight size={15}/></span></a>
      <a className="panel overview-tool" href="#/lyrics-generator"><WandSparkles size={25}/><h2>Lyrics Generator</h2><p>Draft original lyrics and develop song ideas.</p><span>Write lyrics <ArrowRight size={15}/></span></a>
      <a className="panel overview-tool" href="#/audio-mastering"><Sparkles size={25}/><h2>Audio Mastering</h2><p>Adjust loudness and polish finished recordings.</p><span>Open mastering <ArrowRight size={15}/></span></a>
      <a className="panel overview-tool" href="#/generated-files"><FolderOpen size={25}/><h2>Generated Files</h2><p>Find audio files saved by supported workflows.</p><span>Browse files <ArrowRight size={15}/></span></a>
    </div>
  </div>
}
