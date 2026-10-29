/* ============ Varoille frontend ============ */
const $ = s => document.querySelector(s);
const COLUMNS = [
  { id: 'todo', name: '📋 To Do' },
  { id: 'doing', name: '🚧 In Progress' },
  { id: 'done', name: '✅ Done' },
];

let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user') || 'null');
let currentBoard = null;   // { board, members, tasks }
let openTaskId = null;

/* ---------- api helper: single place for error feedback ---------- */
async function api(path, options = {}) {
  try {
    const res = await fetch('/api' + path, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && token) { logout(false); }
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  } catch (e) {
    if (e.message.startsWith('Request failed') || e.message.includes('failed')) {
      toast('Network error — could not reach the server.', 'error');
    }
    throw e;
  }
}

/* ---------- toasts ---------- */
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ---------- auth view ---------- */
let authMode = 'login';
function renderAuth() {
  $('#auth-view').classList.remove('hidden');
  $('#boards-view').classList.add('hidden');
  $('#board-view').classList.add('hidden');
  $('#btn-logout').classList.add('hidden');
  $('#auth-title').textContent = authMode === 'login' ? 'Welcome back' : 'Create your account';
  $('#auth-submit').textContent = authMode === 'login' ? 'Log in' : 'Register';
  $('#switch-link').textContent = authMode === 'login' ? 'Register' : 'Log in';
}

$('#switch-link').onclick = e => {
  e.preventDefault();
  authMode = authMode === 'login' ? 'register' : 'login';
  renderAuth();
};

$('#auth-submit').onclick = async () => {
  const username = $('#auth-username').value.trim();
  const password = $('#auth-password').value;
  try {
    const data = await api('/auth/' + authMode, { method: 'POST', body: { username, password } });
    token = data.token; user = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    toast(`Hi, ${user.username}!`);
    renderBoards();
  } catch (e) {
    toast(e.message, 'error');
  }
};

$('#btn-logout').onclick = () => logout(true);
function logout(showToast) {
  token = null; user = null;
  localStorage.removeItem('token'); localStorage.removeItem('user');
  if (showToast) toast('Logged out.');
  renderAuth();
}

/* ---------- boards view ---------- */
async function renderBoards() {
  $('#auth-view').classList.add('hidden');
  $('#board-view').classList.add('hidden');
  $('#boards-view').classList.remove('hidden');
  $('#btn-logout').classList.remove('hidden');
  try {
    const { boards } = await api('/boards');
    $('#boards-list').innerHTML = '';
    boards.forEach(b => {
      const card = document.createElement('div');
      card.className = 'board-card';
      card.textContent = b.title;
      card.onclick = () => openBoard(b.id);
      $('#boards-list').appendChild(card);
    });
  } catch (e) { toast(e.message, 'error'); }
}

$('#btn-create-board').onclick = async () => {
  const title = $('#new-board-title').value.trim();
  if (!title) return toast('Give the board a title first.', 'error');
  try {
    await api('/boards', { method: 'POST', body: { title } });
    $('#new-board-title').value = '';
    toast('Board created!');
    renderBoards();
  } catch (e) { toast(e.message, 'error'); }
};

/* ---------- board view ---------- */
async function openBoard(id) {
  try {
    currentBoard = await api(`/boards/${id}`);
  } catch (e) { return toast(e.message, 'error'); }
  $('#auth-view').classList.add('hidden');
  $('#boards-view').classList.add('hidden');
  $('#board-view').classList.remove('hidden');
  $('#board-title').textContent = currentBoard.board.title;
  $('#members-label').textContent = 'Members: ' + currentBoard.members.map(m => m.username).join(', ');

  // member dropdown: all users not yet on this board
  try {
    const { users } = { users: await api('/users') };
    const memberIds = new Set(currentBoard.members.map(m => m.id));
    $('#member-select').innerHTML = '<option value="">— pick a user —</option>' +
      users.filter(u => !memberIds.has(u.id) && u.id !== user.id)
           .map(u => `<option value="${u.id}">${u.username}</option>`).join('');
  } catch (e) { /* non-fatal */ }

  renderKanban();
}

$('#btn-back').onclick = renderBoards;

$('#btn-add-member').onclick = async () => {
  const userId = $('#member-select').value;
  if (!userId) return toast('Pick a user to add.', 'error');
  try {
    const { member } = await api(`/boards/${currentBoard.board.id}/members`, {
      method: 'POST', body: { user_id: Number(userId) },
    });
    toast(`${member.username} added to the board.`);
    openBoard(currentBoard.board.id);
  } catch (e) { toast(e.message, 'error'); }
};

