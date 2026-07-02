/* Maia Botánicas — Armador de pedido (order builder)
 * Progressive enhancement on productos.html: each .prod-card[data-sku] gets an
 * "add to order" control; a fixed tray collects lines and sends the whole
 * itemized order to Don Próspero as one prefilled WhatsApp message.
 * Client-side only. localStorage persistence. No backend — WhatsApp-first per canon.
 * Without JS the per-product WhatsApp CTAs keep working unchanged.
 */
(function () {
  'use strict';

  var WA = 'https://wa.me/19034598763';
  var KEY = 'mb_order_v1';

  var LANG = (document.documentElement.getAttribute('lang') || 'es').indexOf('en') === 0 ? 'en' : 'es';
  var T = LANG === 'en' ? {
    add: '+ Add to order',
    inOrder: 'In your order',
    remove: 'Remove',
    less: 'One less',
    more: 'One more',
    tray_one: '1 product in your order',
    tray_many: '{n} products in your order',
    review: 'Review order',
    hide: 'Hide',
    empty: 'Clear',
    send: 'Send order via WhatsApp',
    moq: 'MOQ',
    heading: 'Your order draft',
    note: 'Quantities start at each product’s MOQ. Don Próspero confirms stock, freight and wholesale pricing on WhatsApp — nothing is charged here.',
    msg_head: 'Hello Don Próspero, I’d like a quote for this order:',
    msg_bar: 'My bar/restaurant:',
    msg_city: 'City:'
  } : {
    add: '+ Agregar al pedido',
    inOrder: 'En tu pedido',
    remove: 'Quitar',
    less: 'Uno menos',
    more: 'Uno más',
    tray_one: '1 producto en tu pedido',
    tray_many: '{n} productos en tu pedido',
    review: 'Revisar pedido',
    hide: 'Ocultar',
    empty: 'Vaciar',
    send: 'Enviar pedido por WhatsApp',
    moq: 'MOQ',
    heading: 'Borrador de tu pedido',
    note: 'Las cantidades parten del MOQ de cada producto. Don Próspero confirma stock, flete y precio mayorista por WhatsApp — aquí no se cobra nada.',
    msg_head: 'Hola Don Próspero, quiero cotizar este pedido:',
    msg_bar: 'Mi bar/restaurante:',
    msg_city: 'Ciudad:'
  };

  var cards = document.querySelectorAll('.prod-card[data-sku]');
  if (!cards.length) return;

  /* ---------- state ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function save(order) {
    try { localStorage.setItem(KEY, JSON.stringify(order)); } catch (e) {}
  }
  var order = load();
  // prune anything not on this page's catalog (stale SKUs)
  var CATALOG = {};
  cards.forEach(function (c) {
    CATALOG[c.dataset.sku] = {
      name: c.dataset.name,
      moq: Math.max(1, parseInt(c.dataset.moq, 10) || 1),
      unit: c.dataset.unit || ''
    };
  });
  Object.keys(order).forEach(function (sku) {
    if (!CATALOG[sku]) delete order[sku];
  });

  function count() { return Object.keys(order).length; }

  /* ---------- per-card control ---------- */
  function renderCardControl(card) {
    var sku = card.dataset.sku;
    var box = card.querySelector('.order-add');
    if (!box) {
      box = document.createElement('div');
      box.className = 'order-add';
      card.appendChild(box);
    }
    var item = order[sku];
    if (!item) {
      box.innerHTML = '';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--ghost order-add__btn';
      btn.textContent = T.add;
      btn.setAttribute('aria-label', T.add + ': ' + CATALOG[sku].name);
      btn.addEventListener('click', function () {
        order[sku] = { qty: CATALOG[sku].moq };
        save(order); renderAll();
      });
      box.appendChild(btn);
    } else {
      box.innerHTML = '';
      box.appendChild(stepper(sku, 'card'));
    }
  }

  function stepper(sku, ctx) {
    var item = order[sku];
    var meta = CATALOG[sku];
    var wrap = document.createElement('div');
    wrap.className = 'order-stepper';

    var minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'order-stepper__btn';
    minus.textContent = '−';
    minus.setAttribute('aria-label', (item.qty <= meta.moq ? T.remove : T.less) + ': ' + meta.name);
    minus.addEventListener('click', function () {
      if (order[sku].qty <= meta.moq) { delete order[sku]; }
      else { order[sku].qty -= 1; }
      save(order); renderAll();
    });

    var num = document.createElement('span');
    num.className = 'order-stepper__qty';
    num.textContent = item.qty;
    num.setAttribute('aria-live', 'polite');
    num.setAttribute('aria-label', meta.name + ': ' + item.qty);

    var plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'order-stepper__btn';
    plus.textContent = '+';
    plus.setAttribute('aria-label', T.more + ': ' + meta.name);
    plus.addEventListener('click', function () {
      order[sku].qty += 1;
      save(order); renderAll();
    });

    wrap.appendChild(minus); wrap.appendChild(num); wrap.appendChild(plus);
    if (ctx === 'card') {
      var tag = document.createElement('span');
      tag.className = 'order-stepper__tag';
      tag.textContent = T.inOrder;
      wrap.appendChild(tag);
    }
    return wrap;
  }

  /* ---------- WhatsApp message ---------- */
  function waHref() {
    var lines = [T.msg_head];
    Object.keys(order).forEach(function (sku) {
      var meta = CATALOG[sku];
      lines.push('• ' + order[sku].qty + '× ' + meta.name + ' (' + sku + ')');
    });
    lines.push('');
    lines.push(T.msg_bar + ' ');
    lines.push(T.msg_city + ' ');
    return WA + '?text=' + encodeURIComponent(lines.join('\n'));
  }

  /* ---------- tray ---------- */
  var tray, panel, trayLabel, panelList, sendLink, toggleBtn;
  function buildTray() {
    tray = document.createElement('div');
    tray.className = 'order-tray';
    tray.setAttribute('role', 'region');
    tray.setAttribute('aria-label', T.heading);
    tray.hidden = true;

    panel = document.createElement('div');
    panel.className = 'order-tray__panel';
    panel.hidden = true;

    var pHead = document.createElement('h2');
    pHead.className = 'order-tray__heading';
    pHead.textContent = T.heading;
    panel.appendChild(pHead);

    panelList = document.createElement('div');
    panelList.className = 'order-tray__list';
    panel.appendChild(panelList);

    var pNote = document.createElement('p');
    pNote.className = 'order-tray__note';
    pNote.textContent = T.note;
    panel.appendChild(pNote);

    var bar = document.createElement('div');
    bar.className = 'order-tray__bar';

    trayLabel = document.createElement('span');
    trayLabel.className = 'order-tray__label';
    trayLabel.setAttribute('aria-live', 'polite');

    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn btn--ghost order-tray__toggle';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.textContent = T.review;
    toggleBtn.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      toggleBtn.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
      toggleBtn.textContent = panel.hidden ? T.review : T.hide;
    });

    sendLink = document.createElement('a');
    sendLink.className = 'btn btn--green btn--wa order-tray__send';
    sendLink.rel = 'noopener';
    sendLink.href = WA; // real href from creation — crawlable even before renderTray fills the order
    sendLink.textContent = T.send;

    bar.appendChild(trayLabel);
    bar.appendChild(toggleBtn);
    bar.appendChild(sendLink);

    tray.appendChild(panel);
    tray.appendChild(bar);
    document.body.appendChild(tray);
  }

  function renderTray() {
    var n = count();
    tray.hidden = n === 0;
    if (n === 0) { panel.hidden = true; toggleBtn.setAttribute('aria-expanded', 'false'); toggleBtn.textContent = T.review; return; }
    trayLabel.textContent = n === 1 ? T.tray_one : T.tray_many.replace('{n}', n);
    sendLink.href = waHref();

    panelList.innerHTML = '';
    Object.keys(order).forEach(function (sku) {
      var meta = CATALOG[sku];
      var row = document.createElement('div');
      row.className = 'order-tray__row';

      var info = document.createElement('div');
      info.className = 'order-tray__rowinfo';
      info.innerHTML = '<strong>' + meta.name + '</strong><span class="order-tray__rowmeta">' + sku + ' · ' + T.moq + ' ' + meta.moq + (meta.unit ? ' ' + meta.unit : '') + '</span>';

      row.appendChild(info);
      row.appendChild(stepper(sku, 'panel'));
      panelList.appendChild(row);
    });

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'order-tray__clear';
    clearBtn.textContent = T.empty;
    clearBtn.addEventListener('click', function () {
      order = {}; save(order); renderAll();
    });
    panelList.appendChild(clearBtn);
  }

  function renderAll() {
    cards.forEach(renderCardControl);
    renderTray();
  }

  function init() {
    buildTray();
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
