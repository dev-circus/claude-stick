# Claude-Stick: Anleitung für Einsteiger

Claude Code ist ein KI-Assistent, der im Terminal arbeitet. Der Claude-Stick packt ihn samt Browser auf einen USB-Stick oder eine externe Platte, damit du ihn auf Mac, Windows und Linux dabeihast. Dein Login und dein Verlauf liegen verschlüsselt auf dem Stick.

## Was du brauchst

- Internet, immer. Claude arbeitet nur online. Beim ersten Start auf einem Computer werden außerdem die Programme geladen (etwa 400 MB).
- Ein Claude-Konto mit Abo.
- Etwa 1 GB freien Platz.

## Schritt 1: Herunterladen und entpacken

Lade die Datei `claude-stick.zip` von der Seite [Releases](https://github.com/dev-circus/claude-stick/releases/latest) herunter. Eine ZIP-Datei ist ein zusammengepackter Ordner. Damit du ihn benutzen kannst, musst du ihn "entpacken":

- **Mac:** Doppelklick auf die ZIP-Datei. Daneben erscheint ein Ordner.
- **Windows:** Rechtsklick auf die ZIP-Datei, "Alle extrahieren ...", dann "Extrahieren". Nicht einfach in der ZIP-Datei doppelklicken, so startet das Programm nicht richtig.
- **Linux:** Rechtsklick auf die Datei, "Hier entpacken".

Du bekommst einen Ordner `claude-stick`. Kopiere ihn auf einen USB-Stick oder eine externe Platte, wenn du ihn auf mehreren Computern dabeihaben willst. Das Format der Platte sollte "exFAT" sein, dann lesen Mac, Windows und Linux dieselben Dateien. Lässt du den Ordner auf dem Computer, funktioniert er nur dort.

## Schritt 2: Starten

- **Mac:** Rechtsklick auf `Start-Mac.command`, dann "Öffnen", dann noch einmal "Öffnen". Das ist nur beim ersten Mal nötig, danach reicht ein Doppelklick.
- **Windows:** Doppelklick auf `Start-Windows.bat`. Erscheint die Meldung "Der Computer wurde durch Windows geschützt", klicke auf "Weitere Informationen" und dann auf "Trotzdem ausführen".
- **Linux:** Öffne ein Terminal, wechsle mit `cd` in den Ordner und tippe `bash Start-Linux.sh`.

## Schritt 3: Einrichten

Beim ersten Start lädt das Programm alles Nötige selbst. Das sind etwa 400 MB und dauert ein paar Minuten. Danach:

1. Lege ein Passwort fest (mindestens 10 Zeichen). Es lässt sich nicht zurücksetzen. Bewahre es gut auf, am besten in einem Passwortmanager.
2. Wähle im Menü "Anmelden" und folge den Hinweisen. Das ist nur einmal nötig, der Login wird verschlüsselt auf dem Stick gespeichert.
3. Wähle "Claude starten".

## Bedienung

Pfeiltasten bewegen die Markierung, Enter bestätigt. Du kannst auch die Zahl tippen. Mit Esc kommst du zurück.

## Wichtig

- Beende immer über "Beenden" im Menü. Dabei wird alles verschlüsselt gespeichert. Danach den Stick sicher auswerfen.
- Auf Firmen- und Schulrechnern mit Sperren (Gruppenrichtlinien) läuft das Programm oft nicht. Nutze dort claude.ai im Browser.
- Dateien im Ordner `projekte` auf dem Stick sind nicht verschlüsselt.

---

© 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
