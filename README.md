# Poison - Staffelverwaltung v0.5

Eine moderne Webanwendung zur Verwaltung einer Star Citizen Staffel. Ersetzt Google Sheets durch eine benutzerfreundliche Oberfläche mit Rollen- und Rechteverwaltung.

---

## Features

### Anwesenheitserfassung
- **Screenshot-OCR**: Lade einen Screenshot aus TeamSpeak/Discord hoch - Namen werden automatisch erkannt
- **Manuelle Korrektur**: Nicht erkannte Namen können manuell zugeordnet werden
- **Session-Verwaltung**: Erstelle und verwalte Staffelabende mit Datum und Notizen

### Loot-Verteilung
- **Loot-Sessions**: Erfasse gelootete Items während eines Staffelabends
- **Automatische Verteilung**: Verteile Items an anwesende Mitglieder
- **Standort-Tracking**: Ordne Loot einem Standort zu (Stanton, Pyro, Nyx)
- **Kategorisierte Suche**: Fuzzy-Search findet auch "TS-2" wenn du "TS2" eingibst

### Inventarverwaltung
- **Persönliches Lager**: Jeder Offizier verwaltet sein eigenes Inventar
- **Transfers**: Übertrage Items zwischen Offizieren
- **Standorte**: Organisiere Items nach Standorten (Hangars, Stationen)
- **Kategorien**: Ship Components, Waffen, Erze, Rüstung und mehr

### Component Browser (NEU in v0.5)
- **Durchsuche Ship Components**: Shields, Power Plants, Coolers, Quantum Drives
- **Live-Daten**: Holt Grade (A/B/C/D) und Class (Military/Industrial/Stealth/Civilian/Competition) von der SC Wiki API
- **Detaillierte Stats**: Shield HP, Regen Rate, Power Draw, Quantum Speed und mehr
- **Fuzzy-Search**: "FR76" findet auch "FR-76"

### Kassenverwaltung
- **Kontostand**: Aktueller Staffel-Kontostand für alle sichtbar
- **Transaktionen**: Einnahmen und Ausgaben mit Beschreibung
- **Nur Treasurer**: Voller Zugriff nur für Kassenverwalter

### Benutzerverwaltung
- **Discord OAuth**: Login ausschließlich über Discord
- **Rollen-System**: Member, Officer, Treasurer, Admin
- **Automatischer Admin**: Erster Login mit konfigurierter Discord-ID wird Admin

---

## Rollen und Berechtigungen

| Rolle | Anwesenheit | Loot | Lager | Kasse |
|-------|-------------|------|-------|-------|
| **Member** | Ansehen | Ansehen | Ansehen | Kontostand |
| **Officer** | Erfassen | Erfassen & Verteilen | Eigenes bearbeiten | Kontostand |
| **Treasurer** | wie Officer | wie Officer | wie Officer | Vollzugriff |
| **Admin** | Vollzugriff | Vollzugriff | Alle bearbeiten | Vollzugriff |

---

## Tech Stack

| Komponente | Technologie |
|------------|-------------|
| **Frontend** | React + TypeScript + Vite + Tailwind CSS |
| **Backend** | Python + FastAPI + SQLAlchemy |
| **Datenbank** | SQLite (PostgreSQL-kompatibel) |
| **OCR** | pytesseract (Tesseract OCR) |
| **Auth** | Discord OAuth2 |
| **API-Daten** | star-citizen.wiki API |

---

## Screenshots

*Coming soon*

---

## Lizenz

Privates Projekt für Staffel Viper - Das Kartell

---

## Version History

### v0.5 (Aktuell)
- Component Browser mit SC Wiki API Integration
- Fuzzy-Search für Komponenten ("TS2" findet "TS-2")
- Class und Grade Anzeige (Military/Industrial, A/B/C/D)
- Detaillierte Stats (Shield, Power, Cooler, Quantum Drive)
- Standorte direkt in Loot-Sessions erstellen
- Verbesserte Kategorisierung in Item-Auswahl

### v0.4
- Loot-Session Verwaltung
- Inventar-Transfers
- Screenshot-OCR Verbesserungen

### v0.3
- Standortverwaltung
- Item-Kategorien
- SC Wiki Import

### v0.2
- Anwesenheitserfassung mit OCR
- Basis-Inventarverwaltung
- Kassenverwaltung

### v0.1
- Initiales Setup
- Discord OAuth
- Grundlegende Seitenstruktur
