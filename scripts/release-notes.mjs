import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Extract only the reviewed, dated entry for an existing stable version tag. */
export function releaseNotes(changelog, version, tag) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}`) {
    throw new Error('A stable release tag must match the declared product version.');
  }
  const sections = [...changelog.matchAll(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/gm)];
  const matches = sections.filter(section => section[1] === version);
  if (matches.length !== 1 || !matches[0][2]) {
    throw new Error('The release needs exactly one dated changelog entry.');
  }
  const start = matches[0].index + matches[0][0].length;
  const end = sections.find(section => section.index > matches[0].index)?.index ?? changelog.length;
  const body = changelog.slice(start, end).split(/^\[Unreleased\]:/m)[0].trim()
    .replace(/\]\(#([^)]*)\)/g, `](https://github.com/lucas-lepajollec/nasdash/blob/${tag}/CHANGELOG.md#$1)`);
  if (!body) throw new Error('Release notes must not be empty.');
  return `${body}\n\nContainer: \`ghcr.io/lucas-lepajollec/nasdash:${version}\`\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const changelog = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  process.stdout.write(releaseNotes(changelog, version, process.env.GITHUB_REF_NAME));
}
