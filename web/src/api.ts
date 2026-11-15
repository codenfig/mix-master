export type Track = {
  name: string
  duration: number
  bpm: number
  key: string
  energy: number
}
export type MixPlan = { order_indices: number[]; quality_score: number; strategy: string; note: string; transitions: { from: string; to: string; compatibility: number; harmonic_score: number; tempo_distance: number; warning: string | null }[] }
export type AnalysisResult = { tracks: Track[]; order: string[]; plan?: MixPlan }

export type MasteringOptions = { target_lufs: number; true_peak: number; bass_db: number; treble_db: number; compression: boolean }
export type KickOptions = { enabled: boolean; style: "soft" | "club"; level: number; sourceIndex?: number }
function formData(files: File[], count: number, transition: number, mastering = "balanced", kick?: KickOptions, masteringOptions?: MasteringOptions): FormData {
  const data = new FormData()
  files.forEach(file => data.append('songs', file))
  data.append('count', String(count))
  data.append('transition', String(transition))
  data.append('mastering', mastering)
  if (kick) { data.append('kick_enabled', String(kick.enabled)); data.append('kick_style', kick.style); data.append('kick_level', String(kick.level)); data.append('kick_source_index', String(kick.sourceIndex ?? -1)) }
  if (masteringOptions) {
    data.append('target_lufs', String(masteringOptions.target_lufs))
    data.append('true_peak', String(masteringOptions.true_peak))
    data.append('bass_db', String(masteringOptions.bass_db))
    data.append('treble_db', String(masteringOptions.treble_db))
    data.append('compression', String(masteringOptions.compression))
  }
  return data
}

async function post(endpoint: string, files: File[], count: number, transition: number, signal?: AbortSignal, mastering = "balanced", kick?: KickOptions, masteringOptions?: MasteringOptions) {
  let response: Response
  try {
    response = await fetch(endpoint, { method: 'POST', body: formData(files, count, transition, mastering, kick, masteringOptions), signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('Cannot reach the audio server. Start FastAPI on port 8000.')
  }
  if (!response.ok) {
    let message = 'Request failed (' + response.status + ')'
    try {
      const body: unknown = await response.json()
      if (typeof body === 'object' && body !== null && 'detail' in body) {
        const detail = (body as { detail: unknown }).detail
        message = typeof detail === 'string' ? detail : JSON.stringify(detail)
      }
    } catch { /* Non-JSON server error */ }
    throw new Error(message)
  }
  return response
}

export async function analyze(files: File[], count: number, transition: number, signal?: AbortSignal): Promise<AnalysisResult> {
  return (await post('/api/analyze', files, count, transition, signal)).json() as Promise<AnalysisResult>
}

export type MixMetrics = { peak: number; rms: number; nearSilence: number; clippingRisk: boolean }
export async function mix(files: File[], count: number, transition: number, signal?: AbortSignal): Promise<{ audio: Blob; metrics: MixMetrics }> {
  const response = await post('/api/mix', files, count, transition, signal)
  return { audio: await response.blob(), metrics: {
    peak: Number(response.headers.get('X-MixMaster-Peak') || 0),
    rms: Number(response.headers.get('X-MixMaster-RMS') || 0),
    nearSilence: Number(response.headers.get('X-MixMaster-Near-Silence') || 0),
    clippingRisk: response.headers.get('X-MixMaster-Clipping-Risk') === 'true',
  } }
}

export type MixJob = { id: string; status: 'queued' | 'processing' | 'done' | 'failed'; completed_tracks: number; total_tracks: number; error: string | null; metrics: { peak: number; rms: number; near_silence_fraction: number; clipping_risk: boolean; transition_proxy_average?: number | null; mastering?: { preset: string; target_lufs: number | null; true_peak_limit_dbtp: number | null; bass_db?: number; treble_db?: number; compression?: boolean }; kick?: { enabled: boolean; style: string | null; bpm: number | null; level: number | null; source?: string | null; source_offset_seconds?: number | null }; transitions?: { from: string; to: string; proxy_score: number; loudness_gap_db: number; attempts: number }[] } | null }
export async function queueMix(files: File[], count: number, transition: number, signal?: AbortSignal, mastering = "balanced", kick?: KickOptions, masteringOptions?: MasteringOptions): Promise<{ id: string }> {
  return (await post('/api/jobs', files, count, transition, signal, mastering, kick, masteringOptions)).json()
}
export async function fetchJob(id: string, signal?: AbortSignal): Promise<MixJob> {
  const response = await fetch('/api/jobs/' + encodeURIComponent(id), { signal })
  if (!response.ok) throw new Error('Unable to retrieve mixing progress.')
  return response.json()
}
export async function downloadJob(id: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch('/api/jobs/' + encodeURIComponent(id) + '/download', { signal })
  if (!response.ok) throw new Error('Mix download is unavailable.')
  return response.blob()
}
