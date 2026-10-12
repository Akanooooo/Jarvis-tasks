(() => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }

  const STORAGE_KEY = 'jarvis-tasks-v1';
  const THEME_KEY = 'jarvis-tasks-theme';
  const DEFAULT_THEME = 'jarvis';

  /** @type {{id:string, title:string, date:string, priority:'low'|'normal'|'high', notes:string, done:boolean}[]} */
  let tasks = loadTasks();

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

  const gaugeFill = document.getElementById('gauge-fill');
  const gaugePercent = document.getElementById('gauge-percent');
  const statOpen = document.getElementById('stat-open');
  const statDone = document.getElementById('stat-done');
  const statTotal = document.getElementById('stat-total');

  const modal = document.getElementById('task-modal');
  const modalTitle = document.getElementById('modal-title');
  const form = document.getElementById('task-form');
  const fieldId = document.getElementById('field-id');
  const fieldTitle = document.getElementById('field-title');
  const fieldDate = document.getElementById('field-date');
  const fieldPriority = document.getElementById('field-priority');
  const fieldNotes = document.getElementById('field-notes');
  const btnDelete = document.getElementById('btn-delete');
  const weekdayButtons = document.querySelectorAll('.weekday-btn');
  const fieldRecurring = document.getElementById('field-recurring');
  const recurrenceHint = document.getElementById('recurrence-hint');
  const fieldRecurrenceToggle = document.getElementById('field-recurrence-toggle');
  const recurrencePanel = document.getElementById('recurrence-panel');

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

  // ---------- rendering ----------
  function renderAll() {
    renderToday();
    renderAllTasks();
    renderRecurring();
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
    meta.textContent = `⟳ WIEDERHOLUNG  //  PRIO: ${priorityLabel[task.priority]}`;

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
    const todayWd = weekdayMon0(new Date());
    const singleTodays = tasks.filter(t => !t.recurring && t.date === today);
    const recurringTodays = tasks.filter(t => t.recurring && t.weekdays.includes(todayWd));
    const todays = [...singleTodays, ...recurringTodays]
      .sort((a, b) => Number(isDoneOn(a, today)) - Number(isDoneOn(b, today)) || priorityRank(b) - priorityRank(a));

    todayList.innerHTML = '';
    todayEmpty.hidden = todays.length > 0;
    todays.forEach(t => todayList.appendChild(renderTaskItem(t, { contextDate: today })));

    const done = todays.filter(t => isDoneOn(t, today)).length;
    const total = todays.length;
    const open = total - done;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    statOpen.textContent = open;
    statDone.textContent = done;
    statTotal.textContent = total;
    gaugePercent.textContent = pct + '%';
    const circumference = 2 * Math.PI * 50;
    gaugeFill.style.strokeDasharray = circumference;
    gaugeFill.style.strokeDashoffset = circumference - (pct / 100) * circumference;
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
    metaParts.push(`PRIO: ${priorityLabel[task.priority]}`);
    meta.textContent = metaParts.join('  //  ');

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
    if (t.recurring) {
      t.completedDates = t.completedDates || [];
      const idx = t.completedDates.indexOf(dateStr);
      if (idx >= 0) t.completedDates.splice(idx, 1);
      else t.completedDates.push(dateStr);
    } else {
      t.done = !t.done;
    }
    saveTasks();
    renderAll();
  }

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

    if (task) {
      modalTitle.textContent = 'AUFGABE BEARBEITEN';
      fieldId.value = task.id;
      fieldTitle.value = task.title;
      fieldPriority.value = task.priority;
      fieldNotes.value = task.notes || '';
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

    if (existingId) {
      const existing = tasks.find(t => t.id === existingId);
      if (!existing) { closeModal(); return; }
      if (wantsRecurring) {
        existing.title = title;
        existing.priority = priority;
        existing.notes = notes;
        existing.recurring = true;
        existing.weekdays = selectedWeekdays;
        existing.completedDates = existing.completedDates || [];
        delete existing.date;
        delete existing.done;
      } else {
        existing.title = title;
        existing.priority = priority;
        existing.notes = notes;
        existing.date = fieldDate.value || existing.date || todayStr();
        existing.recurring = false;
        delete existing.weekdays;
        delete existing.completedDates;
      }
    } else if (wantsRecurring) {
      tasks.push({
        id: newId(), title, priority, notes,
        recurring: true, weekdays: selectedWeekdays, completedDates: []
      });
    } else if (selectedWeekdays.length > 0) {
      selectedWeekdays.forEach(wd => {
        tasks.push({
          id: newId(), title, priority, notes,
          date: dateForWeekdayThisWeek(wd), recurring: false, done: false
        });
      });
    } else {
      tasks.push({
        id: newId(), title, priority, notes,
        date: fieldDate.value || todayStr(), recurring: false, done: false
      });
    }

    saveTasks();
    renderAll();
    closeModal();
  });

  // ---------- init ----------
  loadTheme();
  renderAll();
})();
