
import { test, expect } from '@playwright/test';

test('TVE-micro HMI Verification', async ({ page }) => {
  await page.goto('http://localhost:5000');
  await page.waitForSelector('nav');

  // Check for live data on the Home screen
  const mainMotorRpm = await page.locator('div:has-text("Main motor") >> text=/.* RPM/');
  await expect(mainMotorRpm).toBeVisible();
  await page.screenshot({ path: 'frontend/home_screen_data.png' });

  // Navigate to the Heaters tab
  await page.click('text=Heaters');

  // Click on the Zone 1 heater card
  await page.click('div:has-text("Zone 1 temperature")');

  // Check if the setpoint input box is visible
  const setpointBox = await page.locator('div:has-text("Set point (°C)")');
  await expect(setpointBox).toBeVisible();
  await page.screenshot({ path: 'frontend/heaters_screen_setpoint.png' });

  // Open the setpoint box again
  await page.click('div:has-text("Set point (°C)")');

  // Wait for the keypad to be visible
  await page.waitForSelector('.keypad');
  await page.screenshot({ path: 'frontend/keypad_visible.png' });

  // Enter a new setpoint value
  await page.click('.keypad >> text=1');
  await page.click('.keypad >> text=2');
  await page.click('.keypad >> text=5');
  await page.click('.keypad >> text=OK');

  // Check if the setpoint has been updated
  // We will check the target value in the home screen instead.
  await page.click('text=Home');
  const targetValue = await page.locator('div:has-text("Heater Z1") >> text=/Target 125/i');
  await expect(targetValue).toBeVisible();
  await page.screenshot({ path: 'frontend/setpoint_updated.png' });
});
