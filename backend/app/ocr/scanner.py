"""
OCR-Modul für die Erkennung von Namen aus TeamSpeak/Discord Screenshots.
"""

from typing import List, BinaryIO
from io import BytesIO
import re

try:
    import pytesseract
    from PIL import Image
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False


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

        # In Graustufen konvertieren für bessere OCR-Ergebnisse
        image = image.convert('L')

        # OCR durchführen
        # Deutsch + Englisch für Umlaute und typische Spielernamen
        text = pytesseract.image_to_string(
            image,
            lang='deu+eng',
            config='--psm 6'  # Assume uniform block of text
        )

        # Text in Zeilen aufteilen und bereinigen
        lines = text.strip().split('\n')
        names = []

        for line in lines:
            # Zeile bereinigen
            name = line.strip()

            # Leere Zeilen und zu kurze Namen überspringen
            if len(name) < 2:
                continue

            # Typische TS/Discord Artefakte entfernen
            # z.B. "[AFK]", "(Away)", Symbole etc.
            name = re.sub(r'\[.*?\]', '', name)
            name = re.sub(r'\(.*?\)', '', name)
            name = re.sub(r'^[\-\*\•\→\►\▶]', '', name)
            name = name.strip()

            # Nochmal Länge prüfen
            if len(name) >= 2:
                names.append(name)

        # Duplikate entfernen, Reihenfolge beibehalten
        seen = set()
        unique_names = []
        for name in names:
            if name.lower() not in seen:
                seen.add(name.lower())
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
