// Testes do adapter SQLite — mesmas regras do domínio, persistência real.
// Destaque: corrida de lock otimista com dois bookSlot simultâneos (só 1 vence).

import { describe, expect, test } from 'bun:test'
import type { Appointment, DomainEvent, Slot } from '../src/domain/model.ts'
import { SqliteAgenda, SqliteEvents } from '../src/adapters/sqlite.ts'

function slot(id: string, start: string, status: Slot['status'] = 'free'): Slot {
  return { id, scheduleId: 's1', practitionerId: 'p1', start, durationMin: 30, status, version: 1 }
}

describe('SqliteAgenda', () => {
  test('persiste slots + lock otimista atômico (D4) — um bookSlot vence a corrida', async () => {
    const agenda = new SqliteAgenda(':memory:')
    agenda.seedSlots([slot('a', '2026-08-12T09:00:00')])

    // corrida real: ambos leem version=1 e tentam agendar
    const [r1, r2] = await Promise.all([agenda.bookSlot('a', 1), agenda.bookSlot('a', 1)])
    const winners = [r1, r2].filter((r) => r !== null)
    expect(winners.length).toBe(1) // D4 — exatamente 1 vencedor

    // quem perdeu NÃO pode agendar depois (status mudou)
    const s = await agenda.getSlot('a')
    expect(s?.status).toBe('booked')
    expect(s?.version).toBe(2)
    agenda.close()
  })

  test('listFreeSlots filtra por janela e status', async () => {
    const agenda = new SqliteAgenda(':memory:')
    agenda.seedSlots([slot('a', '2026-08-12T09:00:00'), slot('b', '2026-08-12T10:00:00'), slot('c', '2026-08-12T11:00:00')])
    await agenda.bookSlot('b', 1)

    const livres = await agenda.listFreeSlots('s1', '2026-08-12T08:00:00', '2026-08-12T18:00:00')
    expect(livres.map((s) => s.id)).toEqual(['a', 'c']) // b agendado sai
    agenda.close()
  })

  test('releaseSlot devolve o slot pra fila (R4)', async () => {
    const agenda = new SqliteAgenda(':memory:')
    agenda.seedSlots([slot('a', '2026-08-12T09:00:00')])
    await agenda.bookSlot('a', 1)
    await agenda.releaseSlot('a')
    expect((await agenda.getSlot('a'))?.status).toBe('free')
    agenda.close()
  })

  test('saveAppointment/getAppointment round-trip', async () => {
    const agenda = new SqliteAgenda(':memory:')
    const appt: Appointment = {
      id: 'appt_1',
      patientId: 'pa1',
      slotId: 'a',
      practitionerId: 'p1',
      kind: 'followUp',
      start: '2026-08-12T09:00:00',
      status: 'scheduled',
    }
    await agenda.saveAppointment(appt)
    const got = await agenda.getAppointment('appt_1')
    expect(got).toEqual(appt)
    agenda.close()
  })
})

describe('SqliteEvents', () => {
  test('idempotência por chave (D7) + fila entrega UMA vez (R5)', async () => {
    const events = new SqliteEvents(':memory:')
    const ev: DomainEvent = {
      kind: 'appointment.created',
      appointmentId: 'appt_1',
      payload: { slotId: 'a' },
      idempotencyKey: 'evt-1',
    }

    expect(await events.tryAppend(ev)).toBe(true) // 1ª vez entra
    expect(await events.tryAppend(ev)).toBe(false) // D7 — chave repetida NÃO entra

    expect((await events.pending()).length).toBe(1)
    await events.markSent('evt-1')
    expect((await events.pending()).length).toBe(0) // R5 — não reentrega
    events.close()
  })
})