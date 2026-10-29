# Varoille 🟣

A full-stack Kanban-style project management app with a purple-gradient theme.
Drag-and-drop boards, tasks, assignees, comments, user accounts, JWT auth, and
per-board permissions — users only see boards they belong to.

## Tech stack
- **Backend:** Node.js, Express, SQLite (better-sqlite3), JWT, bcrypt
- **Frontend:** Vanilla HTML/CSS/JS (no reloads — all fetch + drag-and-drop)

## Features
- Register / login with sessions (JWT stored in localStorage)
- Create boards, add members by username
- Tasks in 3 columns: To Do / In Progress / Done
- Drag-and-drop between columns (optimistic UI + rollback on failure)
- Assignees, editable descriptions, comments with live feed
- Clear toast feedback on every failed request
- 403 if you try to access a board you are not a member of

## Setup
1. Install Node.js 18+ from https://nodejs.org
2. Create the folder structure shown above and paste each file
3. In the `varoille` folder run: