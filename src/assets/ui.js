/* Keret page chrome: the credit line and the photographer card. This is page
   furniture only - it never touches the wall, the camera or the frames. */
var CHROME = {{CHROME}};

(function () {
  'use strict';

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null && text !== '') node.textContent = text;
    return node;
  }

  var data = CHROME || {};

  /* bottom left: where this wall came from */
  var credit = document.getElementById('credit');
  if (credit && data.credit && data.credit.url) {
    credit.href = data.credit.url;
    // the two parts are separate elements so the brand can be emphasised; give
    // assistive tech the sentence they form
    credit.setAttribute('aria-label', data.credit.label + ' ' + data.credit.brand);
    credit.appendChild(el('span', null, data.credit.label));
    credit.appendChild(el('b', null, data.credit.brand));
    credit.hidden = false;
  }

  /* top right: the photographer, when the wall was given one */
  var author = data.author;
  var button = document.getElementById('authorBtn');
  var card = document.getElementById('authorCard');
  if (!author || !author.name || !button || !card) return;

  var close = el('button', 'author-close', '\u00d7');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');

  var facts = el('dl', 'author-facts');
  function fact(label, value, href) {
    if (!value) return;
    facts.appendChild(el('dt', null, label));
    var dd = el('dd');
    if (href) {
      var link = el('a', null, value);
      link.href = href;
      dd.appendChild(link);
    } else {
      dd.textContent = value;
    }
    facts.appendChild(dd);
  }

  fact('Email', author.email, author.email ? 'mailto:' + author.email : '');
  fact('Phone', author.phone, author.phone ? 'tel:' + author.phone.replace(/[^+0-9]/g, '') : '');
  fact('Location', author.location, '');
  for (var i = 0; i < (author.links || []).length; i++) {
    var l = author.links[i];
    if (!l || !l.href) continue;
    fact(l.label || 'Link', String(l.href).replace(/^https?:\/\//, '').replace(/\/$/, ''), l.href);
  }

  card.appendChild(close);
  card.appendChild(el('h2', null, author.name));
  if (author.role) card.appendChild(el('div', 'author-role', author.role));
  if (author.bio) card.appendChild(el('p', 'author-bio', author.bio));
  if (facts.childNodes.length) card.appendChild(facts);

  function openCard() {
    card.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    close.focus();
  }
  function closeCard() {
    card.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  button.hidden = false;
  button.addEventListener('click', function (e) {
    e.stopPropagation();
    if (card.hidden) openCard(); else closeCard();
  });
  close.addEventListener('click', closeCard);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !card.hidden) closeCard();
  });
  document.addEventListener('click', function (e) {
    if (card.hidden) return;
    if (card.contains(e.target) || button.contains(e.target)) return;
    closeCard();
  });
})();
