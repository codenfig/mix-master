import { useEffect, useRef, useState, type CSSProperties } from 'react'
import WaveSurfer from 'wavesurfer.js'

type Props = { url: string | null; onTime: (time: number, duration: number) => void; onReady: (ready: boolean) => void; playSignal: number }

export default function Waveform({ url, onTime, onReady, playSignal }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<WaveSurfer | null>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    setPlaying(false)
    if (!container.current || !url) { onReady(false); return }
    const wave = WaveSurfer.create({
      container: container.current,
      waveColor: '#6c5caa',
      progressColor: '#b06cff',
      cursorColor: '#f1d3ff',
      height: 82,
      barWidth: 3,
      barGap: 2,
      barRadius: 3,
      url,
    })
    instance.current = wave
    wave.on('ready', () => { onReady(true); onTime(0, wave.getDuration()) })
    wave.on('timeupdate', time => onTime(time, wave.getDuration()))
    wave.on('play', () => setPlaying(true))
    wave.on('pause', () => setPlaying(false))
    wave.on('finish', () => setPlaying(false))
    wave.on('error', () => { onReady(false); setPlaying(false) })
    return () => { instance.current = null; wave.destroy() }
    // Callbacks are only used for display; playback instance is tied to URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])
  useEffect(() => { if (playSignal > 0) void instance.current?.playPause() }, [playSignal])
  return <div className={'mix-wave-stage' + (playing ? ' is-playing' : '')}>
    <div className="mix-vibration-bars" aria-hidden="true">{Array.from({ length: 64 }, (_, i) => <i key={i} style={{ '--bar-index': i, '--bar-delay': ((i * 37) % 17) * -0.09 + 's', '--bar-scale': 0.42 + ((i * 13) % 11) / 12 } as CSSProperties}/>)}</div>
    <div className="waveform" ref={container} aria-label="Rendered audio waveform" />
    <div className="mix-vibration-glow" aria-hidden="true" />
  </div>
}
