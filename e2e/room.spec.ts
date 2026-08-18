import { expect, test } from '@playwright/test';
import {
  cameraOf,
  expectVideoFlowing,
  joinRoom,
  newRoomId,
  openPreJoin,
  submitJoin,
  tile,
} from './room';

test('two peers each see both tiles with video flowing', async ({ browser }) => {
  const roomId = newRoomId('tiles');
  const alfa = await browser.newContext();
  const bravo = await browser.newContext();

  try {
    const pageA = await joinRoom(alfa, roomId, 'Alfa');
    const pageB = await joinRoom(bravo, roomId, 'Bravo');

    await expect(tile(pageA, 'You')).toBeVisible();
    await expect(tile(pageA, 'Bravo')).toBeVisible();
    await expect(tile(pageB, 'You')).toBeVisible();
    await expect(tile(pageB, 'Alfa')).toBeVisible();

    await expectVideoFlowing(cameraOf(pageA, 'Bravo'));
    await expectVideoFlowing(cameraOf(pageB, 'Alfa'));
  } finally {
    await alfa.close();
    await bravo.close();
  }
});

test('a chat message crosses peer to peer', async ({ browser }) => {
  const roomId = newRoomId('chat');
  const alfa = await browser.newContext();
  const bravo = await browser.newContext();

  try {
    const pageA = await joinRoom(alfa, roomId, 'Alfa');
    const pageB = await joinRoom(bravo, roomId, 'Bravo');
    await expect(tile(pageA, 'Bravo')).toBeVisible();

    await pageA.getByRole('textbox', { name: 'Message' }).fill('the ferry is late');
    await pageA.getByRole('button', { name: 'Send' }).click();

    const log = pageB.getByRole('region', { name: 'Messages' });
    await expect(log.getByText('the ferry is late')).toBeVisible();
    await expect(log.getByText('Alfa')).toBeVisible();
  } finally {
    await alfa.close();
    await bravo.close();
  }
});

test('muting shows the remote mic indicator on the peer tile', async ({ browser }) => {
  const roomId = newRoomId('mute');
  const alfa = await browser.newContext();
  const bravo = await browser.newContext();

  try {
    const pageA = await joinRoom(alfa, roomId, 'Alfa');
    const pageB = await joinRoom(bravo, roomId, 'Bravo');
    await expect(tile(pageB, 'Alfa')).toBeVisible();
    await expect(tile(pageB, 'Alfa')).not.toContainText('Mic off');

    const mic = pageA.getByRole('button', { name: /^Mic / });
    await mic.click();

    await expect(mic).toHaveAttribute('aria-pressed', 'false');
    await expect(tile(pageB, 'Alfa')).toContainText('Mic off');

    await mic.click();
    await expect(tile(pageB, 'Alfa')).not.toContainText('Mic off');
  } finally {
    await alfa.close();
    await bravo.close();
  }
});

test('concurrent join connects both peers without glare deadlock', async ({ browser }) => {
  const roomId = newRoomId('glare');
  const alfa = await browser.newContext();
  const bravo = await browser.newContext();

  try {
    const pageA = await openPreJoin(alfa, roomId, 'Alfa');
    const pageB = await openPreJoin(bravo, roomId, 'Bravo');

    await Promise.all([submitJoin(pageA), submitJoin(pageB)]);

    await expect(tile(pageA, 'Bravo')).toBeVisible();
    await expect(tile(pageB, 'Alfa')).toBeVisible();

    await expectVideoFlowing(cameraOf(pageA, 'Bravo'));
    await expectVideoFlowing(cameraOf(pageB, 'Alfa'));
  } finally {
    await alfa.close();
    await bravo.close();
  }
});

test('a shared screen reaches the peer and blocks their share button', async ({ browser }) => {
  const roomId = newRoomId('screen');
  const alfa = await browser.newContext();
  const bravo = await browser.newContext();

  try {
    const pageA = await joinRoom(alfa, roomId, 'Alfa');
    const pageB = await joinRoom(bravo, roomId, 'Bravo');
    await expect(tile(pageB, 'Alfa')).toBeVisible();

    const shareA = pageA.getByRole('button', { name: /^Screen / });
    await shareA.click();

    await expect(pageA.getByLabel('Your screen')).toBeVisible();
    await expect(shareA).toHaveAttribute('aria-pressed', 'true');

    const screenOnB = pageB.getByLabel("Alfa's screen");
    await expect(screenOnB).toBeVisible();
    await expectVideoFlowing(screenOnB);
    await expect(pageB.getByRole('button', { name: 'Alfa is sharing' })).toBeDisabled();

    await shareA.click();

    await expect(pageA.getByLabel('Your screen')).toBeHidden();
    await expect(screenOnB).toBeHidden();
    await expect(pageB.getByRole('button', { name: /^Screen / })).toBeEnabled();
  } finally {
    await alfa.close();
    await bravo.close();
  }
});
