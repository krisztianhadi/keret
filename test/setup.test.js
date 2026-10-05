'use strict';
/* setup: the first-run interview, what it writes, and when it stays silent. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { clearWallEnv, tempDir } = require('./helpers');
const { loadConfig } = require('../src/config');
const { interview, save, setup, createAsker, normalizeUrl } = require('../src/setup');

clearWallEnv();

/** Answers in order, remembering the defaults that were offered. */
function scripted(answers) {
  const asked = [];
  const ask = async (label, options) => {
    const opts = options || {};
    asked.push({ label, defaultValue: opts.defaultValue || '' });
    const value = answers.shift();
    return value === undefined ? (opts.defaultValue || '') : value;
  };
  return { ask, asked };
}

test('the interview writes a config the generator accepts', async () => {
  const { ask } = scripted([
    'Iceland 2026', 'Twelve days on the ring road.',
    'photos.example.com', 'Ada Lovelace', 'ada@example.com', 'ada.example.com',
  ]);
  const answers = await interview(ask, null);

  const dir = tempDir();
  const configFile = path.join(dir, 'wall.config.json');
  save(dir, configFile, answers);

  // the file has to survive the same validation a hand-written one does
  const { config } = loadConfig({ root: dir, configPath: configFile, env: {} });
  assert.equal(config.title, 'Iceland 2026');
  assert.equal(config.description, 'Twelve days on the ring road.');
  assert.equal(config.siteUrl, 'https://photos.example.com', 'a bare domain gets a scheme');

  const author = JSON.parse(fs.readFileSync(path.join(dir, 'author.json'), 'utf8'));
  assert.equal(author.name, 'Ada Lovelace');
  assert.equal(author.email, 'ada@example.com');
  assert.deepEqual(author.links, [{ label: 'Website', href: 'https://ada.example.com' }]);
});

test('every previous answer comes back as the default', async () => {
  const current = {
    title: 'Old wall',
    description: 'Old words',
    siteUrl: 'https://old.example/',
    authorCard: { name: 'Ada', email: 'ada@example.com', links: [{ label: 'Website', href: 'https://ada.example.com' }] },
  };
  const { ask, asked } = scripted([]);                  // every answer is Enter
  const answers = await interview(ask, current);

  assert.equal(answers.config.title, 'Old wall');
  assert.equal(answers.config.description, 'Old words');
  assert.equal(answers.config.siteUrl, 'https://old.example/');
  assert.equal(answers.author.name, 'Ada');
  assert.equal(answers.author.email, 'ada@example.com');
  assert.deepEqual(answers.author.links, [{ label: 'Website', href: 'https://ada.example.com' }]);

  const title = asked.find((entry) => entry.label === 'Title');
  assert.equal(title.defaultValue, 'Old wall', 'the default is shown, not hidden');
});

test('a wall with no photographer writes no contact card', async () => {
  const { ask } = scripted(['A wall', 'Words', '', '']);
  const answers = await interview(ask, null);
  assert.equal(answers.author, null);

  const dir = tempDir();
  const configFile = path.join(dir, 'wall.config.json');
  save(dir, configFile, answers);
  assert.equal(fs.existsSync(path.join(dir, 'author.json')), false);
  assert.equal(fs.existsSync(configFile), true);
});

test('clearing the photographer leaves an existing card alone', async () => {
  const dir = tempDir();
  const authorFile = path.join(dir, 'author.json');
  fs.writeFileSync(authorFile, '{"name":"Ada"}\n');

  const written = save(dir, path.join(dir, 'wall.config.json'), {
    config: { title: 'Wall', description: 'Words' },
    author: null,
  });

  assert.equal(JSON.parse(fs.readFileSync(authorFile, 'utf8')).name, 'Ada', 'the card is the owner\u2019s to delete');
  assert.equal(written.some((entry) => entry.kept === authorFile), true, 'and the run says it was left alone');
});

test('the terminal asker re-asks after a rejected answer', async () => {
  const printed = [];
  const replies = ['nope', 'ada@example.com'];
  const fakeReadline = { question: (prompt, callback) => callback(replies.shift()) };
  const ask = createAsker(fakeReadline, { write: (text) => printed.push(text) });

  const value = await ask('Email', {
    validate: (v) => (/@/.test(v) ? '' : 'that does not look like an email'),
  });
  assert.equal(value, 'ada@example.com');
  assert.match(printed.join(''), /does not look like an email/);
});

test('without a terminal the wizard asks nothing and writes nothing', async () => {
  const dir = tempDir();
  const configFile = path.join(dir, 'wall.config.json');
  const result = await setup({
    root: dir,
    configFile,
    current: null,
    input: { isTTY: false },
    output: { isTTY: false, write: () => {} },
  });

  assert.equal(result.ran, false);
  assert.equal(fs.existsSync(configFile), false);
});

test('bare domains get a scheme, everything else is left as it is', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com');
  assert.equal(normalizeUrl('//example.com/'), 'https://example.com/');
  assert.equal(normalizeUrl('http://example.com'), 'http://example.com');
  assert.equal(normalizeUrl('https://example.com/wall/'), 'https://example.com/wall/');
  assert.equal(normalizeUrl(''), '');
});
