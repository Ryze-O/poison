# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Poison is a web application for managing a Star Citizen squadron. It replaces Google Sheets with a modern web interface featuring user roles and permissions.

**Tech Stack:**
- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Python + FastAPI + SQLAlchemy
- Database: SQLite (production-ready for PostgreSQL)
- OCR: pytesseract for TeamSpeak/Discord screenshot scanning
- Auth: Discord OAuth2

## Development Commands

### Backend (Python)
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # Linux/Mac
pip install -r requirements.txt
uvicorn app.main:app --reload  # Starts on port 8000
```

### Frontend (React)
```bash
cd frontend
npm install
npm run dev                    # Starts on port 5173
```

### Database
```bash
cd backend
alembic upgrade head           # Run migrations
alembic revision --autogenerate -m "description"  # Create migration
```

## Architecture

### Backend Structure
- `app/main.py` - FastAPI entry point, CORS, router registration
- `app/routers/` - API endpoints (auth, users, components, inventory, treasury, attendance, loot)
- `app/models/` - SQLAlchemy models (User, Component, Inventory, Treasury, Attendance, Loot)
- `app/schemas/` - Pydantic schemas for request/response validation
- `app/auth/` - Discord OAuth2 and JWT handling
- `app/ocr/scanner.py` - Tesseract integration for name extraction

### Frontend Structure
- `src/pages/` - Route components (Dashboard, Attendance, Loot, Inventory, Treasury, Users)
- `src/components/` - Reusable UI components
- `src/hooks/useAuth.ts` - Zustand store for authentication state
- `src/api/client.ts` - Axios client with token interceptor
- `src/api/types.ts` - TypeScript type definitions

### User Roles (ascending permissions)
- `member` - View only
- `officer` - Manage attendance, loot, own inventory
- `treasurer` - Officer + manage treasury
- `admin` - Full access

## Key Implementation Details

### Authentication Flow
1. Frontend calls `/auth/login` → returns Discord OAuth URL
2. User authenticates with Discord
3. Backend callback exchanges code for token, creates/updates user
4. JWT token returned to frontend via redirect
5. Frontend stores token in localStorage, attaches to all API requests

### OCR Screenshot Processing
- Images uploaded to `/api/attendance/scan`
- Processed in memory only (never saved to disk)
- Tesseract extracts names, matches against known users
- Returns matched users and unmatched names for manual assignment

### Inventory Transfers
- Officers can transfer components between each other
- All transfers are logged in `inventory_transfers` table
- Transfers automatically update both sender and receiver inventories

## Environment Variables

### Backend (.env)
```
DATABASE_URL=sqlite:///./data/poison.db
DISCORD_CLIENT_ID=xxx
DISCORD_CLIENT_SECRET=xxx
DISCORD_REDIRECT_URI=http://localhost:5173/auth/callback
SECRET_KEY=xxx
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000
```

## Testing

```bash
cd backend && pytest
cd frontend && npm test
```

## Common Tasks

### Adding a new API endpoint
1. Create Pydantic schema in `app/schemas/`
2. Add route in appropriate `app/routers/` file
3. Use `check_role()` for permission enforcement
4. Add TypeScript types in `frontend/src/api/types.ts`

### Adding a new database table
1. Create SQLAlchemy model in `app/models/`
2. Export in `app/models/__init__.py`
3. Create Alembic migration: `alembic revision --autogenerate -m "add table"`
4. Run migration: `alembic upgrade head`
