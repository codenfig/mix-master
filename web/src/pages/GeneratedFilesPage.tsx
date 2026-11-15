import { useEffect, useState } from 'react'
import { Download, FolderOpen, RefreshCw, Trash2 } from 'lucide-react'
import '../styles/generated-files.css'

type GeneratedFile = { id: string; category: string; name: string; size: number; mime: string; created_at: string }
const labels: Record<string,string> = { dj_mixes: 'DJ Mixes', stem_splitter: 'Stem Splitter', vocal_remover: 'Vocal Remover', audio_mastering: 'Audio Mastering', voice_studio: 'Voice Studio', text_to_song: 'Text to Song', full_song: 'Full Song' }
export default function GeneratedFilesPage() {
  const [files,setFiles] = useState<GeneratedFile[]>([])
  const [category,setCategory] = useState('all')
  const [backend,setBackend] = useState('')
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  async function refresh() {
    setLoading(true);setError('')
    try {
      const response = await fetch('/api/generated-files')
      if (!response.ok) throw new Error('Unable to load saved files ('+response.status+').')
      const data = await response.json() as {files:GeneratedFile[];backend:string}
      setFiles(data.files);setBackend(data.backend)
    } catch (e) {setError(e instanceof Error ? e.message : 'Unable to load saved files.')}
    finally {setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])
  async function remove(file:GeneratedFile) {
    if (!window.confirm('Permanently delete "'+file.name+'"?')) return
    try {
      const response = await fetch('/api/generated-files/'+file.id,{method:'DELETE'})
      if (!response.ok) throw new Error('Delete failed ('+response.status+').')
      setFiles(current=>current.filter(item=>item.id!==file.id))
    } catch(e) {setError(e instanceof Error?e.message:'Delete failed.')}
  }
  const visible = category==='all'?files:files.filter(f=>f.category===category)
  return <div className="generated-page">
    <div className="generated-toolbar"><div><h2><FolderOpen size={22}/> Generated Files</h2><p>Persistent outputs · {backend==='s3'?'Private cloud storage':'Local external storage'} · {files.length} saved files</p></div><button type="button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
    <div className="generated-filters"><button className={category==='all'?'active':''} onClick={()=>setCategory('all')}>All files</button>{Object.entries(labels).map(([id,label])=><button key={id} className={category===id?'active':''} onClick={()=>setCategory(id)}>{label}</button>)}</div>
    {error&&<p className="generated-error" role="alert">{error}</p>}
    {loading?<p className="generated-empty">Loading saved files…</p>:!visible.length?<p className="generated-empty">No saved outputs in this category yet. Completed audio processing will appear here automatically.</p>:<div className="generated-list">{visible.map(file=><div className="generated-item" key={file.id}><div className="generated-file-icon"><FolderOpen size={20}/></div><div className="generated-file-info"><strong title={file.name}>{file.name}</strong><small>{labels[file.category]||file.category} · {(file.size/1048576).toFixed(1)} MiB · {new Date(file.created_at).toLocaleString()}</small></div><a href={'/api/generated-files/'+file.id+'/download'} download={file.name} title={'Download '+file.name}><Download size={17}/> Download</a><button type="button" className="generated-delete" onClick={()=>void remove(file)} title={'Delete '+file.name}><Trash2 size={17}/></button></div>)}</div>}
  </div>
}
