# Butzele Bank 🐾

Eine Spar-App mit einem kleinen Pixel-Dackel namens **Butzele**. Jede Einzahlung macht ihn
glücklich, mit Freudensprüngen, Herzchen und Münzen. Wenn du lange nichts sparst, legt er sich
traurig hin, und irgendwann regnet es in seinem Körbchen.

**App:** https://realvibecoderr.github.io/butzele-bank/

## Was die App kann

- **Butzele, der Dackel:** komplett in Pixel-Art animiert, mit 5 Stimmungen
  - *Überglücklich*: Zoomies, Sprünge, Herzchen, hechelt
  - *Glücklich*: wedelt, hüpft, legt den Kopf schief
  - *Zufrieden*: schnüffelt, gähnt, wedelt gemütlich
  - *Traurig*: liegt mit dem Kopf auf den Pfoten, seufzt, schaut hoffnungsvoll hoch
  - *Sehr traurig*: Regenwolke, Tränen, schläft traurig ein
- **Reaktionen:** Bei einer Einzahlung fängt er eine Münze und springt vor Freude. Bei einer
  Ausgabe zuckt er zusammen und schwitzt. Am Zahltag und bei erreichten Zielen gibt's Konfetti.
  Antippen = streicheln.
- **Spar-Serie** (wie bei Duolingo): jede Woche mit mindestens einer Einzahlung zählt
- **Näpfe:** Budgets pro Kategorie (Lebensmittel, Kaffee …) mit Ausgaben-Tracking
- **Zahltag:** füllt alle Näpfe wieder auf, optional direkt etwas sparen
- **Sparziele** mit Zieldatum, Fortschritt und „noch X € pro Monat“
- **Verlauf** aller Buchungen
- **Kontoauszug-Import (CSV)** von Sparkasse, DKB, ING, N26, Comdirect, Volksbank u. a.;
  Ausgaben werden automatisch einem Napf zugeordnet
- Backup als JSON, Demo-Daten, 8-Bit-Geräusche, läuft offline

Alle Daten bleiben lokal auf deinem Gerät (localStorage), es gibt keinen Server.

### Wie die Stimmung berechnet wird

| Letzte Einzahlung | Stimmung |
|---|---|
| heute | Überglücklich |
| vor 1–3 Tagen | Glücklich (ab 4 Wochen Serie: überglücklich) |
| vor 4–7 Tagen | Zufrieden |
| vor 8–14 Tagen | Traurig |
| länger | Sehr traurig |

Ist ein Napf überzogen, sinkt die Stimmung um eine Stufe.

## Aufs Handy

iPhone: Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“.
Android: Chrome → Menü → „App installieren“.

## Echte Kontoverbindung (nächster Schritt)

Eine automatische Live-Verbindung zum Bankkonto geht in der EU nur über einen
lizenzierten PSD2-Dienst. Dessen Zugangsschlüssel dürfen **nicht** in einer Web-App im Browser
liegen, deshalb braucht es dafür einen kleinen Server (z. B. einen Cloudflare Worker).

Für den privaten Gebrauch passt [Enable Banking](https://enablebanking.com/): Laut deren
Bedingungen ist die Nutzung mit den **eigenen**, selbst verknüpften Konten kostenlos.
So würde es laufen:

1. Bei Enable Banking ein Konto anlegen und eine Anwendung registrieren
   (du bekommst eine App-ID und einen privaten Schlüssel)
2. Dein Konto im Control Panel verknüpfen
3. Einen kleinen Worker bauen, der die Umsätze abruft und an die App weitergibt
4. Die App holt neue Buchungen dann automatisch, statt per CSV

Bis dahin funktioniert der **CSV-Import**: im Online-Banking die Umsätze als CSV exportieren
und unter Einstellungen → „CSV-Datei importieren“ einlesen.

## Entwicklung

Keine Build-Tools nötig, reines HTML/CSS/JS.

```bash
python3 -m http.server 8000
```

- `js/dog.js`: der Dackel. Wird jeden Frame aus Formen in ein 104 × 60 Pixel großes Raster
  gemalt; Umriss und Schattierung entstehen automatisch. Stimmungen, Leerlauf-Aktionen und
  Reaktionen stehen in `idle()`, `applyAction()` und `applyReaction()`.
- `js/app.js`: Daten, Stimmung, alle Ansichten
- `js/csv.js`: Kontoauszug-Parser
- `js/sfx.js`: 8-Bit-Geräusche per WebAudio
- `tools/dog-lab.html`: alle Stimmungen und Reaktionen nebeneinander zum Testen
- `tools/make-icons.py`: erzeugt die App-Icons aus `tools/icon-head.json`

Nach Änderungen in `sw.js` die Cache-Version (`butzele-vN`) hochzählen.
