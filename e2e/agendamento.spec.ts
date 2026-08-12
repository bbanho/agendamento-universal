// E2E — fluxo completo via HTTP (Playwright API testing, um processo real + seed demo).
// Cobre: disponibilidade (R1) → agendar (R2) → concorrência (D4) → remarcar (R3)
// → cancelar (R4) → sincronizar ERP full duplex (R5).

import { expect, test } from '@playwright/test'

const BASE = process.env.APP_URL ?? 'http://localhost:3000'

test.describe('Fluxo de agendamento (E2E)', () => {
  test.describe.configure({ mode: 'serial' }) // fluxo com estado compartilhado — ordem importa
  let apptId = ''
  let slotId = ''

  test('GET /disponibilidade — slots livres, com pausa de 15 min (R1)', async ({ request }) => {
    const r = await request.get(
      `${BASE}/disponibilidade?scheduleId=s1&from=2026-08-12T08:00:00&to=2026-08-12T18:00:00`,
    )
    expect(r.status()).toBe(200)
    const body = await r.json()
    expect(body.slots.length).toBe(5)
    expect(body.violations).toEqual([]) // seed respeita R1
    expect(body.slots[0].id).toBe('sl-09')
  })

  test('POST /agendamentos — Maria agenda 10:00 (201)', async ({ request }) => {
    const r = await request.post(`${BASE}/agendamentos`, { data: { patientId: 'pa1', slotId: 'sl-10' } })
    expect(r.status()).toBe(201)
    const body = await r.json()
    apptId = body.appointment.id
    slotId = body.appointment.slotId
    expect(body.appointment.kind).toBe('first') // Maria é 1ª consulta
  })

  test('POST /agendamentos — mesmo slot ocupado → 409 (concorrência)', async ({ request }) => {
    const r = await request.post(`${BASE}/agendamentos`, { data: { patientId: 'pa2', slotId } })
    expect(r.status()).toBe(409)
  })

  test('POST /agendamentos/:id/remarcar — 23h antes → 409 (R3)', async ({ request }) => {
    const r = await request.post(`${BASE}/agendamentos/${apptId}/remarcar`, {
      data: { newSlotId: 'sl-11', now: '2026-08-11T11:00:00' },
    })
    expect(r.status()).toBe(409)
    const body = await r.json()
    expect(body.reason).toContain('Remarcação negada')
  })

  test('POST /agendamentos/:id/remarcar — 25h antes → 200 (R3/R4)', async ({ request }) => {
    const r = await request.post(`${BASE}/agendamentos/${apptId}/remarcar`, {
      data: { newSlotId: 'sl-11', now: '2026-08-11T09:00:00' },
    })
    expect(r.status()).toBe(200)
    const body = await r.json()
    expect(body.appointment.slotId).toBe('sl-11')
    expect(body.appointment.start).toBe('2026-08-12T11:00:00')
  })

  test('POST /agendamentos/:id/cancelar — libera slot imediatamente (R4)', async ({ request }) => {
    const r = await request.post(`${BASE}/agendamentos/${apptId}/cancelar`, { data: { motivo: 'desistiu' } })
    expect(r.status()).toBe(200)
    const body = await r.json()
    expect(body.slotLiberado).toBe(true)

    // slot antigo (sl-10) voltou a livre? não — o compromisso estava em sl-11 após remarcar.
    // verificamos o novo slot:
    const disp = await request.get(
      `${BASE}/disponibilidade?scheduleId=s1&from=2026-08-12T08:00:00&to=2026-08-12T18:00:00`,
    )
    const d = await disp.json()
    expect(d.slots.map((s: { id: string }) => s.id)).toContain('sl-11') // R4: livre de novo
  })

  test('POST /sincronizar — full duplex: importa catálogo + exporta eventos (R5)', async ({ request }) => {
    const r = await request.post(`${BASE}/sincronizar`)
    expect(r.status()).toBe(200)
    const body = await r.json()
    expect(body.enviados).toBeGreaterThanOrEqual(1)
  })
})