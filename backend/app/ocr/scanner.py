"""
OCR-Modul für die Erkennung von Namen aus TeamSpeak/Discord Screenshots.
"""

from typing import List, BinaryIO, Tuple
from io import BytesIO
import re

try:
    import pytesseract
    from PIL import Image, ImageEnhance, ImageFilter
    # Windows: Tesseract-Pfad explizit setzen falls nicht in PATH
    import os
    if os.name == 'nt':  # Windows
        tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        if os.path.exists(tesseract_path):
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False


def preprocess_image(image: 'Image.Image') -> 'Image.Image':
    """
    Verbessert das Bild für bessere OCR-Erkennung.
    Speziell optimiert für TeamSpeak/Discord dunkle Themes.
    """
    # In RGB konvertieren falls nötig
    if image.mode != 'RGB':
        image = image.convert('RGB')

    # Größe verdoppeln für bessere OCR
    width, height = image.size
    image = image.resize((width * 2, height * 2), Image.Resampling.LANCZOS)

    # Kontrast erhöhen
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(2.0)

    # Helligkeit anpassen
    enhancer = ImageEnhance.Brightness(image)
    image = enhancer.enhance(1.3)

    # In Graustufen
    image = image.convert('L')

    # Schärfen
    image = image.filter(ImageFilter.SHARPEN)

    return image


def parse_teamspeak_line(line: str) -> List[str]:
    """
    Parst eine TeamSpeak-Zeile im Format: "Username | DisplayName | Tag"
    und extrahiert nur den ersten Namen (Nickname).
    """
    names = []

    # Pipe-getrennte Namen (TeamSpeak Format) - nur ersten Teil nehmen
    if '|' in line:
        parts = line.split('|')
        if parts:
            name = parts[0].strip()
            # Sonderzeichen am Anfang entfernen
            name = re.sub(r'^[\-\*\•\→\►\▶\s]+', '', name)
            if len(name) >= 2:
                names.append(name)
    else:
        # Einzelner Name ohne Pipe
        name = line.strip()
        if len(name) >= 2:
            names.append(name)

    return names


# Bekannte Noise-Patterns (Ränge, Tags, Kanalnamen, etc.)
NOISE_PATTERNS = [
    # Exakte Matches (case-insensitive)
    'KRT', 'VPR', 'GRA', 'STU', 'ERT',  # Staffel-Ränge/Tags
    'AFK', 'DND', 'BRB',  # Status-Tags
    'Kommunikationstraining',  # Bekannte Kanalnamen
    # Regex-Patterns
    r'^\d+$',  # Nur Zahlen
    r'^\d{2}\s*\d{2}$',  # Zahlenpaare wie "18 19"
    r'^.{1}$',  # Einzelne Zeichen
    r'^[a-z]{1,2}\d*$',  # Kurze Buchstaben-Zahlen-Kombinationen wie "a8", "ox"
]


def is_noise(name: str) -> bool:
    """Prüft ob ein Name als Noise gefiltert werden soll."""
    name_stripped = name.strip()
    name_upper = name_stripped.upper()

    # Zu kurz
    if len(name_stripped) < 2:
        return True

    # Exakte Noise-Matches
    for pattern in NOISE_PATTERNS:
        if not pattern.startswith(r'^'):
            # Normaler String-Vergleich
            if name_upper == pattern.upper():
                return True
        else:
            # Regex-Pattern
            if re.match(pattern, name_stripped, re.IGNORECASE):
                return True

    return False


def clean_name(name: str) -> str:
    """Bereinigt einen einzelnen Namen."""
    # Typische TS/Discord Artefakte entfernen
    name = re.sub(r'\[.*?\]', '', name)  # [AFK], [Away] etc.
    name = re.sub(r'\(.*?\)', '', name)  # (Away), (1) etc.
    name = re.sub(r'^[\-\*\•\→\►\▶\s]+', '', name)  # Führende Symbole
    name = re.sub(r'[\-\*\•\→\►\▶\s]+$', '', name)  # Nachfolgende Symbole

    # Nur alphanumerische Zeichen, Unterstriche, Bindestriche und Leerzeichen
    # (typische Spielernamen-Zeichen)
    name = re.sub(r'[^\w\s\-_äöüÄÖÜß]', '', name)

    return name.strip()


def extract_names_from_image(image_data: BinaryIO) -> List[str]:
    """
    Extrahiert Namen aus einem Screenshot (z.B. TeamSpeak Kanalliste).

    Args:
        image_data: Bild als BytesIO oder File-like object

    Returns:
        Liste der erkannten Namen
    """
    if not OCR_AVAILABLE:
        return []

    try:
        # Bild öffnen
        image = Image.open(image_data)

        # Bild vorverarbeiten
        processed_image = preprocess_image(image)

        # OCR mit verschiedenen PSM-Modi versuchen
        all_names = []

        # PSM 6: Uniform block of text (Standard)
        # PSM 4: Single column of text of variable sizes
        # PSM 11: Sparse text - find as much text as possible
        for psm in [6, 4, 11]:
            try:
                text = pytesseract.image_to_string(
                    processed_image,
                    lang='deu+eng',
                    config=f'--psm {psm} --oem 3'
                )

                lines = text.strip().split('\n')

                for line in lines:
                    line = line.strip()
                    if len(line) < 2:
                        continue

                    # TeamSpeak-Format parsen (Name | DisplayName | Tag)
                    parsed_names = parse_teamspeak_line(line)

                    for name in parsed_names:
                        cleaned = clean_name(name)
                        if len(cleaned) >= 2 and not is_noise(cleaned):
                            all_names.append(cleaned)

            except Exception as e:
                print(f"OCR Error with PSM {psm}: {e}")
                continue

        # Duplikate entfernen, Reihenfolge beibehalten
        seen = set()
        unique_names = []
        for name in all_names:
            name_lower = name.lower()
            # Ähnliche Namen zusammenfassen (z.B. "ryze" und "ry_ze")
            simplified = re.sub(r'[_\-\s]', '', name_lower)
            if simplified not in seen and name_lower not in seen:
                seen.add(name_lower)
                seen.add(simplified)
                unique_names.append(name)

        return unique_names

    except Exception as e:
        # Bei Fehlern leere Liste zurückgeben
        print(f"OCR Error: {e}")
        return []


def is_ocr_available() -> bool:
    """Prüft ob OCR verfügbar ist (Tesseract installiert)."""
    if not OCR_AVAILABLE:
        return False

    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False
