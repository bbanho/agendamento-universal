// Testes de casos de uso (UC-01..UC-05) com adapters in-memory.

import { describe, expect, test } from 'bun:test'
import type { Patient, Slot } from '../src/domain/model.ts'
import { agendarConsulta } from '../src/usecases/agendarConsulta.ts'
import { cancelarConsulta } from '../src/usecases/cancelarConsulta.ts'
import { consultarDisponibilidade } from '../src/usecases/consultarDisponibilidade.ts'
import { remarcarConsulta } from '../src/usecases/remarcarConsulta.ts'
import { sincronizarERP } from '../src/usecases/sincronizarERP.ts'
import { MemoryAgenda, MemoryErp, MemoryEvents, MemoryNotify, MemoryPatients } from './memory.ts'

function freeSlot(id: string, start: string, durationMin = 30): Slot {
  return { id, scheduleId: 's1', practitionerId: 'p1', start, durationMin, status: 'free', version: 1 }
}

const paciente: Patient = { id: 'pa1', name: 'Maria', isFollowUp: false }

test('UC-01 — ConsultarDisponibilidade filtra slots livres e aponta violações R1', async () => {
  const agenda = new MemoryAgenda()
  agenda.slots.set('a', freeSlot('a', '2026-08-12T09:00:00'))
  agenda.slots.set('b', freeSlot('b', '2026-08-12T09:30:00')) // colado em a → viola R1
  agenda.slots.set('c', freeSlot('c', '2026-08-12T10:15:00')) // 15 min depois de b (b termina 10:00) → OK
  agenda.slots.set('d', { ...freeSlot('d', '2026-08-12T10:30:00'), status: 'booked' }) // não é livre

  const r = await consultarDisponibilidade(agenda, { scheduleId: 's1', from: '2026-08-12T08:00:00', to: '2026-08-12T12:00:00' })
  expect(r.slots.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  expect(r.violations).toEqual([{ prev: 'a', next: 'b' }])
})

test('UC-02 — AgendarConsulta: reserva slot, persiste e emite evento', async () => {
  const agenda = new MemoryAgenda()
  agenda.slots.set('s1', freeSlot('s1', '2026-08-12T10:00:00'))
  const events = new MemoryEvents()
  const notify = new MemoryNotify()

  const r = await agendarConsulta(agenda, new MemoryPatients([paciente]), events, { patientId: 'pa1', slotId: 's1' })
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(agenda.slots.get('s1')?.status).toBe('booked')
  expect(agenda.appointments.has(r.value.appointment.id)).toBe(true)
  expect(r.value.event.kind).toBe('appointment.created')
  expect(notify.calls.length).toBe(0) // notificação é responsabilidade do adapter, não do UC
})

test('UC-02 — slot ocupado ou paciente inexistente → conflito', async () => {
  const agenda = new MemoryAgenda()
  agenda.slots.set('s1', freeSlot('s1', '2026-08-12T10:00:00'))
  const events = new MemoryEvents()

  const semPaciente = await agendarConsulta(agenda, new MemoryPatients([]), events, { patientId: 'nope', slotId: 's1' })
  expect(semPaciente.ok).toBe(false)

  agenda.slots.set('s1', { ...freeSlot('s1', '2026-08-12T10:00:00'), status: 'booked' })
  const ocupado = await agendarConsulta(agenda, new MemoryPatients([paciente]), events, { patientId: 'pa1', slotId: 's1' })
  expect(ocupado.ok).toBe(false)
})

test('UC-02 — lock otimista: versão defasada falha (concorrência)', async () => {
  const agenda = new MemoryAgenda()
  agenda.slots.set('s1', freeSlot('s1', '2026-08-12T10:00:00'))
  const events = new MemoryEvents()

  // simula outra requisição que já reservou: versão avançou
  const a1 = await agendarConsulta(agenda, new MemoryPatients([paciente]), events, { patientId: 'pa1', slotId: 's1' })
  expect(a1.ok).toBe(true)
  const a2 = await agendarConsulta(agenda, new MemoryPatients([paciente]), events, { patientId: 'pa1', slotId: 's1' })
  expect(a2.ok).toBe(false) // slot agora booked
})

test('UC-03 — RemarcarConsulta: 23h antes é negada (R3)', async () => {
  const agenda = new MemoryAgenda()
  agenda.slots.set('s1', freeSlot('s1', '2026-08-12T10:00:00'))
  agenda.slots.set('s2', freeSlot('s2', '2026-08-13T14:00:00'))
  const events = new MemoryEvents()
  const criado = await agendarConsulta(agenda, new MemoryPatients([paciente]), events, { patientId: 'pa1', slotId: 's1' })
  expect(criado.ok).toBe(true)
  if (!criado.ok) return

  const r = await remarcarConsulta(agenda, events, { appointmentId: criado.value.appointment.id, newSlotId: 's2', now: '2026-08-11T11:00:00' })
  expect(r.ok).toBe(false) // 23h antes do original
})

test('UC-03 — RemarcarConsulta: 25h antes move e libera slot antigo', async () => {
  const agenda = new MemoryAgenda()
  agenda.slots.set('s1', freeSlot('s1', '2026-08-13T10:00:00'))
  agenda.slots.set('s2', freeSlot('s2', '2026-08-14T14:00:00'))
  const events = new MemoryEvents()
  const criado = await agendarConsulta(agenda, new MemoryPatients([paciente]), events, { patientId: 'pa1', slotId: 's1' })
  expect(criado.ok).toBe(true)
  if (!criado.ok) return

  const r = await remarcarConsulta(agenda, events, { appointmentId: criado.value.appointment.id, newSlotId: 's2', now: '2026-08-12T09:00:00' })
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.value.appointment.slotId).toBe('s2')
  expect(agenda.slots.get('s1')?.status).toBe('free') // R4: antigo liberado
})

