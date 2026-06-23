import { test, expect, Page } from '@playwright/test';

test('login y seleccionar coordenada', async ({ page }) => {
  await page.goto('http://localhost:4200/login');

  await page.getByRole('textbox', { name: 'Ingrese su usuario' }).click();
  await page.keyboard.type('Admin');
  await page.keyboard.press('Tab');
  await page.keyboard.type('admin123');

  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.locator('#map')).toBeVisible();

  await seleccionarCoordenada(page, 22.163572, -102.294774);

  await page.getByRole('button', { name: 'Ver Dashboard' }).click();
});

async function seleccionarCoordenada(page: Page, lat: number, lon: number) {
  await page.evaluate(({ lat, lon }) => {
    const map = (window as any).leafletMap;
    const L = (window as any).L;

    const latlng = L.latLng(lat, lon);

    map.fire('click', {
      latlng,
      layerPoint: map.latLngToLayerPoint(latlng),
      containerPoint: map.latLngToContainerPoint(latlng),
    });
  }, { lat, lon });

  await page.getByRole('button', { name: 'Ver Dashboard' }).click();
  await page.getByRole('combobox').first().selectOption('15_30');
  await page.getByRole('combobox').nth(1).selectOption('soilw1040');
  await page.getByRole('button', { name: 'Consultar histórico' }).click();
  await page.getByRole('textbox').first().fill('2025-01-11');
  await page.getByRole('button', { name: 'Consultar histórico' }).click();
}