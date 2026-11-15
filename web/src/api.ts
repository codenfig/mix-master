export type Track = {
  name: string
  duration: number
  bpm: number
  key: string
  energy: number
}
export type MixPlan = { order_indices: number[]; quality_score: number; strategy: string; note: string; transitions: { from: string; to: string; compatibility: number; harmonic_score: number; tempo_distance: number; warning: string | null }[] }
export type AnalysisResult = { tracks: Track[]; order: string[]; plan?: MixPlan }

function formData(files: File[], count: number, transition: number): FormData {
  const data = new FormData()
  files.forEach(file => data.append('songs', file))
  data.append('count', String(count))
  data.append('transition', String(transition))
  return data
}

async function post(endpoint: string, files: File[], count: number, transition: number, signal?: AbortSignal) {
  let response: Response
  try {
    response = await fetch(endpoint, { method: 'POST', body: formData(files, count, transition), signal })
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

export async function mix(files: File[], count: number, transition: number, signal?: AbortSignal): Promise<Blob> {
  return (await post('/api/mix', files, count, transition, signal)).blob()
}