test('UC-04 — CancelarConsulta libera slot imediatamente (R4)', async () => {
  const agenda = new MemoryAgenda()
  agenda.slots.set('s1', freeSlot('s1', '2026-08-12T10:00:00'))
  const events = new MemoryEvents()
  const criado = await agendarConsulta(agenda, new MemoryPatients([paciente]), events, { patientId: 'pa1', slotId: 's1' })
  expect(criado.ok).toBe(true)
  if (!criado.ok) return

  const r = await cancelarConsulta(agenda, events, { appointmentId: criado.value.appointment.id, motivo: 'paciente desistiu' })
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.value.slotLiberado).toBe(true)
  expect(agenda.slots.get('s1')?.status).toBe('free') // R4 — imediato
  expect(agenda.appointments.get(criado.value.appointment.id)?.status).toBe('cancelled')
})

test('UC-05 — SincronizarERP: exporta eventos uma única vez (R5) e importa catálogo', async () => {
  const agenda = new MemoryAgenda()
  agenda.slots.set('s1', freeSlot('s1', '2026-08-12T10:00:00'))
  const events = new MemoryEvents()
  const erp = new MemoryErp([{ id: 'p1', name: 'Dr. Ana' }], [paciente])
  const criado = await agendarConsulta(agenda, new MemoryPatients([paciente]), events, { patientId: 'pa1', slotId: 's1' })
  expect(criado.ok).toBe(true)
  if (!criado.ok) return

  const r1 = await sincronizarERP(events, erp)
  expect(r1.enviados).toBe(1)
  expect(erp.imported).toBe(true) // full duplex: catálogo importado
  expect(erp.processed).toBe(1)

  // segunda sincronização: fila não reentrega (R5 — cada evento UMA vez)
  const r2 = await sincronizarERP(events, erp)
  expect(r2.enviados).toBe(0)
  expect(erp.processed).toBe(1) // chave repetida NÃO processada de novo

  // mesmo que o ERP receba um reenvio manual, o receptor ignora (idempotente)
  await erp.syncEvents(await events.pending())
  expect(erp.processed).toBe(1)
})