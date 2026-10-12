import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseNotes } from './release-notes.mjs';

const changelog = '## [Unreleased]\n\nFuture work.\n\n## [0.2.3] - 2026-10-12\n\n### Fixed\n\n- Current fixes.\n\n## [0.2.2] - 2026-10-10\n\nPrevious work.\n';

test('release notes include only the dated candidate and its versioned image', () => {
  assert.equal(releaseNotes(changelog, '0.2.3', 'v0.2.3'), '### Fixed\n\n- Current fixes.\n\nContainer: `ghcr.io/lucas-lepajollec/nasdash:0.2.3`\n');
});

test('release notes reject wrong tags, prereleases, missing, undated or duplicate entries', () => {
  assert.throws(() => releaseNotes(changelog, '0.2.3', 'v0.2.2'));
  assert.throws(() => releaseNotes(changelog, '0.2.3-rc.1', 'v0.2.3-rc.1'));
  assert.throws(() => releaseNotes(changelog, '0.2.4', 'v0.2.4'));
  assert.throws(() => releaseNotes(changelog.replace(' - 2026-10-12', ''), '0.2.3', 'v0.2.3'));
  assert.throws(() => releaseNotes(changelog + '## [0.2.3] - 2026-10-12\n\nDuplicate.', '0.2.3', 'v0.2.3'));
  assert.throws(() => releaseNotes('## [0.2.3] - 2026-10-12\n\n', '0.2.3', 'v0.2.3'));
});
