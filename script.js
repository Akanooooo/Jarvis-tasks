(() => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }

  const STORAGE_KEY = 'jarvis-tasks-v1';
  const THEME_KEY = 'jarvis-tasks-theme';
  const TAGS_KEY = 'jarvis-tasks-tags';
  const DEVICE_ID_KEY = 'jarvis-tasks-device-id';
  const NOTIFICATIONS_KEY = 'jarvis-tasks-notifications-enabled';
  const DEFAULT_THEME = 'jarvis';
  const PRESET_TAG_COLORS = ['#4ff2ff', '#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#a855f7', '#ef4444', '#14b8a6'];
  const PUSH_WORKER_URL = 'https://jarvis-tasks-push.felux-klein-19e.workers.dev';
  const VAPID_PUBLIC_KEY = 'BNaouypLdvDoCZUfthf7obZIEK8jBoUgMwab41geSFkGKiYZJwxVnRcucInG2U8kQvAHt_lU15AswJ4R__TgBuw';

  /** @type {{id:string, title:string, date:string, priority:'low'|'normal'|'high', notes:string, done:boolean, tagId:string|null}[]} */
  let tasks = loadTasks();
  /** @type {{id:string, name:string, color:string}[]} */
  let tags = loadTags();

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    syncReminders();
  }

  function loadTags() {
    try {
      const raw = localStorage.getItem(TAGS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveTags() {
    localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
  }

  function toDateStr(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function todayStr() {
    return toDateStr(new Date());
  }

  function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y}`;
  }

  const priorityLabel = { low: 'NIEDRIG', normal: 'NORMAL', high: 'HOCH' };
  const WEEKDAY_LABELS = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'];

  // Monday = 0 ... Sunday = 6 (independent of JS's native Sunday-first getDay())
  function weekdayMon0(date) {
    const d = date.getDay();
    return d === 0 ? 6 : d - 1;
  }

  function dateForWeekdayThisWeek(weekdayMon0Index) {
    const now = new Date();
    const diff = weekdayMon0Index - weekdayMon0(now);
    const target = new Date(now);
    target.setDate(now.getDate() + diff);
    return toDateStr(target);
  }

  function weekBounds() {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - weekdayMon0(now));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday: toDateStr(monday), sunday: toDateStr(sunday) };
  }

  function isDoneOn(task, dateStr) {
    return task.recurring ? (task.completedDates || []).includes(dateStr) : !!task.done;
  }

  function newId() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  }

  // ---------- DOM refs ----------
  const clockEl = document.getElementById('clock');
  const datelineEl = document.getElementById('dateline');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const views = document.querySelectorAll('.view');

  const todayList = document.getElementById('today-list');
  const todayEmpty = document.getElementById('today-empty');
  const allList = document.getElementById('all-list');
  const allEmpty = document.getElementById('all-empty');
  const recurringList = document.getElementById('recurring-list');
  const recurringEmpty = document.getElementById('recurring-empty');

  const calPrev = document.getElementById('cal-prev');
  const calNext = document.getElementById('cal-next');
  const calMonthLabel = document.getElementById('cal-month-label');
  const calendarGrid = document.getElementById('calendar-grid');

  const dayModal = document.getElementById('day-modal');
  const dayModalTitle = document.getElementById('day-modal-title');
  const dayModalClose = document.getElementById('day-modal-close');
  const dayModalAdd = document.getElementById('day-modal-add');
  const dayModalList = document.getElementById('day-modal-list');
  const dayModalEmpty = document.getElementById('day-modal-empty');

  const openDonut = document.getElementById('open-donut');
  const openDonutCount = document.getElementById('open-donut-count');
  const openLegend = document.getElementById('open-legend');
  const doneDonut = document.getElementById('done-donut');
  const doneDonutCount = document.getElementById('done-donut-count');
  const doneLegend = document.getElementById('done-legend');
  const weekDonut = document.getElementById('week-donut');
  const weekDonutCount = document.getElementById('week-donut-count');
  const weekLegend = document.getElementById('week-legend');

  const modal = document.getElementById('task-modal');
  const modalTitle = document.getElementById('modal-title');
  const form = document.getElementById('task-form');
  const fieldId = document.getElementById('field-id');
  const fieldTitle = document.getElementById('field-title');
  const fieldDate = document.getElementById('field-date');
  const fieldTime = document.getElementById('field-time');
  const fieldPriority = document.getElementById('field-priority');
  const fieldNotes = document.getElementById('field-notes');
  const btnDelete = document.getElementById('btn-delete');
  const weekdayButtons = document.querySelectorAll('.weekday-btn');
  const fieldRecurring = document.getElementById('field-recurring');
  const recurrenceHint = document.getElementById('recurrence-hint');
  const fieldRecurrenceToggle = document.getElementById('field-recurrence-toggle');
  const recurrencePanel = document.getElementById('recurrence-panel');

  const tagPicker = document.getElementById('tag-picker');
  const tagCreate = document.getElementById('tag-create');
  const newTagNameInput = document.getElementById('new-tag-name');
  const tagSwatches = document.getElementById('tag-swatches');
  const tagCreateConfirm = document.getElementById('tag-create-confirm');
  const tagCreateCancel = document.getElementById('tag-create-cancel');
  const tagReflectToggle = document.getElementById('tag-reflect-toggle');

  const reflectionModal = document.getElementById('reflection-modal');
  const reflectionModalSubtitle = document.getElementById('reflection-modal-subtitle');
  const reflectionText = document.getElementById('reflection-text');
  const reflectionSave = document.getElementById('reflection-save');
  const reflectionSkip = document.getElementById('reflection-skip');
  const reflectionModalClose = document.getElementById('reflection-modal-close');

  const btnSettings = document.getElementById('btn-settings');
  const settingsModal = document.getElementById('settings-modal');
  const settingsClose = document.getElementById('settings-close');
  const themeCards = document.querySelectorAll('.theme-card');

  // ---------- theme ----------
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeCards.forEach(card => {
      card.classList.toggle('active', card.dataset.themeChoice === theme);
    });
  }

  function loadTheme() {
    let theme = DEFAULT_THEME;
    try {
      theme = localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
    } catch {}
    applyTheme(theme);
  }

  themeCards.forEach(card => {
    card.addEventListener('click', () => {
      const theme = card.dataset.themeChoice;
      applyTheme(theme);
      try { localStorage.setItem(THEME_KEY, theme); } catch {}
    });
  });

  function openSettings() {
    applyTheme(document.documentElement.dataset.theme || DEFAULT_THEME);
    settingsModal.hidden = false;
  }
  function closeSettings() {
    settingsModal.hidden = true;
  }

  btnSettings.addEventListener('click', openSettings);
  settingsClose.addEventListener('click', closeSettings);
  settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !settingsModal.hidden) closeSettings(); });

  // ---------- backup / restore ----------
  const btnExport = document.getElementById('btn-export');
  const btnImport = document.getElementById('btn-import');
  const importFileInput = document.getElementById('import-file');
  const btnEnableNotifications = document.getElementById('btn-enable-notifications');
  const notifStatus = document.getElementById('notif-status');

  btnExport.addEventListener('click', () => {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks,
      tags
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-tasks-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  btnImport.addEventListener('click', () => importFileInput.click());

  importFileInput.addEventListener('change', () => {
    const file = importFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.tasks) || !Array.isArray(data.tags)) {
          alert('Diese Datei sieht nicht wie ein gültiges Backup aus.');
          return;
        }
        const whenLabel = data.exportedAt ? new Date(data.exportedAt).toLocaleString('de-DE') : 'unbekanntem Datum';
        if (!confirm(`Backup vom ${whenLabel} importieren? Das ersetzt alle aktuellen Aufgaben und Tags.`)) {
          return;
        }
        tasks = data.tasks;
        tags = data.tags;
        saveTasks();
        saveTags();
        renderAll();
        renderTagPicker();
        alert('Backup erfolgreich importiert.');
      } catch (e) {
        alert('Datei konnte nicht gelesen werden — ist es eine gültige Backup-Datei?');
      } finally {
        importFileInput.value = '';
      }
    };
    reader.readAsText(file);
  });

  // ---------- push notifications ----------
  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  function localDateTimeToIso(dateStr, timeStr) {
    // Built from the browser's own local timezone (correct for the user),
    // then serialized to an unambiguous UTC instant for the server.
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = timeStr.split(':').map(Number);
    return new Date(y, m - 1, d, h, min, 0).toISOString();
  }

  function buildReminders() {
    const reminders = [];
    const today = todayStr();
    const horizonDays = 14;

    tasks.forEach(t => {
      if (!t.time) return;
      if (t.recurring) {
        for (let i = 0; i < horizonDays; i++) {
          const d = new Date();
          d.setDate(d.getDate() + i);
          const dateStr = toDateStr(d);
          const wd = weekdayMon0(d);
          if (t.weekdays.includes(wd) && !isDoneOn(t, dateStr)) {
            reminders.push({ id: `${t.id}:${dateStr}`, title: t.title, dueAt: localDateTimeToIso(dateStr, t.time) });
          }
        }
      } else if (t.date >= today && !t.done) {
        reminders.push({ id: t.id, title: t.title, dueAt: localDateTimeToIso(t.date, t.time) });
      }
    });
    return reminders;
  }

  function syncReminders() {
    if (localStorage.getItem(NOTIFICATIONS_KEY) !== 'true') return;
    fetch(`${PUSH_WORKER_URL}/sync-reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: getDeviceId(), reminders: buildReminders() })
    }).catch(() => {});
  }

  function updateNotifStatus() {
    const enabled = localStorage.getItem(NOTIFICATIONS_KEY) === 'true';
    notifStatus.textContent = enabled
      ? 'Aktiv — du bekommst Erinnerungen für Aufgaben mit Uhrzeit.'
      : 'Erinnerung per Push-Nachricht, wenn eine Aufgabe mit Uhrzeit fällig ist.';
    btnEnableNotifications.textContent = enabled ? 'DEAKTIVIEREN' : 'AKTIVIEREN';
  }

  async function enableNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push-Benachrichtigungen werden auf diesem Gerät/Browser nicht unterstützt.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Ohne Erlaubnis kann ich dir keine Benachrichtigungen schicken.');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }
      await fetch(`${PUSH_WORKER_URL}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: getDeviceId(), subscription: sub.toJSON() })
      });
      localStorage.setItem(NOTIFICATIONS_KEY, 'true');
      syncReminders();
      updateNotifStatus();
      alert('Benachrichtigungen aktiviert.');
    } catch (err) {
      alert('Benachrichtigungen konnten nicht aktiviert werden.');
    }
  }

  function disableNotifications() {
    localStorage.setItem(NOTIFICATIONS_KEY, 'false');
    updateNotifStatus();
  }

  btnEnableNotifications.addEventListener('click', () => {
    if (localStorage.getItem(NOTIFICATIONS_KEY) === 'true') {
      disableNotifications();
    } else {
      enableNotifications();
    }
  });

  // ---------- clock ----------
  function tickClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('de-DE');
    datelineEl.textContent = now.toLocaleDateString('de-DE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }).toUpperCase();
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ---------- tabs ----------
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('view-' + btn.dataset.view).classList.add('active');
    });
  });

  // ---------- weekday picker ----------
  function getSelectedWeekdays() {
    if (!fieldRecurrenceToggle.checked) return [];
    return Array.from(weekdayButtons)
      .filter(b => b.classList.contains('active'))
      .map(b => Number(b.dataset.weekday));
  }

  function updateRecurrenceHint() {
    const selected = getSelectedWeekdays();
    if (selected.length === 0) {
      recurrenceHint.textContent = 'Kein Wochentag gewählt — es gilt das Datum oben.';
    } else if (fieldRecurring.checked) {
      recurrenceHint.textContent = 'Wiederholt sich jede Woche an den gewählten Tagen.';
    } else {
      recurrenceHint.textContent = 'Wird einmalig für diese Woche an den gewählten Tagen angelegt.';
    }
  }

  function setRecurrencePanelOpen(open) {
    fieldRecurrenceToggle.checked = open;
    recurrencePanel.hidden = !open;
    if (!open) {
      weekdayButtons.forEach(b => b.classList.remove('active'));
      fieldRecurring.checked = false;
    }
    updateRecurrenceHint();
  }

  fieldRecurrenceToggle.addEventListener('change', () => {
    setRecurrencePanelOpen(fieldRecurrenceToggle.checked);
  });

  weekdayButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      updateRecurrenceHint();
    });
  });
  fieldRecurring.addEventListener('change', updateRecurrenceHint);

  // ---------- tag picker ----------
  let selectedTagId = null;
  let pendingSwatchColor = PRESET_TAG_COLORS[0];

  function renderTagPicker() {
    tagPicker.innerHTML = '';

    const noneChip = document.createElement('button');
    noneChip.type = 'button';
    noneChip.className = 'tag-chip' + (selectedTagId === null ? ' active' : '');
    noneChip.textContent = 'Kein Tag';
    noneChip.addEventListener('click', () => {
      selectedTagId = null;
      renderTagPicker();
    });
    tagPicker.appendChild(noneChip);

    tags.forEach(tag => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip' + (selectedTagId === tag.id ? ' active' : '');
      chip.style.color = tag.color;
      const dot = document.createElement('span');
      dot.className = 'tag-dot';
      dot.style.background = tag.color;
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(tag.name));
      chip.addEventListener('click', () => {
        selectedTagId = tag.id;
        renderTagPicker();
      });
      tagPicker.appendChild(chip);
    });

    const addChip = document.createElement('button');
    addChip.type = 'button';
    addChip.className = 'tag-chip add-new';
    addChip.textContent = '+ Neu';
    addChip.addEventListener('click', () => {
      tagCreate.hidden = false;
      newTagNameInput.value = '';
      tagReflectToggle.checked = false;
      pendingSwatchColor = PRESET_TAG_COLORS[0];
      renderTagSwatches();
      newTagNameInput.focus();
    });
    tagPicker.appendChild(addChip);
  }

  function renderTagSwatches() {
    tagSwatches.innerHTML = '';
    PRESET_TAG_COLORS.forEach(color => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'tag-swatch' + (color === pendingSwatchColor ? ' selected' : '');
      sw.style.background = color;
      sw.style.color = color;
      sw.addEventListener('click', () => {
        pendingSwatchColor = color;
        renderTagSwatches();
      });
      tagSwatches.appendChild(sw);
    });
  }

  tagCreateConfirm.addEventListener('click', () => {
    const name = newTagNameInput.value.trim();
    if (!name) {
      alert('Bitte einen Namen für den Tag eingeben.');
      return;
    }
    const tag = { id: newId(), name, color: pendingSwatchColor, reflect: tagReflectToggle.checked };
    tags.push(tag);
    saveTags();
    selectedTagId = tag.id;
    tagCreate.hidden = true;
    renderTagPicker();
  });
  tagCreateCancel.addEventListener('click', () => { tagCreate.hidden = true; });

  // ---------- rendering ----------
  function renderAll() {
    renderToday();
    renderAllTasks();
    renderRecurring();
    renderTagCharts();
    renderCalendar();
    if (!dayModal.hidden && currentDayModalDate) renderDayModalList(currentDayModalDate);
  }

  function tasksForToday() {
    const today = todayStr();
    const todayWd = weekdayMon0(new Date());
    const single = tasks.filter(t => !t.recurring && t.date === today);
    const recurring = tasks.filter(t => t.recurring && t.weekdays.includes(todayWd));
    return [...single, ...recurring];
  }

  function tasksForDate(dateStr) {
    const wd = weekdayMon0(new Date(dateStr + 'T00:00:00'));
    const single = tasks.filter(t => !t.recurring && t.date === dateStr);
    const recurring = tasks.filter(t => t.recurring && t.weekdays.includes(wd));
    return [...single, ...recurring];
  }

  function openOccurrencesForThisWeek() {
    const { monday, sunday } = weekBounds();
    const result = [];
    tasks.forEach(t => {
      if (t.recurring) {
        t.weekdays.forEach(wd => {
          const date = dateForWeekdayThisWeek(wd);
          if (!isDoneOn(t, date)) result.push(t);
        });
      } else if (t.date >= monday && t.date <= sunday && !isDoneOn(t, t.date)) {
        result.push(t);
      }
    });
    return result;
  }

  function renderTagCharts() {
    const today = todayStr();
    const todays = tasksForToday();
    const open = todays.filter(t => !isDoneOn(t, today));
    const done = todays.filter(t => isDoneOn(t, today));
    renderDonut(openDonut, openDonutCount, openLegend, open);
    renderDonut(doneDonut, doneDonutCount, doneLegend, done);
    renderDonut(weekDonut, weekDonutCount, weekLegend, openOccurrencesForThisWeek());
  }

  function renderDonut(donutEl, countEl, legendEl, taskList) {
    countEl.textContent = taskList.length;
    legendEl.innerHTML = '';

    if (taskList.length === 0) {
      donutEl.style.background = 'var(--accent-wash-3)';
      const empty = document.createElement('div');
      empty.className = 'legend-empty';
      empty.textContent = 'Keine Aufgaben';
      legendEl.appendChild(empty);
      return;
    }

    const counts = new Map();
    taskList.forEach(t => {
      const key = t.tagId || '__none__';
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const total = taskList.length;
    let cursor = 0;
    const segments = [];
    counts.forEach((count, key) => {
      const tag = key === '__none__' ? null : tags.find(t => t.id === key);
      const color = tag ? tag.color : 'var(--text-dim)';
      const pct = (count / total) * 100;
      segments.push(`${color} ${cursor}% ${cursor + pct}%`);
      cursor += pct;

      const row = document.createElement('div');
      row.className = 'legend-row';
      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = color;
      const name = document.createElement('span');
      name.className = 'legend-name';
      name.textContent = tag ? tag.name : 'Ohne Tag';
      const countSpan = document.createElement('span');
      countSpan.className = 'legend-count';
      countSpan.textContent = count;
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(countSpan);
      legendEl.appendChild(row);
    });

    donutEl.style.background = `conic-gradient(${segments.join(', ')})`;
  }

  // ---------- calendar ----------
  let calendarViewDate = new Date();
  let currentDayModalDate = null;

  function renderCalendar() {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    calMonthLabel.textContent = calendarViewDate
      .toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
      .toUpperCase();

    const firstOfMonth = new Date(year, month, 1);
    const startOffset = weekdayMon0(firstOfMonth);
    const gridStart = new Date(year, month, 1 - startOffset);

    const today = todayStr();
    calendarGrid.innerHTML = '';

    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + i);
      const dateStr = toDateStr(cellDate);
      const isOtherMonth = cellDate.getMonth() !== month;

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'calendar-day'
        + (isOtherMonth ? ' other-month' : '')
        + (dateStr === today ? ' today' : '');

      const num = document.createElement('span');
      num.className = 'calendar-day-number';
      num.textContent = cellDate.getDate();
      cell.appendChild(num);

      const dayTasks = tasksForDate(dateStr);
      if (dayTasks.length > 0) {
        const doneCount = dayTasks.filter(t => isDoneOn(t, dateStr)).length;
        const badge = document.createElement('span');
        badge.className = 'calendar-day-badge' + (doneCount === dayTasks.length ? ' all-done' : '');
        badge.textContent = dayTasks.length;
        cell.appendChild(badge);
      }

      cell.addEventListener('click', () => openDayModal(dateStr));
      calendarGrid.appendChild(cell);
    }
  }

  calPrev.addEventListener('click', () => {
    calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
    renderCalendar();
  });
  calNext.addEventListener('click', () => {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
    renderCalendar();
  });

  function renderDayModalList(dateStr) {
    const list = tasksForDate(dateStr)
      .sort((a, b) => Number(isDoneOn(a, dateStr)) - Number(isDoneOn(b, dateStr)) || priorityRank(b) - priorityRank(a));
    dayModalList.innerHTML = '';
    dayModalEmpty.hidden = list.length > 0;
    list.forEach(t => dayModalList.appendChild(renderTaskItem(t, { contextDate: dateStr })));
  }

  function openDayModal(dateStr) {
    currentDayModalDate = dateStr;
    const d = new Date(dateStr + 'T00:00:00');
    dayModalTitle.textContent = d
      .toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      .toUpperCase();
    dayModalAdd.onclick = () => {
      closeDayModal();
      openModal();
      fieldDate.value = dateStr;
    };
    renderDayModalList(dateStr);
    dayModal.hidden = false;
  }

  function closeDayModal() {
    dayModal.hidden = true;
    currentDayModalDate = null;
  }

  dayModalClose.addEventListener('click', closeDayModal);
  dayModal.addEventListener('click', (e) => { if (e.target === dayModal) closeDayModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dayModal.hidden) closeDayModal(); });

  function appendTagBadge(meta, task) {
    if (!task.tagId) return;
    const tag = tags.find(t => t.id === task.tagId);
    if (!tag) return;
    const badge = document.createElement('span');
    badge.className = 'meta-tag';
    const dot = document.createElement('span');
    dot.className = 'tag-dot';
    dot.style.background = tag.color;
    badge.appendChild(dot);
    badge.appendChild(document.createTextNode(tag.name));
    meta.appendChild(badge);
  }

  function renderRecurring() {
    const list = tasks.filter(t => t.recurring).sort((a, b) => priorityRank(b) - priorityRank(a));
    recurringList.innerHTML = '';
    recurringEmpty.hidden = list.length > 0;
    list.forEach(t => recurringList.appendChild(renderRecurringItem(t)));
  }

  function renderRecurringItem(task) {
    const li = document.createElement('li');
    li.className = `task-item priority-${task.priority}`;
    li.dataset.id = task.id;

    const body = document.createElement('div');
    body.className = 'task-body';

    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task.title;

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    appendTagBadge(meta, task);
    const metaText = document.createElement('span');
    metaText.textContent = `⟳ WIEDERHOLUNG  //  PRIO: ${priorityLabel[task.priority]}`;
    meta.appendChild(metaText);

    body.appendChild(title);
    body.appendChild(meta);

    if (task.notes && task.notes.trim()) {
      const notes = document.createElement('div');
      notes.className = 'task-notes';
      notes.textContent = task.notes;
      body.appendChild(notes);
    }

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-icon';
    editBtn.title = 'Bearbeiten';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', () => openModal(task));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.title = 'Löschen';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => {
      if (confirm(`Wiederkehrende Aufgabe "${task.title}" wirklich löschen? Das entfernt alle Wiederholungen.`)) deleteTask(task.id);
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(body);
    li.appendChild(actions);
    return li;
  }

  function renderToday() {
    const today = todayStr();
    const todays = tasksForToday()
      .sort((a, b) => Number(isDoneOn(a, today)) - Number(isDoneOn(b, today)) || priorityRank(b) - priorityRank(a));

    todayList.innerHTML = '';
    todayEmpty.hidden = todays.length > 0;
    todays.forEach(t => todayList.appendChild(renderTaskItem(t, { contextDate: today })));
  }

  function renderAllTasks() {
    const today = todayStr();
    const recurring = tasks.filter(t => t.recurring)
      .sort((a, b) => priorityRank(b) - priorityRank(a));
    const single = tasks.filter(t => !t.recurring)
      .sort((a, b) => a.date.localeCompare(b.date) || Number(a.done) - Number(b.done) || priorityRank(b) - priorityRank(a));

    allList.innerHTML = '';
    allEmpty.hidden = (recurring.length + single.length) > 0;
    recurring.forEach(t => allList.appendChild(renderTaskItem(t, { contextDate: today })));
    single.forEach(t => allList.appendChild(renderTaskItem(t, { contextDate: t.date, showDate: true })));
  }

  function priorityRank(t) {
    return { low: 0, normal: 1, high: 2 }[t.priority] ?? 1;
  }

  function renderTaskItem(task, opts = {}) {
    const { contextDate, showDate = false } = opts;
    const dateForDone = task.recurring ? (contextDate || todayStr()) : task.date;
    const isDone = isDoneOn(task, dateForDone);

    const li = document.createElement('li');
    li.className = `task-item priority-${task.priority}${isDone ? ' done' : ''}`;
    li.dataset.id = task.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox';
    checkbox.checked = isDone;
    checkbox.addEventListener('change', () => toggleDone(task.id, dateForDone));

    const body = document.createElement('div');
    body.className = 'task-body';

    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task.title;

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    const metaParts = [];
    if (task.recurring) {
      const days = [...task.weekdays].sort((a, b) => a - b).map(wd => WEEKDAY_LABELS[wd]).join(' · ');
      metaParts.push(`⟳ ${days}`);
    } else if (showDate) {
      metaParts.push(formatDate(task.date));
    }
    if (task.time) metaParts.push(`⏰ ${task.time}`);
    metaParts.push(`PRIO: ${priorityLabel[task.priority]}`);
    appendTagBadge(meta, task);
    const metaText = document.createElement('span');
    metaText.textContent = metaParts.join('  //  ');
    meta.appendChild(metaText);

    body.appendChild(title);
    body.appendChild(meta);

    if (task.notes && task.notes.trim()) {
      const notes = document.createElement('div');
      notes.className = 'task-notes';
      notes.textContent = task.notes;
      body.appendChild(notes);
    }

    const reflectionNote = task.reflections && task.reflections[dateForDone];
    if (reflectionNote) {
      const reflection = document.createElement('div');
      reflection.className = 'task-notes task-reflection';
      reflection.textContent = `💭 ${reflectionNote}`;
      body.appendChild(reflection);
    }

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-icon';
    editBtn.title = 'Bearbeiten';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', () => openModal(task));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.title = 'Löschen';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => {
      if (confirm(`Aufgabe "${task.title}" wirklich löschen?`)) deleteTask(task.id);
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(checkbox);
    li.appendChild(body);
    li.appendChild(actions);
    return li;
  }

  // ---------- CRUD ----------
  function toggleDone(id, dateStr) {
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    let justCompleted = false;
    if (t.recurring) {
      t.completedDates = t.completedDates || [];
      const idx = t.completedDates.indexOf(dateStr);
      if (idx >= 0) {
        t.completedDates.splice(idx, 1);
      } else {
        t.completedDates.push(dateStr);
        justCompleted = true;
      }
    } else {
      t.done = !t.done;
      justCompleted = t.done;
    }
    saveTasks();
    renderAll();

    if (justCompleted) {
      const tag = t.tagId ? tags.find(x => x.id === t.tagId) : null;
      if (tag && tag.reflect) openReflectionModal(t, dateStr);
    }
  }

  // ---------- reflection modal ----------
  let reflectionContext = null;

  function openReflectionModal(task, dateStr) {
    reflectionContext = { taskId: task.id, dateStr };
    reflectionModalSubtitle.textContent = `${task.title} — ${formatDate(dateStr)}`;
    reflectionText.value = (task.reflections && task.reflections[dateStr]) || '';
    reflectionModal.hidden = false;
    reflectionText.focus();
  }

  function closeReflectionModal() {
    reflectionModal.hidden = true;
    reflectionContext = null;
  }

  reflectionSave.addEventListener('click', () => {
    if (!reflectionContext) { closeReflectionModal(); return; }
    const t = tasks.find(x => x.id === reflectionContext.taskId);
    if (t) {
      t.reflections = t.reflections || {};
      const text = reflectionText.value.trim();
      if (text) t.reflections[reflectionContext.dateStr] = text;
      else delete t.reflections[reflectionContext.dateStr];
      saveTasks();
      renderAll();
    }
    closeReflectionModal();
  });
  reflectionSkip.addEventListener('click', closeReflectionModal);
  reflectionModalClose.addEventListener('click', closeReflectionModal);
  reflectionModal.addEventListener('click', (e) => { if (e.target === reflectionModal) closeReflectionModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !reflectionModal.hidden) closeReflectionModal(); });

  function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    renderAll();
  }

  // ---------- modal ----------
  function openModal(task = null) {
    form.reset();
    weekdayButtons.forEach(b => b.classList.remove('active'));
    fieldRecurring.checked = false;
    fieldRecurrenceToggle.checked = false;
    recurrencePanel.hidden = true;
    tagCreate.hidden = true;
    selectedTagId = task ? (task.tagId || null) : null;
    renderTagPicker();

    if (task) {
      modalTitle.textContent = 'AUFGABE BEARBEITEN';
      fieldId.value = task.id;
      fieldTitle.value = task.title;
      fieldPriority.value = task.priority;
      fieldNotes.value = task.notes || '';
      fieldTime.value = task.time || '';
      if (task.recurring) {
        fieldDate.value = '';
        weekdayButtons.forEach(b => {
          if (task.weekdays.includes(Number(b.dataset.weekday))) b.classList.add('active');
        });
        fieldRecurring.checked = true;
        fieldRecurrenceToggle.checked = true;
        recurrencePanel.hidden = false;
      } else {
        fieldDate.value = task.date;
      }
      btnDelete.hidden = false;
      btnDelete.onclick = () => {
        if (confirm(`Aufgabe "${task.title}" wirklich löschen?`)) {
          deleteTask(task.id);
          closeModal();
        }
      };
    } else {
      modalTitle.textContent = 'NEUE AUFGABE';
      fieldId.value = '';
      fieldDate.value = todayStr();
      fieldPriority.value = 'normal';
      btnDelete.hidden = true;
    }
    updateRecurrenceHint();
    modal.hidden = false;
    fieldTitle.focus();
  }

  function closeModal() {
    modal.hidden = true;
  }

  document.getElementById('btn-add-today').addEventListener('click', () => openModal());
  document.getElementById('btn-add-all').addEventListener('click', () => openModal());
  document.getElementById('btn-add-recurring').addEventListener('click', () => {
    openModal();
    setRecurrencePanelOpen(true);
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = fieldTitle.value.trim();
    if (!title) return;

    const priority = fieldPriority.value;
    const notes = fieldNotes.value.trim();
    const time = fieldTime.value || null;
    const selectedWeekdays = getSelectedWeekdays();
    const wantsRecurring = fieldRecurring.checked;

    if (wantsRecurring && selectedWeekdays.length === 0) {
      alert('Bitte mindestens einen Wochentag auswählen, damit sich die Aufgabe wiederholen kann.');
      return;
    }
    if (!wantsRecurring && selectedWeekdays.length === 0 && !fieldDate.value) {
      alert('Bitte ein Datum wählen oder Wochentage auswählen.');
      return;
    }

    const existingId = fieldId.value;

    const tagId = selectedTagId;

    if (existingId) {
      const existing = tasks.find(t => t.id === existingId);
      if (!existing) { closeModal(); return; }
      if (wantsRecurring) {
        existing.title = title;
        existing.priority = priority;
        existing.notes = notes;
        existing.tagId = tagId;
        existing.time = time;
        existing.recurring = true;
        existing.weekdays = selectedWeekdays;
        existing.completedDates = existing.completedDates || [];
        delete existing.date;
        delete existing.done;
      } else {
        existing.title = title;
        existing.priority = priority;
        existing.notes = notes;
        existing.tagId = tagId;
        existing.time = time;
        existing.date = fieldDate.value || existing.date || todayStr();
        existing.recurring = false;
        delete existing.weekdays;
        delete existing.completedDates;
      }
    } else if (wantsRecurring) {
      tasks.push({
        id: newId(), title, priority, notes, tagId, time,
        recurring: true, weekdays: selectedWeekdays, completedDates: []
      });
    } else if (selectedWeekdays.length > 0) {
      selectedWeekdays.forEach(wd => {
        tasks.push({
          id: newId(), title, priority, notes, tagId, time,
          date: dateForWeekdayThisWeek(wd), recurring: false, done: false
        });
      });
    } else {
      tasks.push({
        id: newId(), title, priority, notes, tagId, time,
        date: fieldDate.value || todayStr(), recurring: false, done: false
      });
    }

    saveTasks();
    renderAll();
    closeModal();
  });

  // ---------- init ----------
  loadTheme();
  updateNotifStatus();
  renderAll();
})();
