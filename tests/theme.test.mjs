import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, watchTheme } from '../src/theme.mjs';

test('older workspaces stay light; explicit choices override the OS', () => {
  assert.equal(resolveTheme(undefined, true), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('system theme follows changes and releases its listener when changed', () => {
  const listeners = new Set();
  const root = { dataset: {}, style: {} };
  const media = { matches: true,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  const notified = [];
  const dispose = watchTheme('system', {root, media, onChange: theme => notified.push(theme)});
  assert.equal(root.dataset.theme, 'dark');
  media.matches = false;
  for (const listener of listeners) listener();
  assert.equal(root.dataset.theme, 'light');
  assert.equal(root.style.colorScheme, 'light');
  assert.deepEqual(notified, ['dark', 'light']);
  dispose();
  assert.equal(listeners.size, 0);
  watchTheme('dark', {root, media});
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(listeners.size, 0);
});
