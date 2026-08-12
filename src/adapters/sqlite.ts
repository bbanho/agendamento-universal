// Adapter de persistência real — SQLite nativo do Bun (bun:sqlite, zero dependências).
// Implementa as portas AgendaPort + EventStorePort. Lock otimista (D4) é atômico no SQL:
// UPDATE ... WHERE version = ? — se 0 rows, outro processo ganhou a corrida.

import { Database } from 'bun:sqlite'
import type { Appointment, DomainEvent, Slot } from '../domain/model.ts'
import type { AgendaPort, EventStorePort } from '../ports/ports.ts'

export class SqliteAgenda implements AgendaPort {
  private db: Database

  constructor(path = ':memory:') {
    this.db = new Database(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS slots (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        practitioner_id TEXT NOT NULL,
        start TEXT NOT NULL,
        duration_min INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'free',
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        slot_id TEXT NOT NULL,
        practitioner_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        start TEXT NOT NULL,
        status TEXT NOT NULL
      );
    `)
  }

  close() {
    this.db.close()
  }

  seedSlots(slots: Slot[]) {
    const ins = this.db.prepare(
      'INSERT INTO slots (id, schedule_id, practitioner_id, start, duration_min, status, version) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    for (const s of slots) ins.run(s.id, s.scheduleId, s.practitionerId, s.start, s.durationMin, s.status, s.version)
  }

  private rowToSlot(r: any): Slot {
    return {
      id: r.id,
      scheduleId: r.schedule_id,
      practitionerId: r.practitioner_id,
      start: r.start,
      durationMin: r.duration_min,
      status: r.status,
      version: r.version,
    }
  }

  async listFreeSlots(scheduleId: string, from: string, to: string) {
    const rows = this.db
      .query('SELECT * FROM slots WHERE schedule_id = ? AND status = ? AND start >= ? AND start <= ?')
      .all(scheduleId, 'free', from, to) as any[]
    return rows.map((r) => this.rowToSlot(r))
  }

  async getSlot(slotId: string) {
    const r = this.db.query('SELECT * FROM slots WHERE id = ?').get(slotId) as any
    return r ? this.rowToSlot(r) : null
  }

  /** D4 — lock otimista atômico: só vence quem atualiza com a version atual */
  async bookSlot(slotId: string, expectedVersion: number) {
    const res = this.db
      .query("UPDATE slots SET status = 'booked', version = version + 1 WHERE id = ? AND status = 'free' AND version = ?")
      .run(slotId, expectedVersion)
    if (res.changes === 0) return null
    return this.getSlot(slotId)
  }

  async releaseSlot(slotId: string) {
    this.db
      .query("UPDATE slots SET status = 'free', version = version + 1 WHERE id = ? AND status = 'booked'")
      .run(slotId)
  }

  async saveAppointment(appt: Appointment) {
    this.db
      .query(
        'INSERT INTO appointments (id, patient_id, slot_id, practitioner_id, kind, start, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(appt.id, appt.patientId, appt.slotId, appt.practitionerId, appt.kind, appt.start, appt.status)
  }

  async getAppointment(apptId: string) {
    const r = this.db.query('SELECT * FROM appointments WHERE id = ?').get(apptId) as any
    if (!r) return null
    return {
      id: r.id,
      patientId: r.patient_id,
      slotId: r.slot_id,
      practitionerId: r.practitioner_id,
      kind: r.kind,
      start: r.start,
      status: r.status,
    } as Appointment
  }
}

export class SqliteEvents implements EventStorePort {
  private db: Database

  constructor(path = ':memory:') {
    this.db = new Database(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        idempotency_key TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        appointment_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        sent INTEGER NOT NULL DEFAULT 0
      );
    `)
  }

  close() {
    this.db.close()
  }

  async tryAppend(event: DomainEvent) {
    const res = this.db
      .query('INSERT OR IGNORE INTO events (idempotency_key, kind, appointment_id, payload) VALUES (?, ?, ?, ?)')
      .run(event.idempotencyKey, event.kind, event.appointmentId, JSON.stringify(event.payload))
    return res.changes === 1 // D7 — chave repetida não entra
  }

  async pending() {
    const rows = this.db.query('SELECT * FROM events WHERE sent = 0').all() as any[]
    return rows.map((r) => ({
      kind: r.kind,
      appointmentId: r.appointment_id ?? '',
      payload: JSON.parse(r.payload),
      idempotencyKey: r.idempotency_key,
    })) as DomainEvent[]
  }

  async markSent(key: string) {
    this.db.query('UPDATE events SET sent = 1 WHERE idempotency_key = ?').run(key)
  }
}