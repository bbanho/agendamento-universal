// Adaptador de entrada HTTP (Bun.serve) — expõe os casos de uso como REST.
// Composição raiz: adapters in-memory (substituíveis por Postgres/ERP real sem tocar o domínio).

import type { Server } from 'bun'
import { agendarConsulta } from '../usecases/agendarConsulta.ts'
import { cancelarConsulta } from '../usecases/cancelarConsulta.ts'
import { consultarDisponibilidade } from '../usecases/consultarDisponibilidade.ts'
import { remarcarConsulta } from '../usecases/remarcarConsulta.ts'
import { sincronizarERP } from '../usecases/sincronizarERP.ts'
import { MemoryAgenda, MemoryErp, MemoryEvents, MemoryPatients } from '../../tests/memory.ts'

export interface AppDeps {
  agenda: MemoryAgenda
  patients: MemoryPatients
  events: MemoryEvents
  erp: MemoryErp
}

export function createApp(deps: AppDeps): Server<{}> {
  const { agenda, patients, events, erp } = deps

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  return Bun.serve({
    port: process.env.PORT ? Number(process.env.PORT) : 3000,
    async fetch(req) {
      const url = new URL(req.url)
      const method = req.method

      // GET / — frontend demo (estático)
      if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const file = Bun.file(new URL('../../public/index.html', import.meta.url))
        return new Response(file, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      }

      // GET /disponibilidade?scheduleId=s1&from=...&to=...
      if (method === 'GET' && url.pathname === '/disponibilidade') {
        const r = await consultarDisponibilidade(agenda, {
          scheduleId: url.searchParams.get('scheduleId') ?? 's1',
          from: url.searchParams.get('from') ?? '',
          to: url.searchParams.get('to') ?? '',
        })
        return json(r)
      }

      // POST /agendamentos  {patientId, slotId}
      if (method === 'POST' && url.pathname === '/agendamentos') {
        const body = await req.json()
        const r = await agendarConsulta(agenda, patients, events, body)
        return r.ok ? json({ appointment: r.value.appointment }, 201) : json(r.conflict, 409)
      }

      // POST /agendamentos/:id/remarcar  {newSlotId, now}
      const remarcar = url.pathname.match(/^\/agendamentos\/([^/]+)\/remarcar$/)
      if (method === 'POST' && remarcar) {
        const body = await req.json()
        const r = await remarcarConsulta(agenda, events, { appointmentId: remarcar[1], ...body })
        return r.ok ? json(r.value) : json(r.conflict, 409)
      }

      // POST /agendamentos/:id/cancelar  {motivo}
      const cancelar = url.pathname.match(/^\/agendamentos\/([^/]+)\/cancelar$/)
      if (method === 'POST' && cancelar) {
        const body = await req.json()
        const r = await cancelarConsulta(agenda, events, { appointmentId: cancelar[1], ...body })
        return r.ok ? json(r.value) : json(r.conflict, 409)
      }

      // POST /sincronizar
      if (method === 'POST' && url.pathname === '/sincronizar') {
        const r = await sincronizarERP(events, erp)
        return json(r)
      }

      // GET /health
      if (method === 'GET' && url.pathname === '/health') {
        return json({ ok: true })
      }

      return json({ error: 'not found' }, 404)
    },
  })
}

/** Seed demo: médico Dr. Ana, agenda s1 com slots de 30min (com pausas de 15min — R1) */
export function seedDemo(): AppDeps {
  const agenda = new MemoryAgenda()
  const slots = [
    { id: 'sl-09', start: '2026-08-12T09:00:00' },
    { id: 'sl-10', start: '2026-08-12T10:00:00' },
    { id: 'sl-11', start: '2026-08-12T11:00:00' },
    { id: 'sl-14', start: '2026-08-12T14:00:00' },
    { id: 'sl-15', start: '2026-08-12T15:00:00' },
  ]
  for (const s of slots) {
    agenda.slots.set(s.id, {
      id: s.id,
      scheduleId: 's1',
      practitionerId: 'p1',
      start: s.start,
      durationMin: 30,
      status: 'free',
      version: 1,
    })
  }
  const patients = new MemoryPatients([
    { id: 'pa1', name: 'Maria Silva', isFollowUp: false },
    { id: 'pa2', name: 'João Souza', isFollowUp: true }, // retorno — prioridade R2
  ])
  const events = new MemoryEvents()
  const erp = new MemoryErp([{ id: 'p1', name: 'Dra. Ana' }], [
    { id: 'pa1', name: 'Maria Silva', isFollowUp: false },
  ])
  return { agenda, patients, events, erp }
}