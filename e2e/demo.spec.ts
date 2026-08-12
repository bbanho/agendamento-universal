// E2E browser — frontend demo: carrega, agenda, verifica slot sumiu, screenshot (evidência).

import { expect, test } from '@playwright/test'

const BASE = process.env.APP_URL ?? 'http://localhost:3000'

test('frontend demo — agenda via UI e registra screenshot', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.getByRole('heading', { name: /Agendamento Universal/ })).toBeVisible()

  // 5 slots livres no seed
  const botoes = page.locator('button:has-text("Agendar")')
  await expect(botoes).toHaveCount(5)

  // agenda o 1º horário (09:00)
  await botoes.first().click()
  await expect(page.locator('.status.ok')).toContainText('Agendado 09:00')

  // slot agendado some da lista (agora 4)
  await expect(page.locator('button:has-text("Agendar")')).toHaveCount(4)

  await page.screenshot({ path: 'test-results/demo-agendado.png', fullPage: true })
})