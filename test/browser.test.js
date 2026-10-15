import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemBrowserPaths } from '../src/browser.js';

test('no Mac, o Google Chrome instalado vem antes de qualquer outro', () => {
  const paths = systemBrowserPaths('darwin', { HOME: '/Users/pedro' });
  assert.equal(paths[0], '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  assert.ok(paths.includes('/Users/pedro/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
});
