from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import get_settings
from app.database import engine, Base
from app.routers import auth, users, components, inventory, treasury, attendance, loot, locations, sc_import, data_import, officer_accounts

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Datenbank-Tabellen erstellen
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: Hier könnten Cleanup-Aktionen stehen


app = FastAPI(
    title="Poison - Staffel-Verwaltung",
    description="Web-Anwendung zur Verwaltung einer Star Citizen Staffel",
    version="0.1.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

# CORS für Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router einbinden
app.include_router(auth.router, prefix="/api/auth", tags=["Authentifizierung"])
app.include_router(users.router, prefix="/api/users", tags=["Benutzer"])
app.include_router(components.router, prefix="/api/items", tags=["Items"])
app.include_router(components.router, prefix="/api/components", tags=["Items (Legacy)"])  # Alias für Kompatibilität
app.include_router(inventory.router, prefix="/api/inventory", tags=["Lager"])
app.include_router(treasury.router, prefix="/api/treasury", tags=["Kasse"])
app.include_router(officer_accounts.router, prefix="/api/officer-accounts", tags=["Offizier-Konten"])
app.include_router(attendance.router, prefix="/api/attendance", tags=["Anwesenheit"])
app.include_router(loot.router, prefix="/api/loot", tags=["Loot"])
app.include_router(locations.router, prefix="/api/locations", tags=["Standorte"])
app.include_router(sc_import.router, prefix="/api/sc", tags=["Star Citizen Import"])
app.include_router(data_import.router, prefix="/api/import", tags=["Daten-Import"])


@app.get("/")
async def root():
    return {"message": "Poison API läuft", "version": "0.1.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
