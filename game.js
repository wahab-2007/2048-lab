'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const element = number => ELEMENTS[number - 1];
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let { state, storage, issue, blocked, raw } = Cesium.load(() => localStorage);
  let game = new Cesium.Game(state);
  let selected = null;
  let retrieval = null;
  let drag = null;
  let suppressClick = false;
  let floating = null;
  let hoverTimer;
  let hintCallback;
  let toastTimer;
  let modalKind;
  let modalReturn;
  let tab = 'table';

  const board = $('board');
  const modal = $('modal');
  const modalBody = $('modal-body');
  const cells = Array.from({ length: 16 }, (_, index) => {
    const cell = make('button', 'cell');
    cell.type = 'button';
    cell.dataset.cell = index;
    board.append(cell);
    return cell;
  });

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, callback, className = 'button') {
    const node = make('button', className, label);
    node.type = 'button';
    node.addEventListener('click', callback);
    return node;
  }

  function save() {
    if (!blocked) {
      const saved = Cesium.save(storage, state);
      issue = saved ? '' : 'Automatic saving is unavailable. Export a JSON backup.';
    }
    $('storage-warning').hidden = !issue;
    $('storage-warning').textContent = issue;
  }

  function replaceState(nextState) {
    try {
      if (storage) storage.setItem('cesium-backup-v1', blocked ? raw : JSON.stringify(state));
    } catch {
      // Import remains available when local storage is full or disabled.
    }
    blocked = false;
    state = nextState;
    game = new Cesium.Game(state);
    selected = null;
    retrieval = null;
    save();
    render();
  }

  function motion() {
    return state.settings.effects && state.settings.intensity !== 'off' &&
      !state.settings.reducedMotion && !prefersReducedMotion.matches && !document.hidden;
  }

  function configure() {
    document.body.dataset.theme = state.settings.theme;
    document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).getPropertyValue('--bg').trim();
    document.body.classList.toggle('motion-off', !motion());
    document.body.classList.toggle('zen', state.settings.zen && !game.round);
    $('zen').setAttribute('aria-pressed', String(state.settings.zen));
    CesiumAudio.configure(state.settings);
  }

  function face(number) {
    const { name, symbol } = element(number);
    return [
      make('span', 'atomic-number', number),
      make('span', 'symbol', symbol),
      make('span', 'element-name', name)
    ];
  }

  function notify(message, celebration = false) {
    if (celebration && state.settings.zen) return;
    clearTimeout(toastTimer);
    const toast = $('toast');
    const modalStatus = $('dialog-status');
    modalStatus.textContent = modal.open ? message : '';
    modalStatus.hidden = !modal.open;
    toast.textContent = modal.open ? '' : message;
    toast.classList.toggle('show', !modal.open);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      modalStatus.hidden = true;
    }, 2800);
  }

  function setHint(message = '', label, action) {
    $('hint').textContent = message;
    $('hint-action').hidden = !label;
    $('hint-action').textContent = label || '';
    hintCallback = action;
  }

  function tutorial(step) {
    state.tutorial = step;
    save();
    renderHint();
  }

  function renderHint() {
    if (game.round) {
      const rules = Cesium.template(state.challenge.active);
      const remaining = rules.limit - game.round.merges;
      const finished = game.board.includes(rules.target);
      const target = element(rules.target);
      setHint(
        finished ? `Challenge complete in ${game.round.merges} merges.` :
          remaining ? `Make ${target.name} (${target.atomicNumber}) · ${remaining} ${remaining === 1 ? 'merge' : 'merges'} left` :
            'Merge limit reached.',
        'Challenge', openChallenge
      );
      return;
    }
    if (retrieval !== null) {
      setHint(`Choose an empty cell for ${element(retrieval).name}.`, 'Cancel', () => {
        retrieval = null;
        renderHint();
      });
      return;
    }
    if (state.settings.zen || state.tutorial === 5) {
      setHint(selected === null ? '' : 'Choose a destination, or press Escape to deselect.');
      return;
    }
    const messages = [
      'Click an empty cell to create Hydrogen.',
      'Drag one element onto another to merge them.',
      'New elements are added to your collection.',
      'Right-click or hold an element to store, inspect, or delete it.',
      'Open Collection to explore your periodic table.'
    ];
    const canAdvance = state.tutorial === 2 || state.tutorial === 3;
    setHint(messages[state.tutorial], canAdvance ? 'Next' : 'Skip', () => tutorial(canAdvance ? state.tutorial + 1 : 5));
  }

  function render() {
    for (const [index, cell] of cells.entries()) {
      const number = game.board[index];
      if (cell.dataset.number !== String(number ?? '')) {
        cell.classList.remove('materialise', 'reject', 'release');
        cell.replaceChildren(...(number === null ? [make('span', 'plus', game.round ? '·' : '+')] : face(number)));
      } else if (number === null) {
        cell.firstChild.textContent = game.round ? '·' : '+';
      }
      cell.dataset.number = number ?? '';
      if (number === null) delete cell.dataset.family;
      else cell.dataset.family = element(number).category;
      cell.classList.toggle('occupied', number !== null);
      cell.classList.toggle('selected', selected === index);
      cell.setAttribute('aria-pressed', String(selected === index));
      cell.setAttribute('aria-label', `Row ${Math.floor(index / 4) + 1}, column ${index % 4 + 1}, ${number === null ? 'empty' : `${element(number).name}, atomic number ${number}`}`);
    }
    $('discovered').textContent = state.discovered.length;
    $('progress').value = state.discovered.length;
    $('undo').disabled = !game.undoAvailable;
    $('mode-title').textContent = game.round ? 'Daily Challenge' : 'Sandbox';
    $('board-label').textContent = game.round ? state.challenge.active + ' UTC' : '4 × 4';
    configure();
    renderHint();
  }

  function center(node) {
    const r = node.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  function effectNode(className, number, x, y, dx = 0, dy = 0) {
    const node = make('span', className);
    node.dataset.family = element(number).category;
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    node.style.setProperty('--dx', dx + 'px');
    node.style.setProperty('--dy', dy + 'px');
    node.addEventListener('animationend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 700);
    $('effects').append(node);
    return node;
  }

  function effects(result) {
    if (!motion()) return;
    const cell = cells[result.type === 'merge' || result.type === 'move' ? result.target : result.cell];
    const [x, y] = center(cell);
    if (result.type === 'invalid') {
      cell.classList.add('reject');
      return;
    }
    if (['store', 'delete'].includes(result.type)) {
      cell.dataset.family = element(result.number).category;
      cell.classList.add('release');
      return;
    }
    cell.classList.add('materialise');
    if (result.type === 'generate') {
      effectNode('pulse', 1, x - 12, y - 12).style.setProperty('--spread', '1.5');
      return;
    }
    if (result.type !== 'merge') return;
    const { category } = element(result.number);
    if (result.discovery) {
      const [sx, sy] = center(cells[result.cell]);
      effectNode('converge', result.inputs[0], sx - 9, sy - 9, x - sx, y - sy);
      effectNode('pulse', result.inputs[1], x - 12, y - 12);
    }
    const major = [10, 18, 36, 54, 80, 92, 118].includes(result.number);
    if (result.discovery || ['noble-gas', 'alkali-metal', 'transition-metal'].includes(category) || result.number >= 104) {
      const pulse = effectNode('pulse', result.number, x - 12, y - 12);
      pulse.style.setProperty('--spread', major ? '4.2' : category === 'noble-gas' ? '3.6' : '2.7');
      if (category === 'transition-metal') pulse.style.borderRadius = '25%';
    }
    if (state.settings.particles && (result.discovery || ['halogen', 'lanthanide', 'actinide'].includes(category))) {
      const amount = (major ? 10 : 6) + (state.settings.intensity === 'full' ? 5 : 0);
      for (let i = 0; i < amount; i++) {
        const angle = i * Math.PI * 2 / amount + Math.random() * 0.3;
        const distance = 22 + Math.random() * (major ? 63 : 38);
        const particle = effectNode('particle', result.number, x, y, Math.cos(angle) * distance, Math.sin(angle) * distance);
        if (category === 'halogen') particle.style.borderRadius = '0';
      }
    }
  }

  board.addEventListener('animationend', event => {
    if (!event.pseudoElement) event.target.classList.remove('reject', 'materialise');
    if (event.animationName === 'release') {
      event.target.classList.remove('release');
      if (!event.target.dataset.number) delete event.target.dataset.family;
    }
  });

  function perform(action, cell, target) {
    const result = game.act(action, cell, target);
    if (!result) return false;
    if (result.type === 'invalid') {
      effects(result);
      CesiumAudio.play('invalid');
      notify(game.round && (game.board.includes(Cesium.template(state.challenge.active).target) ||
        game.round.merges >= Cesium.template(state.challenge.active).limit) ?
        'This attempt is finished. Open Challenge to try again.' : 'That sum exceeds atomic number 118.');
      return false;
    }
    selected = null;
    if (action === 'retrieve') retrieval = null;
    if (!game.round && state.tutorial === 0 && game.board.filter(n => n === 1).length >= 2) state.tutorial = 1;
    if (!game.round && state.tutorial < 2 && result.type === 'merge') state.tutorial = 2;
    save();
    render();
    effects(result);
    const complete = result.discovery && state.discovered.length === 118;
    CesiumAudio.play(complete && !state.settings.zen ? 'complete' : result.discovery && result.number !== 1 && !state.settings.zen ?
      'discovery' : result.type, result.number);
    if (result.discovery) notify(`Discovered ${element(result.number).name} · ${result.number}`, true);
    if (result.milestones.length && !state.settings.zen && !complete) {
      notify(result.discovery ? `Discovered ${element(result.number).name} · ${result.milestones[0]}` : result.milestones[0], true);
      setTimeout(() => CesiumAudio.play('achievement'), 145);
    }
    if (complete && !state.settings.zen) openCompletion();
    if (result.challengeComplete) notify('Daily challenge complete');
    return true;
  }

  function undo() {
    if (!game.undo()) return;
    closeFloating();
    selected = null;
    retrieval = null;
    save();
    render();
    CesiumAudio.play('ui');
  }

  function closeFloating(restoreFocus = false) {
    clearTimeout(hoverTimer);
    if (!floating) return;
    const { popup, anchor, pinned } = floating;
    floating = null;
    popup.hidePopover?.();
    popup.remove();
    if (restoreFocus && pinned && anchor.isConnected) anchor.focus({ preventScroll: true });
  }

  function positionFloating(popup, anchor, point) {
    const r = anchor.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = popup;
    const gutter = 8;
    const right = r.right + 10;
    const left = r.left - width - 10;
    const below = r.bottom + 10;
    const above = r.top - height - 10;
    let x;
    let y;
    if (point) {
      [x, y] = point;
    } else if (right + width <= innerWidth - gutter || left >= gutter) {
      x = right + width <= innerWidth - gutter ? right : left;
      y = r.top + (r.height - height) / 2;
    } else {
      x = r.left + (r.width - width) / 2;
      y = below + height <= innerHeight - gutter || above < gutter ? below : above;
    }
    popup.style.left = Math.max(gutter, Math.min(x, innerWidth - width - gutter)) + 'px';
    popup.style.top = Math.max(gutter, Math.min(y, innerHeight - height - gutter)) + 'px';
  }

  function showFloating(popup, anchor, pinned, point, keepFocus = false) {
    closeFloating();
    const host = modal.open ? modal : document.body;
    if (typeof popup.showPopover === 'function') popup.setAttribute('popover', 'manual');
    host.append(popup);
    popup.showPopover?.();
    floating = { popup, anchor, pinned };
    positionFloating(popup, anchor, point);
    if (pinned && !keepFocus) (popup.querySelector('button') || popup).focus({ preventScroll: true });
  }

  function inspector(number, anchor, pinned, fromCollection = false, keepFocus = false) {
    const e = element(number);
    const card = make('aside', 'floating inspector' + (pinned ? ' pinned' : ''));
    card.setAttribute('role', pinned ? 'dialog' : 'tooltip');
    card.setAttribute('aria-label', e.name + ' element inspector');
    card.tabIndex = -1;
    const hero = make('div', 'inspector-hero');
    hero.dataset.family = e.category;
    const meta = make('div', 'inspector-meta');
    const weight = make('span', '', e.atomicWeight);
    weight.setAttribute('aria-label', (e.atomicWeight.startsWith('[') ? 'Representative isotope mass number ' : 'Atomic weight ') + e.atomicWeight);
    meta.append(make('span', '', e.atomicNumber), weight);
    hero.append(meta, make('div', 'inspector-symbol', e.symbol), make('h3', '', e.name));

    const body = make('div', 'inspector-body');
    const superscripts = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    const config = e.electronConfiguration.replace(/([spdf])(\d+)/g, (_, orbital, electrons) =>
      orbital + Array.from(electrons, digit => superscripts[Number(digit)]).join(''));
    const predicted = e.atomicNumber >= 104 || [85, 87].includes(e.atomicNumber);
    body.append(make('p', 'electron', config), make('p', '', e.description));
    const rows = make('dl');
    for (const [key, value] of [
      ['Family', CATEGORIES[e.category] + (predicted ? ' (by position)' : '')],
      ['Position', `${e.group ? 'Group ' + e.group : 'f-block series'} · Period ${e.period}`],
      ['At 20°C', e.physicalState],
      ['Crystal', e.crystalStructure ?? 'Not listed'],
      ['Oxides', e.oxideAcidBase ?? 'Not listed'],
      ['Fun fact', e.funFact]
    ]) {
      const row = make('div');
      row.append(make('dt', '', key), make('dd', '', value));
      rows.append(row);
    }
    body.append(rows);
    if (pinned) {
      const actions = make('div', 'actions');
      if (fromCollection) {
        const favourite = state.favourites.includes(number);
        actions.append(button(favourite ? 'Remove favourite' : 'Favourite', () => {
          if (!game.favourite(number)) {
            notify('You can save up to five favourites.');
            return;
          }
          save();
          renderCollection();
        }));
        const stored = Cesium.count(state, number);
        const retrieve = button(`Retrieve · ${stored} stored`, () => {
          if (!state.board.includes(null)) {
            notify('Clear a board cell before retrieving an element.');
            return;
          }
          if (game.round) return;
          retrieval = number;
          selected = null;
          modal.close();
          render();
        });
        retrieve.disabled = !stored || Boolean(game.round);
        actions.append(retrieve);
      } else if (!game.round) {
        actions.append(button('Tile actions', () => contextMenu(Number(anchor.dataset.cell))));
      }
      actions.append(button('Close', () => closeFloating(true)));
      body.append(actions);
    }
    card.append(hero, body);
    showFloating(card, anchor, pinned, undefined, keepFocus);
  }

  function hoverInspect(node, getNumber, fromCollection = false) {
    node.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse' || drag || floating?.pinned) return;
      const number = getNumber();
      if (number) hoverTimer = setTimeout(() => inspector(number, node, false, fromCollection), 205);
    });
    node.addEventListener('pointerleave', () => {
      clearTimeout(hoverTimer);
      if (floating?.anchor === node && !floating.pinned) closeFloating();
    });
  }

  function contextMenu(index, point) {
    if (game.round || game.board[index] === null) return;
    selected = null;
    render();
    const cell = cells[index];
    const popup = make('div', 'floating context');
    popup.setAttribute('role', 'group');
    popup.setAttribute('aria-label', 'Tile actions');
    for (const [label, action] of [['Save to Collection', 'store'], ['Delete', 'delete'], ['Inspect', 'inspect']]) {
      popup.append(button(label, () => {
        closeFloating();
        if (action === 'inspect') inspector(game.board[index], cell, true);
        else {
          perform(action, index);
          cell.focus({ preventScroll: true });
        }
      }, ''));
    }
    showFloating(popup, cell, true, point);
  }

  function activate(index, keyboard) {
    const number = game.board[index];
    if (retrieval !== null) {
      if (number !== null) notify('Choose an empty cell.');
      else perform('retrieve', index, retrieval);
      return;
    }
    if (selected !== null && selected !== index) {
      closeFloating();
      perform('place', selected, index);
      return;
    }
    if (number !== null) {
      if (selected === index && floating?.pinned) {
        selected = null;
        closeFloating();
      } else {
        selected = index;
        inspector(number, cells[index], true, false, keyboard);
      }
      render();
    } else {
      perform('generate', index);
    }
  }

  for (const [index, cell] of cells.entries()) {
    hoverInspect(cell, () => game.board[index]);
    cell.addEventListener('click', event => {
      if (suppressClick && event.detail) {
        suppressClick = false;
        return;
      }
      activate(index, event.detail === 0);
    });
    cell.addEventListener('contextmenu', event => {
      if (game.board[index] === null) return;
      event.preventDefault();
      if (floating?.anchor !== cell || !floating.popup.classList.contains('context')) {
        contextMenu(index, [event.clientX, event.clientY]);
      }
    });
    cell.addEventListener('keydown', event => {
      const { key } = event;
      if (key === 'ContextMenu' || (key === 'F10' && event.shiftKey)) {
        event.preventDefault();
        contextMenu(index);
      }
      if (key === 'Tab' && !event.shiftKey && floating?.pinned && floating.anchor === cell) {
        const control = floating.popup.querySelector('button');
        if (control) {
          event.preventDefault();
          control.focus();
        }
      }
      const offset = { ArrowUp: -4, ArrowDown: 4, ArrowLeft: index % 4 === 0 ? 0 : -1,
        ArrowRight: index % 4 === 3 ? 0 : 1 }[key];
      if (offset && cells[index + offset]) {
        event.preventDefault();
        closeFloating();
        cells[index + offset].focus();
      }
    });

    cell.addEventListener('pointerdown', event => {
      suppressClick = false;
      if (game.board[index] === null || event.button !== 0 || !event.isPrimary || drag || retrieval !== null) return;
      const r = cell.getBoundingClientRect();
      drag = { id: event.pointerId, index, x: event.clientX, y: event.clientY, r, target: null };
      if (event.pointerType !== 'mouse' && !game.round) {
        drag.timer = setTimeout(() => {
          if (!drag || drag.copy) return;
          drag.hold = true;
          suppressClick = true;
          contextMenu(index);
        }, 440);
      }
    });
  }

  function hit(x, y) {
    const tile = document.elementFromPoint(x, y)?.closest('.cell');
    return tile ? Number(tile.dataset.cell) : null;
  }

  function movePreview(current, x, y) {
    const { index, copy, r } = current;
    copy.style.transform = `translate3d(${x - current.x + r.left}px,${y - current.y + r.top}px,0)`;
    const target = hit(x, y);
    if (current.target !== null && target !== current.target) cells[current.target].classList.remove('drop');
    current.target = target;
    if (target !== null && target !== index) cells[target].classList.add('drop');
    const preview = $('preview');
    const a = game.board[index];
    const b = game.board[target];
    if (!state.settings.preview || target === index || b == null) {
      preview.hidden = true;
      return;
    }
    const sum = Cesium.merge(a, b);
    const prefix = `${element(a).symbol} + ${element(b).symbol} → `;
    preview.replaceChildren(document.createTextNode(prefix));
    const result = make('b', '', sum ? `${element(sum).symbol} · ${sum}` : 'Above 118');
    if (sum) result.dataset.family = element(sum).category;
    preview.append(result);
    preview.hidden = false;
    preview.style.left = Math.max(8, Math.min(x + 14, innerWidth - preview.offsetWidth - 8)) + 'px';
    preview.style.top = Math.max(8, Math.min(y - 45, innerHeight - preview.offsetHeight - 8)) + 'px';
  }

  window.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId || drag.hold) return;
    const { clientX: x, clientY: y } = event;
    if (!drag.copy && Math.hypot(x - drag.x, y - drag.y) > 6) {
      clearTimeout(drag.timer);
      closeFloating();
      selected = null;
      render();
      const cloned = make('div', 'drag-copy');
      cloned.dataset.family = element(game.board[drag.index]).category;
      cloned.style.width = drag.r.width + 'px';
      cloned.style.height = drag.r.height + 'px';
      cloned.append(...face(game.board[drag.index]));
      $('drag-layer').append(cloned);
      drag.copy = cloned;
      cells[drag.index].classList.add('drag-origin');
      CesiumAudio.play('pickup');
    }
    if (drag.copy) movePreview(drag, x, y);
  });

  function endDrag(event, cancelled) {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const { timer, index, target, hold, copy } = drag;
    drag = null;
    clearTimeout(timer);
    if (hold) suppressClick = true;
    if (!copy) return;
    copy.remove();
    suppressClick = true;
    $('preview').hidden = true;
    cells[index].classList.remove('drag-origin');
    if (target !== null) cells[target].classList.remove('drop');
    const destination = cancelled ? null : hit(event.clientX, event.clientY);
    if (destination !== null) perform('place', index, destination);
  }

  window.addEventListener('pointerup', event => endDrag(event, false));
  window.addEventListener('pointercancel', event => endDrag(event, true));
  window.addEventListener('blur', () => endDrag(null, true));
  window.addEventListener('resize', () => {
    if (floating) positionFloating(floating.popup, floating.anchor);
  });
  document.addEventListener('scroll', event => {
    if (!floating || floating.popup.contains(event.target)) return;
    if (!floating.pinned) closeFloating();
    else positionFloating(floating.popup, floating.anchor);
  }, true);
  document.addEventListener('pointerdown', event => {
    CesiumAudio.unlock();
    if (floating && !floating.popup.contains(event.target) && !floating.anchor.contains(event.target)) closeFloating();
  }, true);
  document.addEventListener('keydown', event => {
    CesiumAudio.unlock();
    if (event.key === 'Escape' && (floating || selected !== null || retrieval !== null || drag)) {
      event.preventDefault();
      closeFloating(true);
      endDrag(null, true);
      selected = null;
      retrieval = null;
      render();
    }
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' &&
        !modal.open && !event.target.matches('input,textarea,[contenteditable]')) {
      event.preventDefault();
      endDrag(null, true);
      undo();
    }
  });
  document.addEventListener('click', event => {
    if (event.target.closest('button') && !event.target.closest('.cell')) CesiumAudio.play('ui');
  }, true);

  function openModal(kind, title) {
    closeFloating();
    endDrag(null, true);
    modalKind = kind;
    $('dialog-status').hidden = true;
    modal.classList.toggle('collection', kind === 'collection');
    $('modal-title').textContent = title;
    modalBody.replaceChildren();
    if (modal.open) {
      $('close-modal').focus();
      modal.scrollTop = 0;
    } else {
      modalReturn = document.activeElement;
      modal.showModal();
    }
  }

  $('close-modal').addEventListener('click', () => modal.close());
  modal.addEventListener('click', event => {
    if (event.target === modal) {
      const r = modal.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) modal.close();
    }
  });
  modal.addEventListener('close', () => {
    if (modal.open) return;
    closeFloating();
    modalKind = null;
    if (retrieval !== null) cells[game.board.indexOf(null)]?.focus();
    else modalReturn?.focus();
  });

  function section(title, content) {
    const wrapper = make('section', 'subsection');
    wrapper.append(make('h3', '', title), ...content);
    return wrapper;
  }

  function openCollection() {
    if (!game.round && state.tutorial >= 2) tutorial(5);
    CesiumAudio.play('collection');
    openModal('collection', 'Collection');
    renderCollection();
  }

  function tileCollection(e, unlocked) {
    const node = make('button', 'periodic-tile' + (unlocked ? ' unlocked' : ''));
    node.type = 'button';
    node.disabled = !unlocked;
    if (unlocked) node.dataset.family = e.category;
    const qty = Cesium.count(state, e.atomicNumber);
    node.append(make('span', 'atomic-number', e.atomicNumber), make('span', 'symbol', e.symbol));
    if (qty) node.append(make('span', 'quantity', '×' + qty));
    node.setAttribute('aria-label', `${e.name}, atomic number ${e.atomicNumber}, ${unlocked ? qty + ' stored' : 'undiscovered'}`);
    if (unlocked) {
      hoverInspect(node, () => e.atomicNumber, true);
      node.addEventListener('click', () => inspector(e.atomicNumber, node, true, true));
    }
    return node;
  }

  function periodicTable() {
    const scroll = make('div', 'periodic-scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('aria-label', 'Periodic table, scroll horizontally to see all groups');
    const grid = make('div', 'periodic');
    function place(node, column, row) {
      node.style.gridColumn = column;
      node.style.gridRow = row;
      grid.append(node);
    }
    for (let group = 1; group <= 18; group++) place(make('span', 'axis', group), group + 1, 1);
    for (let period = 1; period <= 7; period++) place(make('span', 'axis', period), 1, period + 1);
    place(make('span', 'axis', '6*'), 1, 10);
    place(make('span', 'axis', '7*'), 1, 11);
    place(make('span', 'axis series-marker', '57–71'), 4, 7);
    place(make('span', 'axis series-marker', '89–103'), 4, 8);
    const unlocked = new Set(state.discovered);
    for (const e of ELEMENTS) {
      const [col, row] = elementPosition(e.atomicNumber);
      place(tileCollection(e, unlocked.has(e.atomicNumber)), col + 1, row + (row > 7 ? 2 : 1));
    }
    const legend = make('div', 'legend');
    for (const [family, label] of Object.entries(CATEGORIES)) {
      const text = make('span');
      const dot = make('i');
      dot.dataset.family = family;
      text.append(dot, document.createTextNode(label));
      legend.append(text);
    }
    scroll.append(grid);
    return [scroll, legend];
  }

  function list(items, emptyText) {
    if (!items.length) return make('p', '', emptyText);
    const ul = make('ul', 'list');
    for (const [title, detail, className] of items) {
      const row = make('li', className);
      row.append(make('strong', '', title), make('small', '', detail));
      ul.append(row);
    }
    return ul;
  }

  function collectionChips(numbers) {
    const strip = make('div', 'favourites');
    for (const n of numbers) {
      const e = element(n);
      const qty = Cesium.count(state, n);
      const chip = button(`${e.symbol}${qty ? ' × ' + qty : ''}`, () => inspector(n, chip, true, true), 'button category-chip');
      chip.dataset.family = e.category;
      chip.setAttribute('aria-label', `${e.name}, ${qty} stored`);
      strip.append(chip);
    }
    return strip;
  }

  function renderCollection() {
    const focusText = modalBody.contains(document.activeElement) ? document.activeElement.textContent : null;
    closeFloating();
    const progress = make('div', 'table-progress');
    const bar = make('progress');
    bar.max = 118;
    bar.value = state.discovered.length;
    bar.setAttribute('aria-label', 'Discovered elements');
    progress.append(make('span', 'eyebrow', `Discovered · ${bar.value} / 118`), bar);
    const tabs = make('nav', 'tabs');
    tabs.setAttribute('aria-label', 'Collection views');
    for (const [key, label] of [['table', 'Periodic table'], ['inventory', 'Stored'], ['timeline', 'Timeline'], ['achievements', 'Achievements']]) {
      const control = button(label, () => {
        tab = key;
        renderCollection();
      });
      control.setAttribute('aria-pressed', String(key === tab));
      tabs.append(control);
    }
    modalBody.replaceChildren(progress, tabs);
    if (tab === 'table') modalBody.append(...periodicTable());
    if (tab === 'inventory') {
      const stored = Object.keys(state.inventory).map(Number);
      modalBody.append(stored.length ? collectionChips(stored) : make('p', '', 'Store a board tile through its tile actions to retrieve it later.'));
      if (game.round) modalBody.append(make('p', '', 'Return to Sandbox to retrieve stored tiles.'));
    }
    if (tab === 'table' || tab === 'inventory') {
      const favourites = state.favourites.length ? collectionChips(state.favourites) :
        make('p', '', 'Pin up to five shortcuts from discovered elements.');
      modalBody.append(section('Favourites', [favourites]));
    }
    if (tab === 'timeline') {
      const items = state.timeline.slice().reverse().map(({ number, date, inputs }) => [
        `${element(number).name} · ${element(number).symbol}`,
        new Date(date).toLocaleString() + (inputs ? ' · ' + inputs.map(n => element(n).symbol).join(' + ') : '')
      ]);
      modalBody.append(list(items, 'Your first discoveries will appear here.'));
    }
    if (tab === 'achievements') {
      const items = Cesium.MILESTONES.map(([id, title, description]) => {
        const unlocked = state.achievements.includes(id);
        return [title, (unlocked ? 'Unlocked · ' : 'Locked · ') + description, unlocked ? '' : 'locked'];
      });
      modalBody.append(list(items, ''));
      if (state.completion) modalBody.append(section('Completion', [button('View certificate', openCompletion)]));
    }
    const nextFocus = [...tabs.querySelectorAll('button')].find(control => control.textContent === focusText);
    if (nextFocus) nextFocus.focus();
    else if (!modal.contains(document.activeElement)) $('close-modal').focus();
  }

  function applySetting(key, value) {
    state.settings[key] = value;
    save();
    render();
    CesiumAudio.unlock();
  }

  function setting(label, key, choices) {
    const row = make('div', 'setting');
    const caption = make('label', '', label);
    const value = state.settings[key];
    const input = make(choices ? 'select' : 'input');
    if (choices) {
      for (const option of choices) {
        const entry = make('option', '', option[0].toUpperCase() + option.slice(1));
        entry.value = option;
        input.append(entry);
      }
      input.value = value;
    } else if (typeof value === 'boolean') {
      input.type = 'checkbox';
      input.checked = value;
    } else {
      input.type = 'range';
      input.min = 0;
      input.max = 1;
      input.step = 0.01;
      input.value = value;
    }
    input.addEventListener(input.type === 'range' ? 'input' : 'change', () =>
      applySetting(key, input.type === 'checkbox' ? input.checked : input.type === 'range' ? input.valueAsNumber : input.value));
    input.id = 'setting-' + key;
    caption.htmlFor = input.id;
    row.append(caption, input);
    return row;
  }

  function openSettings() {
    openModal('settings', 'Settings');
    const audio = section('Audio', [
      setting('Sound', 'sound'), setting('Sound effects', 'soundEffects'), setting('Effects volume', 'volume'),
      setting('Ambient audio', 'ambience'), setting('Ambient volume', 'ambientVolume')
    ]);
    const appearance = section('Appearance', [
      setting('Theme', 'theme', Cesium.THEMES), setting('Visual effects', 'effects'), setting('Particles', 'particles'),
      setting('Animation intensity', 'intensity', ['off', 'subtle', 'full']), setting('Reduced motion', 'reducedMotion')
    ]);
    const gameplay = section('Gameplay', [
      setting('Zen Mode', 'zen'), setting('Merge previews', 'preview'), button('Replay tutorial', () => {
        if (game.round) game.leaveChallenge();
        state.settings.zen = false;
        tutorial(0);
        modal.close();
        render();
      })
    ]);
    const actions = make('div', 'actions');
    actions.append(button('Export save', () => {
      download(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), 'cesium-save.json');
    }), button('Import save', () => $('import-file').click()), button('Reset progress', () => {
      if (!confirm('Reset all discoveries, inventory, and challenge progress? Export a save first if you want to keep it.')) return;
      replaceState(Cesium.fresh());
      modal.close();
      notify('Progress reset.');
    }));
    const status = issue || (location.protocol === 'file:' ?
      'Automatic saving is working in this browser. File storage varies by browser and file location. Export a backup before moving the game.' :
      'Automatic saving is available in this browser and on this origin.');
    modalBody.append(audio, appearance, gameplay, section('Save management', [make('p', '', status), actions]));
  }

  function download(blob, filename) {
    const link = make('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }

  $('import-file').addEventListener('change', async event => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw new Error('The save file is too large.');
      const imported = Cesium.parse(await file.text());
      if (!confirm('Replace your current CESIUM progress with this save?')) return;
      replaceState(imported);
      if (modal.open) modal.close();
      notify('Save imported.');
    } catch (error) {
      if (modalKind === 'settings') {
        const status = modalBody.querySelector('#import-error') || make('p');
        status.id = 'import-error';
        status.setAttribute('role', 'alert');
        status.textContent = 'Import failed. ' + error.message;
        modalBody.append(status);
        status.scrollIntoView({ block: 'nearest' });
      } else {
        notify('Import failed. ' + error.message);
      }
    }
  });

  function openHelp() {
    openModal('help', 'How to play');
    modalBody.append(
      section('Fuse elements', [
        make('p', '', 'Click or tap an empty cell to create Hydrogen. Drag a tile onto another tile to add their atomic numbers. Any pair can merge as long as the sum is 118 or less.'),
        make('p', '', 'Select a tile, then choose the destination to move or merge without dragging. Use arrow keys to navigate, Enter or Space to select, and Escape to clear the selection.')
      ]),
      section('Discover and store', [
        make('p', '', 'Click a tile to pin its element card. Right-click, press Shift+F10, or hold a tile to open its actions. Stored copies can be retrieved from Collection into an empty cell.'),
        make('p', '', 'Undo a board action with the Undo button or Ctrl+Z / Cmd+Z. Discoveries and achievements stay unlocked.')
      ]),
      section('About the chemistry', [
        make('p', '', 'CESIUM adds atomic numbers as a fictional puzzle mechanic. The inspector describes real elements. Square brackets identify a representative isotope mass number when no standard atomic weight exists.')
      ])
    );
  }

  function switchChallenge(day, restart) {
    if (day === null) game.leaveChallenge();
    else game.startChallenge(day, restart);
    selected = null;
    retrieval = null;
    save();
    render();
    modal.close();
  }

  function openChallenge() {
    openModal('challenge', 'Daily challenge');
    const today = Cesium.utcDay();
    const day = state.challenge.active ?? today;
    const { target, limit } = Cesium.template(day);
    const e = element(target);
    const actions = make('div', 'actions');
    modalBody.append(make('p', '', day + ' UTC'));
    modalBody.append(make('p', '', `Create ${e.name} (${e.symbol}, ${target}) in ${limit} merges or fewer using only the starting tiles.`));
    const best = state.challenge.days[day]?.best;
    if (best) modalBody.append(make('p', '', `Best result · ${best} ${best === 1 ? 'merge' : 'merges'}`));
    if (game.round) {
      actions.append(button('Return to sandbox', () => switchChallenge(null)),
        button('Restart attempt', () => switchChallenge(day, true)));
      if (day !== today) actions.append(button('Play today’s challenge', () => switchChallenge(today), 'button primary'));
    } else {
      actions.append(button(state.challenge.days[today] ? 'Continue challenge' : 'Start challenge', () =>
        switchChallenge(today), 'button primary'));
    }
    modalBody.append(actions);
  }

  function duration(start, end) {
    const minutes = Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 60000));
    if (minutes < 1) return 'Less than a minute';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} d ${hours % 24} h`;
  }

  function completionStats() {
    const { date, theme, stats } = state.completion;
    return [
      ['Successful merges', stats.merges.toLocaleString()],
      ['Hydrogen generated', stats.hydrogenGenerated.toLocaleString()],
      ['Completed', new Date(date).toLocaleDateString(undefined, { dateStyle: 'long' })],
      ['Theme', theme[0].toUpperCase() + theme.slice(1)],
      ['Since first discovery', duration(state.timeline[0].date, date)]
    ];
  }

  function openCompletion() {
    openModal('completion', 'Periodic table complete');
    modalBody.append(make('p', '', '118 / 118 elements discovered'),
      list(completionStats(), ''), section('Certificate', [button('Download PNG', certificate, 'button primary')]));
  }

  function certificate() {
    const canvas = make('canvas');
    canvas.width = 1200;
    canvas.height = 775;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      alert('This browser could not render the certificate.');
      return;
    }
    ctx.fillStyle = '#111215';
    ctx.fillRect(0, 0, 1200, 775);
    ctx.strokeStyle = '#e9bf79';
    ctx.strokeRect(24.5, 24.5, 1151, 726);
    ctx.fillStyle = '#e9bf79';
    ctx.font = '700 67px system-ui';
    ctx.fillText('CESIUM', 84, 124);
    ctx.fillStyle = '#f0ede7';
    ctx.font = '29px system-ui';
    ctx.fillText('Periodic table complete', 86, 177);
    ctx.fillStyle = '#a4a6b0';
    ctx.font = '17px monospace';
    ctx.fillText('118 / 118 DISCOVERED', 88, 214);
    for (const e of ELEMENTS) {
      const [column, row] = elementPosition(e.atomicNumber);
      const x = 87 + (column - 1) * 57;
      const y = 258 + (row - 1) * 36 + (row > 7 ? 12 : 0);
      const swatch = make('span');
      swatch.dataset.family = e.category;
      modalBody.append(swatch);
      ctx.fillStyle = getComputedStyle(swatch).getPropertyValue('--category').trim();
      swatch.remove();
      ctx.fillRect(x, y, 52, 31);
      ctx.fillStyle = '#161a20';
      ctx.font = '600 15px system-ui';
      ctx.fillText(e.symbol, x + 25, y + 21);
      ctx.font = '9px monospace';
      ctx.fillText(e.atomicNumber, x + 4, y + 11);
    }
    completionStats().forEach(([label, value], i) => {
      const x = 88 + (i % 3) * 340;
      const y = 641 + Math.floor(i / 3) * 58;
      ctx.fillStyle = '#a4a6b0';
      ctx.font = '13px monospace';
      ctx.fillText(label.toUpperCase(), x, y);
      ctx.fillStyle = '#f0ede7';
      ctx.font = '20px system-ui';
      ctx.fillText(value, x, y + 25);
    });
    canvas.toBlob(blob => {
      if (blob) download(blob, 'cesium-completion.png');
    }, 'image/png');
  }

  $('undo').addEventListener('click', undo);
  $('collection-button').addEventListener('click', openCollection);
  $('header-collection').addEventListener('click', openCollection);
  $('challenge-button').addEventListener('click', openChallenge);
  $('settings-button').addEventListener('click', openSettings);
  $('help').addEventListener('click', openHelp);
  $('zen').addEventListener('click', () => applySetting('zen', !state.settings.zen));
  $('hint-action').addEventListener('click', () => hintCallback?.());
  document.addEventListener('visibilitychange', configure);
  prefersReducedMotion.addEventListener('change', configure);
  save();
  render();
})();