function renderKanban() {
  const kanban = $('#kanban');
  kanban.innerHTML = '';
  COLUMNS.forEach(col => {
    const column = document.createElement('div');
    column.className = 'column';
    column.dataset.status = col.id;
    column.innerHTML = `<div class="col-head"><span>${col.name}</span>
      <span class="count">0</span></div>`;

    currentBoard.tasks
      .filter(t => t.status === col.id)
      .forEach(t => column.appendChild(taskCard(t)));

    const add = document.createElement('div');
    add.className = 'col-add';
    add.innerHTML = `<input placeholder="New task..." /><button class="primary small">Add</button>`;
    const create = async () => {
      const title = add.querySelector('input').value.trim();
      if (!title) return toast('Task needs a title.', 'error');
      try {
        const { task } = await api('/tasks', {
          method: 'POST',
          body: { board_id: currentBoard.board.id, title, status: col.id },
        });
        currentBoard.tasks.push(task);
        toast('Task added.');
        renderKanban();
      } catch (e) { toast(e.message, 'error'); }
    };
    add.querySelector('button').onclick = create;
    add.querySelector('input').addEventListener('keydown', e => { if (e.key === 'Enter') create(); });
    column.appendChild(add);

    column.addEventListener('dragover', e => {
      e.preventDefault();
      column.classList.add('drag-over');
    });
    column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
    column.addEventListener('drop', e => {
      e.preventDefault();
      column.classList.remove('drag-over');
      const taskId = Number(e.dataTransfer.getData('text/plain'));
      moveTask(taskId, col.id);
    });

    kanban.appendChild(column);
    column.querySelector('.count').textContent =
      currentBoard.tasks.filter(t => t.status === col.id).length;
  });
}

function taskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.draggable = true;
  card.dataset.id = task.id;
  card.innerHTML = `
    <div class="t-title">${escapeHtml(task.title)}</div>
    <div class="t-meta">
      <span class="t-assignee">${task.assignee_name ? '@' + task.assignee_name : 'unassigned'}</span>
      <span>💬</span>
    </div>`;
  card.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', task.id);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.onclick = () => openTaskModal(task.id);
  return card;
}

/* move = PATCH; on failure we just re-fetch so UI never lies */
async function moveTask(taskId, status) {
  const task = currentBoard.tasks.find(t => t.id === taskId);
  if (!task) return;
  const oldStatus = task.status;
  task.status = status;          // optimistic
  renderKanban();
  try {
    const { task: updated } = await api(`/tasks/${taskId}`, {
      method: 'PATCH', body: { status },
    });
    Object.assign(task, updated);
    toast('Task moved.');
  } catch (e) {
    task.status = oldStatus;     // roll back
    renderKanban();
    toast(e.message, 'error');
  }
}

/* ---------- task modal ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function openTaskModal(taskId) {
  openTaskId = taskId;
  const task = currentBoard.tasks.find(t => t.id === taskId);
  $('#modal-title').textContent = task.title;
  $('#task-desc').value = task.description || '';
  $('#task-assignee').innerHTML =
    '<option value="">Unassigned</option>' +
    currentBoard.members.map(m =>
      `<option value="${m.id}" ${task.assignee_id === m.id ? 'selected' : ''}>${m.username}</option>`
    ).join('');
  $('#task-modal').classList.remove('hidden');
  loadComments(taskId);
}

async function loadComments(taskId) {
  try {
    const { comments } = await api(`/tasks/${taskId}/comments`);
    $('#comments-list').innerHTML = comments.map(c => `
      <div class="comment">
        <div class="c-head">${escapeHtml(c.username)}</div>
        <div>${escapeHtml(c.body)}</div>
      </div>`).join('');
  } catch (e) { toast(e.message, 'error'); }
}

$('#btn-send-comment').onclick = async () => {
  const body = $('#comment-input').value.trim();
  if (!body) return toast('Write something first.', 'error');
  try {
    await api(`/tasks/${openTaskId}/comments`, { method: 'POST', body: { body } });
    $('#comment-input').value = '';
    loadComments(openTaskId);
  } catch (e) { toast(e.message, 'error'); }
};

$('#task-desc').addEventListener('change', async e => {
  try {
    await api(`/tasks/${openTaskId}`, { method: 'PATCH', body: { description: e.target.value } });
    toast('Description saved.');
  } catch (err) { toast(err.message, 'error'); }
});

$('#task-assignee').addEventListener('change', async e => {
  try {
    await api(`/tasks/${openTaskId}`, {
      method: 'PATCH',
      body: { assignee_id: e.target.value ? Number(e.target.value) : null },
    });
    await openBoard(currentBoard.board.id);   // refresh names
    toast('Assignee updated.');
  } catch (err) { toast(err.message, 'error'); }
});

$('#btn-delete-task').onclick = async () => {
  try {
    await api(`/tasks/${openTaskId}`, { method: 'DELETE' });
    toast('Task deleted.');
    $('#modal-close').click();
    openBoard(currentBoard.board.id);
  } catch (e) { toast(e.message, 'error'); }
};

$('#modal-close').onclick = () => $('#task-modal').classList.add('hidden');
$('#task-modal').addEventListener('click', e => {
  if (e.target === $('#task-modal')) $('#task-modal').classList.add('hidden');
});

/* ---------- boot ---------- */
(async () => {
  if (token) {
    try {
      const { user: me } = await api('/auth/me');
      user = me;
      renderBoards();
    } catch {
      renderAuth();   // bad/expired token
    }
  } else {
    renderAuth();
  }
})();