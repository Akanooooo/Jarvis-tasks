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

  function todayStr() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y}`;
  }

  const priorityLabel = { low: 'NIEDRIG', normal: 'NORMAL', high: 'HOCH' };

  // ---------- DOM refs ----------
  const clockEl = document.getElementById('clock');
  const datelineEl = document.getElementById('dateline');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const views = document.querySelectorAll('.view');

  const todayList = document.getElementById('today-list');
  const todayEmpty = document.getElementById('today-empty');
  const allList = document.getElementById('all-list');
  const allEmpty = document.getElementById('all-empty');

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

  // ---------- rendering ----------
  function renderAll() {
    renderToday();
    renderAllTasks();
  }

  function renderToday() {
    const today = todayStr();
    const todays = tasks.filter(t => t.date === today)
      .sort((a, b) => Number(a.done) - Number(b.done) || priorityRank(b) - priorityRank(a));

    todayList.innerHTML = '';
    todayEmpty.hidden = todays.length > 0;
    todays.forEach(t => todayList.appendChild(renderTaskItem(t)));

    const done = todays.filter(t => t.done).length;
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
    const sorted = [...tasks].sort((a, b) =>
      a.date.localeCompare(b.date) || Number(a.done) - Number(b.done) || priorityRank(b) - priorityRank(a)
    );
    allList.innerHTML = '';
    allEmpty.hidden = sorted.length > 0;
    sorted.forEach(t => allList.appendChild(renderTaskItem(t, true)));
  }

  function priorityRank(t) {
    return { low: 0, normal: 1, high: 2 }[t.priority] ?? 1;
  }

  function renderTaskItem(task, showDate = false) {
    const li = document.createElement('li');
    li.className = `task-item priority-${task.priority}${task.done ? ' done' : ''}`;
    li.dataset.id = task.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox';
    checkbox.checked = task.done;
    checkbox.addEventListener('change', () => toggleDone(task.id));

    const body = document.createElement('div');
    body.className = 'task-body';

    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task.title;

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    const metaParts = [`PRIO: ${priorityLabel[task.priority]}`];
    if (showDate) metaParts.unshift(formatDate(task.date));
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
  function toggleDone(id) {
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    t.done = !t.done;
    saveTasks();
    renderAll();
  }

  function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    renderAll();
  }

  function upsertTask(data) {
    if (data.id) {
      const t = tasks.find(t => t.id === data.id);
      if (t) Object.assign(t, data);
    } else {
      tasks.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        title: data.title,
        date: data.date,
        priority: data.priority,
        notes: data.notes,
        done: false
      });
    }
    saveTasks();
    renderAll();
  }

  // ---------- modal ----------
  function openModal(task = null) {
    form.reset();
    if (task) {
      modalTitle.textContent = 'AUFGABE BEARBEITEN';
      fieldId.value = task.id;
      fieldTitle.value = task.title;
      fieldDate.value = task.date;
      fieldPriority.value = task.priority;
      fieldNotes.value = task.notes || '';
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
    modal.hidden = false;
    fieldTitle.focus();
  }

  function closeModal() {
    modal.hidden = true;
  }

  document.getElementById('btn-add-today').addEventListener('click', () => openModal());
  document.getElementById('btn-add-all').addEventListener('click', () => openModal());
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = fieldTitle.value.trim();
    if (!title) return;
    upsertTask({
      id: fieldId.value || null,
      title,
      date: fieldDate.value || todayStr(),
      priority: fieldPriority.value,
      notes: fieldNotes.value.trim()
    });
    closeModal();
  });

  // ---------- init ----------
  loadTheme();
  renderAll();
})();
