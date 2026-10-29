# Varoille API Documentation

Base URL: `http://localhost:3000/api`
All responses are JSON. All authenticated routes require header:
`Authorization: Bearer <token>`

Error format: `{ "error": "human-readable message" }`

## Auth

| Method | Route | Body | Success |
|---|---|---|---|
| POST | /auth/register | `{ username, password }` | `201 { token, user }` |
| POST | /auth/login | `{ username, password }` | `200 { token, user }` |
| GET | /auth/me | — | `200 { user }` |
| GET | /users | — | `200 { users: [{id, username}] }` |

## Boards

| Method | Route | Body | Success |
|---|---|---|---|
| GET | /boards | — | `200 { boards: [...] }` (only your boards) |
| POST | /boards | `{ title }` | `201 { board }` (creator auto-added as member) |
| GET | /boards/:boardId | — | `200 { board, members, tasks }` |
| POST | /boards/:boardId/members | `{ user_id }` | `201 { member }` (members only, 403 otherwise) |

## Tasks

| Method | Route | Body | Success |
|---|---|---|---|
| POST | /tasks | `{ board_id, title, description?, status? }` | `201 { task }` |
| PATCH | /tasks/:id | any of `{ title, description, status, assignee_id }` | `200 { task }` |
| DELETE | /tasks/:id | — | `200 { ok: true }` |

`status` is one of `todo`, `doing`, `done`.

## Comments

| Method | Route | Body | Success |
|---|---|---|---|
| GET | /tasks/:id/comments | — | `200 { comments: [...] }` |
| POST | /tasks/:id/comments | `{ body }` | `201 { comment }` |

## Status codes
- `400` invalid input · `401` not logged in / bad credentials ·
  `403` not a member of the board · `404` not found · `500` server error