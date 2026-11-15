import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'

type Props = { url: string | null; onTime: (time: number, duration: number) => void; onReady: (ready: boolean) => void; playSignal: number }

export default function Waveform({ url, onTime, onReady, playSignal }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<WaveSurfer | null>(null)
  useEffect(() => {
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
    wave.on('error', () => onReady(false))
    return () => { instance.current = null; wave.destroy() }
    // Callbacks are only used for display; playback instance is tied to URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])
  useEffect(() => { if (playSignal > 0) void instance.current?.playPause() }, [playSignal])
  return <div className="waveform" ref={container} aria-label="Rendered audio waveform" />
}
