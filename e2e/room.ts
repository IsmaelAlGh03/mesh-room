import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

export function newRoomId(label: string): string {
  return `e2e-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function openPreJoin(context: BrowserContext, roomId: string, name: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/room/${roomId}`);
  await page.locator('#display-name').fill(name);
  return page;
}

export async function submitJoin(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Join / }).click();
  await expect(page.getByText('In the room')).toBeVisible();
}

export async function joinRoom(context: BrowserContext, roomId: string, name: string): Promise<Page> {
  const page = await openPreJoin(context, roomId, name);
  await submitJoin(page);
  return page;
}

export function tile(page: Page, name: string): Locator {
  return page.getByRole('figure', { name });
}

export function cameraOf(page: Page, name: string): Locator {
  return page.getByLabel(`${name}'s camera`);
}

export async function expectVideoFlowing(video: Locator): Promise<void> {
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.videoWidth), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
}
