#!/usr/bin/env node
// Builds the GitHub wiki from README.md, so the two never disagree:
//   node scripts/wiki-sync.mjs <wiki-checkout>
// then commit and push in <wiki-checkout> (a clone of
// https://github.com/itsomidho/wp-local-dev.wiki.git). Run it after a
// release, or whenever the README changes.
//
// Each README section (## heading) goes to one page, per PAGES below; a
// section missing from PAGES lands on "More" so nothing is ever dropped.
// Links between sections (#a-heading) are pointed at the page that now
// holds that heading, and links to repo files at the file on GitHub.
// Slugs come from github-slugger, the library GitHub's own headings use.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GithubSlugger = require(path.join(ROOT, 'dashboard/node_modules/github-slugger')).default;
const REPO = 'https://github.com/itsomidho/wp-local-dev';

// [page file name (also its title, with dashes as spaces), README ## headings]
const PAGES = [
  ['Home', ['Features']],
  ['Installation and Updating', ['Prerequisites', 'Installation', 'Uninstalling', 'Updating']],
  ['Getting Started', ['Getting started', 'Access points']],
  ['Command Reference', ['Command reference']],
  ['Dashboard and API', ['Web dashboard', 'Status dashboard', 'Doctor', 'API service']],
  ['Managing Sites', ['Multiple PHP versions', 'Cloning a site', 'Switching a site off', 'Sharing a site with other devices', 'Production media proxy', 'Admin domain', 'Default plugins', 'File permissions']],
  ['Databases and Backups', ['Snapshots', 'Full-stack backup and restore', 'Scheduled database backups', "Sharing a site's database"]],
  ['Caching and Performance', ['Performance', 'Redis object cache', 'Full-page cache (nginx FastCGI)', 'Real WP-Cron']],
  ['Debugging and Mail', ['WordPress debug mode and debug.log', 'Xdebug', 'Mail catching (Mailpit)']],
  ['Troubleshooting', ['Troubleshooting', 'Host environment', 'Notes']],
  ['Project Structure', ['Project structure']],
];
const MORE = 'More';
const fileOf = (title) => title.replace(/ /g, '-');

const out = process.argv[2];
if (!out || !fs.existsSync(out)) {
  console.error('Usage: node scripts/wiki-sync.mjs <wiki-checkout>');
  process.exit(1);
}
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

// The intro (everything before the first ##), then each ## section.
const lines = readme.split('\n');
const firstH2 = lines.findIndex((l) => /^## /.test(l));
const intro = lines.slice(1, firstH2).join('\n').trim(); // without the # title
const sections = [];
for (let i = firstH2; i < lines.length; i++) {
  if (/^## /.test(lines[i])) sections.push({ title: lines[i].slice(3).trim(), body: [] });
  sections.at(-1).body.push(lines[i]);
}

// Which page each section goes to.
const pageOf = new Map(PAGES.flatMap(([page, titles]) => titles.map((t) => [t, page])));
const contents = new Map(PAGES.map(([page]) => [page, []]));
contents.set(MORE, []);
for (const s of sections) contents.get(pageOf.get(s.title) || MORE).push(s);

// Every heading's slug -> its page, numbered the way GitHub numbers
// repeated headings on one page.
const anchorPage = new Map();
for (const [page, secs] of contents) {
  const slugger = new GithubSlugger();
  for (const s of secs) {
    for (const l of s.body) {
      const m = /^#{2,6}\s+(.+)$/.exec(l);
      if (m) anchorPage.set(slugger.slug(m[1].trim()), page);
    }
  }
}

// README text only -- links this script adds are already wiki links.
const fixLinks = (md, page) =>
  md
    // (file.sh) / (dir/file) -> the file on GitHub
    .replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (_, p) => `](${REPO}/blob/main/${p.replace(/^\.\//, '')})`)
    // (#heading) -> (Page#heading) when that heading is on another page
    .replace(/\]\(#([^)]+)\)/g, (all, slug) => {
      const target = anchorPage.get(slug);
      return target && target !== page ? `](${fileOf(target)}#${slug})` : all;
    });

const notice = `> Generated from the repository's [README](${REPO}#readme) by \`scripts/wiki-sync.mjs\`. Edit the README, not this page.`;

for (const [page, secs] of contents) {
  if (page === MORE && secs.length === 0) continue;
  let md = fixLinks(secs.map((s) => s.body.join('\n').trim()).join('\n\n'), page);
  if (page === 'Home') {
    const guide = PAGES.filter(([p]) => p !== 'Home')
      .map(([p, titles]) => `- **[${p}](${fileOf(p)})**: ${titles.join(', ')}`)
      .join('\n');
    md = `${fixLinks(intro, page)}\n\n## In this wiki\n\n${guide}\n\n${md}`;
  }
  fs.writeFileSync(path.join(out, `${fileOf(page)}.md`), `${md}\n\n${notice}\n`);
}

const sidebar = [`**[wp-local-dev](Home)**`, '', ...PAGES.filter(([p]) => p !== 'Home').map(([p]) => `- [${p}](${fileOf(p)})`)];
if (contents.get(MORE).length) sidebar.push(`- [${MORE}](${MORE})`);
sidebar.push('', `[Releases](${REPO}/releases) · [Issues](${REPO}/issues)`);
fs.writeFileSync(path.join(out, '_Sidebar.md'), `${sidebar.join('\n')}\n`);
fs.writeFileSync(path.join(out, '_Footer.md'), `wp-local-dev · [README](${REPO}#readme) · [Install](Installation-and-Updating#installation)\n`);

const used = [...contents].filter(([, s]) => s.length).map(([p, s]) => `${p} (${s.length})`);
console.log(`${sections.length} README sections -> ${used.length} pages: ${used.join(', ')}`);
