// Entrypoint Supabase — lê credenciais do ambiente e sobe a API com persistência real.
// Uso: SUPABASE_URL=... SUPABASE_KEY=... bun run src/http/main-supabase.ts

import { createApp } from './server.ts'
import { SupabaseAgenda, SupabaseEvents } from '../adapters/supabase.ts'
import { MemoryPatients, MemoryErp } from '../../tests/memory.ts'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY')
  process.exit(1)
}

const agenda = new SupabaseAgenda({ url, key })
const events = new SupabaseEvents({ url, key })

// seed mínimo para demo (pacientes + ERP mock)
const patients = new MemoryPatients([
  { id: 'pa1', name: 'Maria Silva', isFollowUp: false },
  { id: 'pa2', name: 'João Souza', isFollowUp: true },
])
const erp = new MemoryErp([{ id: 'p1', name: 'Dra. Ana' }], [
  { id: 'pa1', name: 'Maria Silva', isFollowUp: false },
])

const server = createApp({ agenda, patients, events, erp } as any)
console.log(`agendamento-universal (Supabase) em http://localhost:${server.port}`)
