'use strict';
/*
 * setup.js - the first-run wizard.
 *
 * It runs only when the generator has a terminal and was not told `--yes`: it
 * asks the handful of things that make a wall look like its owner's, writes
 * wall.config.json (and author.json when a photographer was named), and gets out
 * of the way. On every later run it offers to keep what is there, and shows each
 * previous answer as the default when it does not.
 *
 * The interview takes an injected `ask`, so the questions, the defaults and the
 * file it writes can be tested without a terminal.
 */

const fs = require('fs');
const path = require('path');

const TITLE = 'Photo Wall';
const DESCRIPTION = 'A wall of photographs.';

/** A URL the page can use: bare domains get https, mailto/tel are left alone. */
function normalizeUrl(value) {
  const trimmed = String(value === undefined || value === null ? '' : value).trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return 'https:' + trimmed;
  return 'https://' + trimmed.replace(/^\/+/, '');
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** The first link of an existing author card, so it can be offered back. */
function existingLink(author, index) {
  const links = (author && author.links) || [];
  return links[index] && links[index].href ? links[index].href : '';
}

/**
 * Ask the questions and return { config, author }.
 * `ask(label, { defaultValue, validate })` resolves to a string; an empty answer
 * means "keep the default".
 */
async function interview(ask, current) {
  const now = current || {};
  const card = now.authorCard || {};

  const title = (await ask('Title', { defaultValue: now.title || TITLE })).trim() || TITLE;
  const description = (await ask('Description', { defaultValue: now.description || DESCRIPTION })).trim();
  const siteUrl = normalizeUrl(await ask('Site URL, used for social tags and the sitemap (optional)', {
    defaultValue: now.siteUrl || '',
  }));

  const name = (await ask('Photographer name, for the contact card (optional)', {
    defaultValue: card.name || '',
  })).trim();

  let email = '';
  let website = '';
  if (name) {
    email = (await ask('  Email (optional)', {
      defaultValue: card.email || '',
      validate: (value) => (!value || looksLikeEmail(value) ? '' : 'that does not look like an email'),
    })).trim();
    website = normalizeUrl(await ask('  Website or profile (optional)', {
      defaultValue: existingLink(card, 0),
    }));
  }

  const config = { title, description };
  if (siteUrl) config.siteUrl = siteUrl;

  let author = null;
  if (name) {
    author = { name };
    if (email) author.email = email;
    if (website) author.links = [{ label: 'Website', href: website }];
  }
  return { config, author };
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  return file;
}

/**
 * Write what the interview produced. Nothing is ever deleted: clearing the name
 * leaves an existing author.json alone and says so, because dropping a contact
 * card is the owner's call, not the wizard's.
 */
function save(root, configFile, answers) {
  const written = [writeJson(configFile, answers.config)];
  const authorFile = path.join(root, 'author.json');
  if (answers.author) {
    written.push(writeJson(authorFile, answers.author));
  } else if (fs.existsSync(authorFile)) {
    written.push({ kept: authorFile });
  }
  return written;
}

/** The terminal asker: readline, a visible default, a validating retry loop. */
function createAsker(readline, output) {
  return function ask(label, options) {
    const opts = options || {};
    const fallback = opts.defaultValue || '';
    const prompt = fallback ? label + ' [' + fallback + ']: ' : label + ': ';
    return new Promise((resolve) => {
      const once = () => {
        readline.question(prompt, (answer) => {
          const value = answer.trim() === '' ? fallback : answer.trim();
          const problem = opts.validate ? opts.validate(value) : '';
          if (problem) {
            output.write('  ' + problem + '\n');
            once();
            return;
          }
          resolve(value);
        });
      };
      once();
    });
  };
}

async function confirm(ask, label, fallback) {
  const answer = await ask(label + ' (y/n)', { defaultValue: fallback ? 'y' : 'n' });
  return /^y/i.test(answer);
}

/**
 * Ask when there is a terminal to ask on, and not otherwise.
 *
 * options: { root, configFile, current, force, input, output }
 * returns { ran, wrote, written }
 */
async function setup(options) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  if (!input.isTTY || !output.isTTY) return { ran: false, wrote: false, written: [] };

  const readline = require('readline').createInterface({ input, output });
  const ask = createAsker(readline, output);
  try {
    if (options.current && !options.force) {
      const keep = await confirm(ask, 'Keep the current setup ("' + (options.current.title || 'unnamed') + '")?', true);
      if (keep) return { ran: false, wrote: false, written: [] };
    }

    output.write('\nA few questions, once. Enter keeps the [default].\n\n');
    const answers = await interview(ask, options.current);
    const written = save(options.root, options.configFile, answers);
    output.write('\n');
    for (const entry of written) {
      if (entry.kept) output.write('left ' + entry.kept + ' as it is (delete it to drop the contact card)\n');
      else output.write('wrote ' + entry + '\n');
    }
    if (options.photosDir && !fs.existsSync(options.photosDir)) {
      output.write('No photographs yet: put them in ' + options.photosDir + '/ and run this again.\n');
    }
    output.write('\n');
    return { ran: true, wrote: true, written };
  } finally {
    readline.close();
  }
}

module.exports = { setup, interview, save, normalizeUrl, looksLikeEmail, createAsker, TITLE, DESCRIPTION };
