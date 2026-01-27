# Poison - Staffelverwaltung v0.6

Eine moderne Webanwendung zur Verwaltung einer Star Citizen Staffel. Ersetzt Google Sheets durch eine benutzerfreundliche Oberfläche mit Rollen- und Rechteverwaltung.

---

## Features

### Anwesenheitserfassung
- **Screenshot-OCR**: Lade einen Screenshot aus TeamSpeak/Discord hoch - Namen werden automatisch erkannt
- **Manuelle Korrektur**: Nicht erkannte Namen können manuell zugeordnet werden
- **Alias-Speicherung**: OCR-Namen als Alias für User speichern
- **Session-Verwaltung**: Erstelle und verwalte Staffelabende mit Datum und Notizen
- **Session wieder öffnen**: Admins können bestätigte Sessions wieder zur Bearbeitung öffnen

### Loot-Verteilung
- **Loot-Sessions**: Erfasse gelootete Items während eines Staffelabends
- **Automatische Verteilung**: Verteile Items an anwesende Mitglieder
- **Standort-Tracking**: Ordne Loot einem Standort zu (Stanton, Pyro, Nyx)
- **Kategorisierte Suche**: Fuzzy-Search findet auch "TS-2" wenn du "TS2" eingibst
- **Datum-Vorauswahl**: Neue Sessions starten mit heutigem Datum

### Inventarverwaltung
- **Persönliches Lager**: Jeder Offizier verwaltet sein eigenes Inventar
- **Transfers**: Übertrage Items zwischen Offizieren mit Bestätigungs-Dialog
- **Standorte**: Organisiere Items nach Standorten (Hangars, Stationen)
- **Kategorien**: Ship Components, Waffen, Erze, Rüstung und mehr

### Item Search (vorher Component Browser)
- **Durchsuche ALLE SC-Items**: Nicht nur Ship Components, sondern alle Items aus dem SC Wiki
- **Kategorie- und Typ-Filter**: Filtere nach Kategorie und Unterkategorie
- **UEX Preis-Integration**: Aktuelle Preise und Kauforte von der UEX API
- **Live-Daten**: Grade (A/B/C/D) und Class (Military/Industrial/Stealth/Civilian/Competition)
- **Detaillierte Stats**: Shield HP, Regen Rate, Power Draw, Quantum Speed und mehr
- **Fuzzy-Search**: "FR76" findet auch "FR-76"

### Admin-Bereich
- **Datenbank-Download**: Komplette SQLite-Datenbank herunterladen
- **CSV-Export**: Exportiere Benutzer, Inventar, Kasse, Staffelabende, Loot als CSV
- **Datenbank-Statistiken**: Übersicht über alle Tabellen und Einträge
- **Server-Backup**: Automatisches tägliches Backup mit 30-Tage Rotation

### Kassenverwaltung
- **Kontostand**: Aktueller Staffel-Kontostand für alle sichtbar
- **Transaktionen**: Einnahmen und Ausgaben mit Beschreibung
- **Nur Treasurer**: Voller Zugriff nur für Kassenverwalter

### Benutzerverwaltung
- **Discord OAuth**: Login ausschließlich über Discord
- **Rollen-System**: Guest, Loot-Guest, Member, Officer, Treasurer, Admin
- **Automatischer Admin**: Erster Login mit konfigurierter Discord-ID wird Admin
- **Vorschau-Modus**: Admins können andere Rollen simulieren

---

## Rollen und Berechtigungen

| Rolle | Anwesenheit | Loot | Lager | Kasse |
|-------|-------------|------|-------|-------|
| **Guest** | - | - | - | - |
| **Loot-Guest** | - | Ansehen | - | - |
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

### v0.6 (Aktuell)
- **Item Search**: Erweiterter Component Browser - durchsuche ALLE SC-Items mit Kategorie-Filter
- **UEX Preis-Integration**: Aktuelle Preise und Kauforte direkt in der Item-Suche
- **Admin: Datenbank & Export**: DB-Download, CSV-Export pro Tabelle, Statistiken
- **Server-Backup**: Automatisches tägliches Backup mit 30-Tage Rotation
- **Anwesenheit**: Sessions wieder öffenbar nach Abschluss (Admin), Screenshot wird archiviert
- **Lager**: Transfer-Bestätigungs-Dialog vor dem Absenden
- **Bugfix**: "Als Alias übernehmen" Checkbox verschwindet nicht mehr

### v0.5
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
