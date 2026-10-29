const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'varoille-dev-secret-change-me';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

/* ---------- helpers ---------- */

function sign(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

/* only members of the task's board can touch it */
function loadTask(req, res, next) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const member = db
    .prepare('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?')
    .get(task.board_id, req.user.id);
  if (!member) return res.status(403).json({ error: 'You are not a member of this board.' });
  req.task = task;
  next();
}

function requireMember(req, res, next) {
  const boardId = req.params.boardId || req.body.board_id;
  const member = db
    .prepare('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?')
    .get(boardId, req.user.id);
  if (!member) return res.status(403).json({ error: 'You are not a member of this board.' });
  next();
}

const wrap = fn => (req, res) => {
  Promise.resolve(fn(req, res)).catch(() =>
    res.status(500).json({ error: 'Server error. Please try again.' })
  );
};

/* ---------- auth ---------- */

app.post('/api/auth/register', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 4)
    return res.status(400).json({ error: 'Username and a password of 4+ characters are required.' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username))
    return res.status(409).json({ error: 'That username is already taken.' });
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  const user = { id: Number(info.lastInsertRowid), username };
  res.status(201).json({ token: sign(user), user });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !(await bcrypt.compare(password || '', user.password_hash)))
    return res.status(401).json({ error: 'Wrong username or password.' });
  res.json({ token: sign(user), user: { id: user.id, username: user.username } });
}));

app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

app.get('/api/users', auth, (req, res) => {
  res.json(db.prepare('SELECT id, username FROM users').all());
});

/* ---------- boards ---------- */

app.get('/api/boards', auth, (req, res) => {
  const boards = db.prepare(`
    SELECT b.id, b.title, b.owner_id FROM boards b
    JOIN board_members m ON m.board_id = b.id
    WHERE m.user_id = ? ORDER BY b.id`).all(req.user.id);
  res.json({ boards });
});

app.post('/api/boards', auth, (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Board title is required.' });
  const info = db
    .prepare('INSERT INTO boards (title, owner_id) VALUES (?, ?)')
    .run(title, req.user.id);
  const boardId = Number(info.lastInsertRowid);
  db.prepare('INSERT INTO board_members (board_id, user_id) VALUES (?, ?)').run(boardId, req.user.id);
  res.status(201).json({ board: { id: boardId, title, owner_id: req.user.id } });
});

app.post('/api/boards/:boardId/members', auth, requireMember, (req, res) => {
  const { user_id } = req.body || {};
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  db.prepare('INSERT OR IGNORE INTO board_members (board_id, user_id) VALUES (?, ?)')
    .run(req.params.boardId, user_id);
  res.status(201).json({ member: user });
});

/* full board: members + tasks (only if you belong) */
app.get('/api/boards/:boardId', auth, requireMember, (req, res) => {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.boardId);
  const members = db.prepare(`
    SELECT u.id, u.username FROM board_members m
    JOIN users u ON u.id = m.user_id WHERE m.board_id = ?`).all(req.params.boardId);
  const tasks = db.prepare(`
    SELECT t.*, u.username AS assignee_name FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    WHERE t.board_id = ? ORDER BY t.position`).all(req.params.boardId);
  res.json({ board, members, tasks });
});

/* ---------- tasks ---------- */

app.post('/api/tasks', auth, requireMember, (req, res) => {
  const { board_id, title, description = '', status = 'todo' } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Task title is required.' });
  const last = db.prepare('SELECT MAX(position) AS p FROM tasks WHERE board_id = ? AND status = ?')
    .get(board_id, status);
  const info = db.prepare(`
    INSERT INTO tasks (board_id, title, description, status, position)
    VALUES (?, ?, ?, ?, ?)`)
    .run(board_id, title, description, status, (last.p || 0) + 1);
  res.status(201).json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid) });
});

app.patch('/api/tasks/:id', auth, loadTask, (req, res) => {
  const { title, description, status, position, assignee_id } = req.body || {};
  const t = req.task;
  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      position = COALESCE(?, position),
      assignee_id = ? 
    WHERE id = ?`)
    .run(title ?? null, description ?? null, status ?? null,
         position ?? t.position,
         assignee_id === undefined ? t.assignee_id : assignee_id,
         t.id);
  res.json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(t.id) });
});

app.delete('/api/tasks/:id', auth, loadTask, (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.task.id);
  res.json({ ok: true });
});

/* ---------- comments ---------- */

app.get('/api/tasks/:id/comments', auth, loadTask, (req, res) => {
  res.json({
    comments: db.prepare(`
      SELECT c.*, u.username FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.task_id = ? ORDER BY c.created_at DESC`).all(req.task.id)
  });
});

app.post('/api/tasks/:id/comments', auth, loadTask, (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Comment cannot be empty.' });
  const info = db.prepare('INSERT INTO comments (task_id, user_id, body) VALUES (?, ?, ?)')
    .run(req.task.id, req.user.id, body.trim());
  const comment = db.prepare(`
    SELECT c.*, u.username FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`)
    .get(info.lastInsertRowid);
  res.status(201).json({ comment });
});

/* ---------- start ---------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Varoille running → http://localhost:${PORT}`));