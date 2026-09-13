import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const sizes = [
  [1920, 1080],
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [768, 1024],
  [480, 640],
  [390, 844],
];
async function snapshotSizes(page: Page, name: string) {
  const original = page.viewportSize()!;
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await fit(page);
    await page.screenshot({
      path: 'test-results/visual/' + name + '-' + width + 'x' + height + '.png',
      fullPage: true,
    });
  }
  await page.setViewportSize(original);
}
async function fit(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'No page overflow',
  ).toBe(true);
  for (const dialog of await page.getByRole('dialog').all())
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      'No dialog overflow',
    ).toBe(true);
}
async function asUser(page: Page, name: string, route = '/home') {
  await page.context().clearCookies();
  await page
    .context()
    .addCookies(JSON.parse(readFileSync('test-results/' + name + '-session.json', 'utf8')).cookies);
  await page.goto('/#' + route);
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
}
test.describe.configure({ mode: 'serial' });
test('desktop setup, user search/request, administrator approval and queue', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connect to Jellyfin' })).toBeVisible();
  await page.screenshot({ path: 'test-results/setup-desktop.png', fullPage: true });
  await snapshotSizes(page, 'setup');
  await page.getByLabel('Jellyfin server URL').fill('http://jellyfin.test');
  await page.getByRole('button', { name: 'Test connection', exact: true }).click();
  await expect(page.getByText('Connected to Browser Test Jellyfin')).toBeVisible();
  await page.getByLabel('Administrator username').fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Connect & continue' }).click();
  await expect(page.getByRole('heading', { name: 'Find your next request' })).toBeVisible();
  await page.getByLabel('YouTube Data API key').fill('test-api-key');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A home for your videos' })).toBeVisible();
  await page.getByRole('button', { name: 'Review setup' }).click();
  await expect(page.getByRole('heading', { name: 'Review your setup' })).toBeVisible();
  await expect(page.getByText('Configured · hidden')).toBeVisible();
  await expect(page.locator('.setup-review')).not.toContainText('test-api-key');
  await page.screenshot({ path: 'test-results/setup-review-desktop.png', fullPage: true });
  await snapshotSizes(page, 'setup-review');
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByRole('heading', { name: 'You’re all set' })).toBeVisible();
  await page.getByRole('button', { name: 'Open YouTubeSeerr' }).click();
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  await page.screenshot({ path: 'test-results/discover-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /admin Administrator/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Username', { exact: true }).fill('member');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in with Jellyfin' }).click();
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Search', exact: true }).click();
  await page.locator('main').getByLabel('Search YouTube').fill('a test video');
  await page.locator('main').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Browser integration test video', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/search-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Browser integration test video', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Browser integration test video' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download now' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Request video', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('Pending approval', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/details-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('link', { name: 'My requests' }).click();
  await expect(page.getByText('Pending approval', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /member Jellyfin member/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in with Jellyfin' }).click();
  await page.getByRole('link', { name: 'All requests' }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.locator('.request-row .badge')).toHaveText('Queued');
  await page.screenshot({ path: 'test-results/requests-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Downloads', exact: true }).click();
  await expect(page.getByText('Queue position 1')).toBeVisible();
  await page.getByRole('button', { name: 'Pause queue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume queue' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'YouTube', exact: true }).click();
  await expect(page.getByLabel('YouTube Data API key')).toHaveValue('');
  // The viewport sweep intentionally makes many searches in the isolated test server.
  await page.getByLabel('Searches per user per minute').fill('60');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Notification' })).toContainText('Settings saved.');
  await page.getByRole('button', { name: 'Downloader', exact: true }).click();
  await expect(page.getByLabel('Download staging directory')).toBeVisible();
  await page.screenshot({ path: 'test-results/settings-desktop.png', fullPage: true });
  await page.context().storageState({ path: 'test-results/admin-session.json' });
  expect(errors).toEqual([]);
});
test('mobile navigation, search, details, and layout fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.screenshot({ path: 'test-results/login-mobile.png', fullPage: true });
  await page.getByLabel('Username', { exact: true }).fill('member');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in with Jellyfin' }).click();
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/discover-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('dialog', { name: 'Navigation' })
    .getByRole('link', { name: 'My requests' })
    .click();
  await expect(page.getByRole('heading', { name: 'My requests' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/requests-mobile.png', fullPage: true });
  await page.locator('.row-title').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.context().storageState({ path: 'test-results/member-session.json' });
});

async function openMedia(page: Page, url: string, title: string) {
  await page.goto('/#/search?q=' + encodeURIComponent(url));
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
}
test('collection scopes, explicit approval, selected videos and rejection retain their contracts', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await asUser(page, 'member');
  await openMedia(page, 'https://www.youtube.com/channel/UC' + 'U'.repeat(22), 'Field Notes');
  await expect(page.getByRole('radio', { name: /Recent videos/ })).toBeChecked();
  await page.getByRole('radio', { name: /Entire available channel/ }).check();
  await expect(page.getByRole('button', { name: 'Request channel', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: /I confirm/ }).check();
  await page.getByRole('button', { name: 'Request channel', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('Pending approval', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await openMedia(
    page,
    'https://www.youtube.com/playlist?list=PL' + 'P'.repeat(22),
    'Journeys worth taking',
  );
  await page.getByRole('radio', { name: /Selected videos/ }).check();
  await expect(page.getByRole('button', { name: 'Request playlist', exact: true })).toBeDisabled();
  await page
    .getByRole('checkbox', { name: 'Select Across the Alps: a journey by rail', exact: true })
    .check();
  await page
    .getByRole('checkbox', { name: 'Select How a mechanical watch keeps time', exact: true })
    .check();
  await page.screenshot({
    path: 'test-results/visual/playlist-selection-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Request playlist', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('Pending approval', { exact: true }),
  ).toBeVisible();
  const requests = await (await page.request.get('/api/requests')).json();
  const selected = requests.find((r: any) => r.media.type === 'playlist');
  expect(selected.mode).toBe('selected');
  expect(selected.options.selectedIds).toEqual(['V0000000001', 'V0000000002']);
  await page.reload();
  await page.getByRole('button', { name: 'Journeys worth taking', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('2 selected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await openMedia(
    page,
    'https://www.youtube.com/playlist?list=PL' + 'N'.repeat(22),
    'New discoveries',
  );
  await page.getByRole('radio', { name: /New additions only/ }).check();
  await page.getByRole('button', { name: 'Request playlist', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('Pending approval', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await openMedia(page, 'https://www.youtube.com/channel/UC' + 'F'.repeat(22), 'Orbital');
  await page.getByRole('radio', { name: /Future uploads only/ }).check();
  await page.getByRole('button', { name: 'Request channel', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('Pending approval', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await openMedia(
    page,
    'https://www.youtube.com/watch?v=V0000000003',
    'The hidden world beneath the ocean',
  );
  await page.getByRole('button', { name: 'Request video', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('Pending approval', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Cancel request?', exact: true })
    .getByRole('button', { name: 'Cancel request', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Request video', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await asUser(page, 'admin', '/requests');
  const channel = page
    .locator('.request-row')
    .filter({ has: page.getByRole('button', { name: 'Field Notes', exact: true }) });
  await channel.getByRole('button', { name: 'Approve', exact: true }).click();
  const approval = page.getByRole('dialog', { name: 'Approve entire channel?', exact: true });
  await expect(approval.getByRole('button', { name: 'Approve collection' })).toBeDisabled();
  await approval.getByRole('checkbox').check();
  await page.screenshot({
    path: 'test-results/visual/collection-approval-desktop.png',
    fullPage: true,
  });
  await approval.getByRole('button', { name: 'Approve collection' }).click();
  await expect(channel.locator('.badge')).toHaveText('Queued');
  const playlist = page
    .locator('.request-row')
    .filter({ has: page.getByRole('button', { name: 'Journeys worth taking', exact: true }) });
  await playlist.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(playlist.locator('.badge')).toHaveText('Queued');
  const future = page
    .locator('.request-row')
    .filter({ has: page.getByRole('button', { name: 'Orbital', exact: true }) });
  await future.locator('.row-title').click();
  await expect(page.getByRole('radio', { name: /Future uploads only/ })).toBeChecked();
  await page.getByRole('button', { name: 'Download now', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Queued', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const rejection = page
    .locator('.request-row')
    .filter({ has: page.getByRole('button', { name: 'New discoveries', exact: true }) });
  await rejection.getByRole('button', { name: /Reject/ }).click();
  await page.getByLabel('Reason (optional)').fill('This collection is outside the library scope.');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reject request', exact: true })
    .click();
  await expect(rejection.locator('.badge')).toHaveText('Rejected');
  await rejection.getByText('Request error').click();
  await expect(rejection).toContainText('This collection is outside the library scope.');
  await page.reload();
  await expect(
    page.locator('.request-row').filter({ hasText: 'New discoveries' }).locator('.badge'),
  ).toHaveText('Rejected');
  expect(errors).toEqual([]);
});

test('queue progress, retry, cancellation, history, settings persistence and library refresh', async ({
  page,
}) => {
  await page.request.post('/__test/activity');
  await asUser(page, 'admin', '/downloads');
  await expect(page.getByText('64.7%', { exact: true })).toBeVisible();
  await expect(page.getByText(/4.3 MB\/s.*ETA 1:23/)).toBeVisible();
  await page.request.post('/__test/progress');
  await expect(page.getByText('78.2%', { exact: true })).toBeVisible({ timeout: 7000 });
  await expect(page.getByText(/5.0 MB\/s.*ETA 0:42/)).toBeVisible();
  const failed = page.locator('.download-row').filter({ hasText: 'Designing a city for people' });
  await failed.getByText('Download failed — view details').click();
  await expect(failed).toContainText('temporarily unavailable');
  await failed.getByRole('button', { name: /Retry job/ }).click();
  await expect(failed.locator('.badge')).toHaveText('Queued');
  await failed.getByRole('button', { name: /Cancel job/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel download', exact: true })
    .click();
  await expect(failed.locator('.badge')).toHaveText('Cancelled');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('A field guide to the night sky', { exact: true })).toBeVisible();
  const complete = page
    .locator('.download-row')
    .filter({ hasText: 'A field guide to the night sky' });
  await complete.getByRole('button', { name: /Remove job/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove from history', exact: true })
    .click();
  await expect(complete).toHaveCount(0);
  // The request remains available; removing job history does not remove published media.
  await page.goto('/#/requests?status=AVAILABLE');
  await expect(
    page
      .locator('.request-row')
      .filter({ hasText: 'A field guide to the night sky' })
      .locator('.badge'),
  ).toHaveText('Available');
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'YouTube', exact: true }).click();
  await expect(page.getByLabel('YouTube Data API key')).toHaveAttribute('type', 'password');
  await page.getByLabel('Recent channel videos').fill('12');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Notification' })).toContainText('Settings saved.');
  await page.reload();
  await page.getByRole('button', { name: 'YouTube', exact: true }).click();
  await expect(page.getByLabel('Recent channel videos')).toHaveValue('12');
  await page.getByRole('button', { name: 'Jellyfin', exact: true }).click();
  await page.getByRole('button', { name: 'Load saved server libraries' }).click();
  await expect(page.getByLabel('Choose a library')).toBeVisible();
  await page.getByRole('button', { name: 'Refresh library now' }).click();
  await expect(page.getByRole('status', { name: 'Notification' })).toContainText('queued');
  await page.getByRole('button', { name: 'Users', exact: true }).click();
  const self = page.locator('.user-row').filter({ hasText: 'Jellyfin administrator' });
  await expect(self.getByRole('button', { name: 'Make admin' })).toBeDisabled();
  await asUser(page, 'member', '/settings');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  expect((await page.request.get('/api/settings')).status()).toBe(403);
});

for (const [width, height] of sizes)
  test('responsive visual review ' + width + '×' + height, async ({ page }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.request.post('/__test/activity');
    await asUser(page, 'admin');
    await expect(page.locator('.media-card').first()).toBeVisible();
    async function capture(name: string) {
      await fit(page);
      await page.screenshot({
        path: 'test-results/visual/' + name + '-' + width + 'x' + height + '.viewport.png',
      });
      await page.screenshot({
        path: 'test-results/visual/' + name + '-' + width + 'x' + height + '.png',
        fullPage: true,
      });
    }
    await capture('home');
    const content = await page.locator('main').boundingBox();
    expect(content!.width).toBeGreaterThan(width > 800 ? width - 300 : width - 10);
    if (width <= 800) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      const drawer = page.getByRole('dialog', { name: 'Navigation' });
      await expect(drawer).toBeVisible();
      for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
      expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(drawer).not.toBeVisible();
      await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
    } else await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.goto('/#/search?q=visual%20library&type=all');
    await expect(page.locator('.media-card')).toHaveCount(17);
    await capture('search');
    const columns = await page
      .locator('.media-grid')
      .first()
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBeGreaterThanOrEqual(width >= 1280 ? 4 : width >= 768 ? 3 : 2);
    expect(columns).toBeLessThanOrEqual(width >= 1280 ? 6 : width >= 768 ? 4 : 2);
    await page
      .getByRole('button', { name: 'Across the Alps: a journey by rail', exact: true })
      .click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Across the Alps: a journey by rail' }),
    ).toBeVisible();
    await capture('details');
    if (width > 800) {
      const art = await page.locator('.detail-art').boundingBox(),
        controls = await page.locator('.detail-controls').boundingBox();
      expect(controls!.x).toBeGreaterThan(art!.x + art!.width);
    }
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Across the Alps: a journey by rail', exact: true }),
    ).toBeFocused();
    await openMedia(
      page,
      'https://www.youtube.com/playlist?list=PL' + 'S'.repeat(22),
      'The home server collection',
    );
    await expect(
      page.getByRole('button', { name: 'Request playlist', exact: true }),
    ).toBeDisabled();
    await capture('collection');
    await page.keyboard.press('Escape');
    await page.goto('/#/requests');
    await expect(page.locator('.request-row').first()).toBeVisible();
    await capture('requests');
    await page.goto('/#/downloads');
    await expect(page.locator('.download-row').first()).toBeVisible();
    await capture('queue');
    await page.goto('/#/settings');
    if (width <= 1100)
      await page.getByRole('combobox', { name: /^Settings section/ }).selectOption('Downloader');
    else await page.getByRole('button', { name: 'Downloader', exact: true }).click();
    await expect(page.getByLabel('Download staging directory')).toBeVisible();
    await capture('settings');
    for (const [section, label] of [
      ['Media', 'Download format'],
      ['Queue & worker', 'Concurrent jobs'],
      ['Advanced', 'yt-dlp cookies file'],
    ]) {
      if (width <= 1100)
        await page.getByRole('combobox', { name: /^Settings section/ }).selectOption(section);
      else await page.getByRole('button', { name: section, exact: true }).click();
      await expect(page.getByLabel(label)).toBeVisible();
      await fit(page);
    }
    await page.context().clearCookies();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await capture('login');
    expect(errors).toEqual([]);
  });
test('search skeleton, empty and error states remain usable', async ({ page }) => {
  await asUser(page, 'member', '/search');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/search?q=slow*', async (route) => {
    await gate;
    await route.continue();
  });
  await page.locator('main').getByLabel('Search YouTube').fill('slow search');
  await page.locator('main').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Loading content' })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual/search-loading.png', fullPage: true });
  release();
  await expect(page.locator('.media-card')).toHaveCount(17);
  await page.goto('/#/search?q=no%20matches');
  await expect(page.getByRole('heading', { name: 'No results found' })).toBeVisible();
  await page.goto('/#/search?q=quota%20failure');
  await expect(page.getByRole('alert')).toContainText('quota is exhausted');
  await expect(page.getByRole('alert')).not.toContainText('test-api-key');
});
