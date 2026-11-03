# Food Waste Saver

Team HA040 · Hackathon 2K26, PESCOE Phaltan · Theme: Food

Food Waste Saver is a surplus-food redistribution web app. People and
businesses with extra food post it, people and NGOs nearby claim it with a
secure pickup code, food close to its deadline is flagged before it goes to
waste, and an impact wall shows what the community has saved.

Built from scratch during Hackathon 2K26 (3–4 November 2026) in this
repository.

## Structure

- `client/` — React + Vite frontend ("Morning Market" design)
- `server/` — Node.js + Express API, Prisma ORM, PostgreSQL database

## Run it locally

Prerequisites: Node.js 20+ and PostgreSQL running locally.

Backend (terminal 1):
1. `cd server`
2. Copy `.env.example` to `.env` and fill in your database connection
3. `npm install`
4. `npx prisma db push`
5. `npm run dev` — API on http://localhost:4000 (health: `/api/health`)

Frontend (terminal 2):
1. `cd client`
2. `npm install`
3. `npm run dev` — app on http://localhost:5173

## Libraries and frameworks used

React, Vite, Express, Prisma, PostgreSQL. Fonts: Plus Jakarta Sans and
Manrope (Google Fonts). This list is updated as the build grows.

## Status

Slice 0 (skeleton): frontend shell with the locked design tokens, API
health endpoint, database connected and verified end-to-end.
