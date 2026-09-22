# CommandPulse CMMS — Web Client

Frontend for the CommandPulse Computerized Maintenance Management System.

## Stack

- React 19 + TypeScript + Vite
- Zustand state management
- React Router
- Backend: Express + Prisma + PostgreSQL (see `../backend`)

## Getting Started

```bash
npm install
npm run dev        # starts Vite dev server on http://localhost:3000
```

The dev server proxies `/api` to the backend at `http://localhost:4000`.
Ensure the backend is running and seeded before use.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — typecheck and build for production
- `npm run preview` — preview the production build

## Structure

- `src/pages` — route-level pages
- `src/components/layout` — shell (sidebar, header, command palette)
- `src/store` — Zustand stores
- `src/services` — typed API clients (thin wrappers over `src/lib/api`)
- `src/types` — domain types mirrored from the Prisma schema