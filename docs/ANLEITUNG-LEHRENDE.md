# Eigenes Lernspiel in vier Schritten

Für Lehrende, die ein Lernspiel anpassen oder ein neues anlegen und es ihrem Kurs geben wollen. Programmieren
müssen Sie dafür nicht, und Sie brauchen kein weiteres Programm: Alles geschieht im Browser, im **Szenario-Editor**.
Sie brauchen die Adresse Ihrer Installation und einen Schlüssel für Lehrende. In der Demo-Installation ist das
http://localhost:8080/lehrende mit dem Schlüssel `demo-lehrende`; einen persönlichen Schlüssel vergibt die
Administration.

Das Beispiel auf dieser Seite: Aus der „Übung: Spannungsteiler am Sensor“ wird die „Übung: Spannungsteiler im
Praktikum“, freigegeben nur für einen Praktikumskurs.

## 1. Szenario im Editor öffnen

Melden Sie sich unter `/lehrende` an und öffnen Sie **Szenarien**. In der Tabelle steht bei jedem Lernspiel
**Bearbeiten**. Für ein ganz neues Spiel tragen Sie unter „Neues Szenario anlegen“ einen Titel und eine Kennung ein
(Kleinbuchstaben, Ziffern, Bindestrich) und wählen **Im Editor anlegen**; der Editor beginnt dann mit einer Vorlage aus
einer Szene, einer Aufgabe und einem Ende.

![Szenario-Editor: links der Ablauf mit Allgemein, Kapitel und allen Knoten (Szene „Der Aufbau“ als Start, Aufgabe „Teilspannung“ gewählt, Aufgabe „Belastung“), rechts das Formular der Aufgabe mit Titel, Kapitel, Kennung, Art der Aufgabe, Frage und Lösung; oben Prüfen, Vorschau im neuen Tab, Als neue Version speichern](../medien/editor.png)

**Links steht der Ablauf:** „Allgemein“ (Titel, Lizenz, Lernziele, Zahlen je Person), „Kapitel“ und darunter jeder
Knoten des Spiels in seiner Reihenfolge, mit Art (Szene, Aufgabe, Verzweigung, Ende), Titel und den Wegen, die von
ihm weiterführen („→ Belastung“). **Rechts steht das Formular** des gewählten Teils.

## 2. Ändern, was Studierende lesen und entscheiden

Wählen Sie links einen Knoten und ändern Sie rechts die Felder. Im Beispiel unter „Allgemein“ den **Titel** und im
ersten Knoten den **Text der Szene**.

| Knoten | Was Sie im Formular einstellen |
|---|---|
| Szene | Text, Sprechblase der Figur; je Entscheidung: Text, **Führt zu**, Bewertung (gut, vertretbar, riskant), Rückmeldung, Lernziel, Wirkung auf die Anzeige (z. B. Sicherheit +20) |
| Aufgabe | Art (**Rechenaufgabe** mit Lösung als Formel, **Einheit** und **Toleranz**; **Auswahl**; **Reihenfolge**), Frage, typische Fehler mit gezielter Rückmeldung, Punkte, Versuche, Hinweis, Rechenweg, Rückmeldung bei richtig und falsch, **Weiter zu** |
| Verzweigung | Regeln „Wenn … dann weiter zu …“ und „Sonst weiter zu“ (unsichtbar für Studierende) |
| Ende | Ergebnis (Erfolg, Teilerfolg, Misserfolg), Text |

- **Neuer Knoten:** unten links Art wählen, **Hinzufügen**. Er erscheint nach dem gewählten Knoten; verbinden Sie ihn
  über „Führt zu“ oder „Weiter zu“ mit dem Ablauf.
- **Reihenfolge und Entfernen:** im Formular **Nach oben**, **Nach unten**, **Knoten entfernen**; Entscheidungen,
  Antworten und Regeln haben eigene Knöpfe zum Verschieben und Entfernen.
- **Kennung umbenennen** passt alle Verweise im Spiel an.
- **Zahlen je Person** (unter „Allgemein“, z. B. `F` von 30 bis 60 in Schritten von 5) setzen Sie in Texte mit
  `{F}` ein, gerechnete Zahlen mit `{= F / 2 : 1}`. Die Lösung einer Rechenaufgabe ist eine Formel mit diesen Namen.
- **Bilder:** Für Titelbild und Knoten wählen Sie ein Bild aus dem Ordner des Szenarios und schreiben den
  Alternativtext dazu. Neue Bilder hochladen kann der Editor noch nicht; die legt Ihre IT in den Ordner.

## 3. Prüfen, Vorschau, speichern

- **Prüfen** meldet jeden Fehler auf Deutsch, mit der Stelle; **Zur Stelle** öffnet den Knoten und setzt den Cursor
  in das Feld, das Feld selbst ist rot markiert. Hier ein Tippfehler in einer Formel:

  ![Editor nach „Prüfen“: oben „1 Fehler: knoten.teilspannung.loesung „R3“ ist kein Parameter des Szenarios“ mit „Zur Stelle“; links ist die Aufgabe Teilspannung mit „1 Fehler“ markiert](../nachweis/bilder/lehrende-05-editor-fehler.png)

- **Vorschau im neuen Tab** spielt den Entwurf so, wie Studierende ihn sehen, ohne ihn zu speichern. Neu laden
  beginnt von vorn.
- **Als neue Version speichern** legt die nächste Versionsnummer an. Die bisherigen Versionen bleiben erhalten; wer
  gerade spielt, spielt in seiner Version zu Ende, neue Versuche beginnen mit der neuen. Hat inzwischen jemand anderes
  dasselbe Szenario gespeichert, überschreibt der Editor nichts und sagt es Ihnen.

Oben rechts steht immer, ob es **ungespeicherte Änderungen** gibt; verlassen Sie den Editor mit ungespeicherten
Änderungen, fragt er nach.

## 4. Kurs anlegen, freigeben, spielen und auswerten

Öffnen Sie **Kurse**, tragen Sie unter „Neuer Kurs“ einen Namen ein und klicken Sie auf **Anlegen**. Ein neuer Kurs
bekommt zunächst alle Spiele freigegeben. Nehmen Sie die Haken bei den Spielen heraus, die dieser Kurs nicht sehen
soll; jede Änderung wird sofort gespeichert („Freigabe gespeichert.“).

![Kurse: Demokurs und der neue Kurs „Elektrotechnik I, Praktikum WiSe 2026/27“ mit Kurscode; im neuen Kurs ist nur „Übung: Spannungsteiler im Praktikum“ freigegeben](../medien/anleitung-kurs.png)

Den **Kurscode** auf der Kurskarte geben Sie an die Studierenden weiter. Sie treten damit auf der Startseite bei,
ohne Konto und ohne Namen, und spielen allein oder **im Team** (ein Team teilt sich einen Spielstand; jede Person
stimmt ab, die Mehrheit entscheidet).

**Wie Studierende es sehen:** die Startseite in einem privaten Browserfenster öffnen und mit dem Kurscode beitreten.
Ihr Testdurchlauf zählt dann als Teilnehmerin oder Teilnehmer; unter „Meine Daten“ können Sie ihn löschen.

![Das Spiel aus Sicht der Studierenden: Spielanzeige „Übung: Spannungsteiler im Praktikum“ mit Kapitelkarte, Szenenbild, Laborleitung mit Sprechblase und dem geänderten Text](../medien/anleitung-vorschau.png)

**Auswertung:** Unter **Auswertung** wählen Sie Szenario und Kurs. Sie sehen, wie die Versuche ausgehen, welche
Aufgabe im ersten Versuch gelingt, welche typischen Fehler vorkommen und wie entschieden wird. Zahlen erscheinen erst
ab drei Personen (Voreinstellung); vorher steht dort „Noch zu wenige Personen“, damit niemand erkennbar ist.

## In der Vorlesung: Live-Runde

Unter **Live-Runde** wählen Sie Kurs und Szenario und klicken auf **Runde starten**. Die Studierenden des Kurses sehen
die Runde auf ihrer Übersicht und treten mit **Mitmachen** bei. Alle sehen dieselbe Szene und stimmen auf dem eigenen
Gerät ab. Sie sehen live, wie viele abgestimmt haben und, ab drei Stimmen, die Verteilung: bei Entscheidungen je
Möglichkeit mit Bewertung, bei Aufgaben „richtig“ und die erkannten typischen Fehler. Namen oder Pseudonyme sehen Sie
nie.

![Live-Runde für Lehrende: 25 Teilnehmende, 24 von 25 haben abgestimmt; Aufgabe „Kraft in der Diagonale“ mit 15 richtig, 6 „Es gibt zwei Diagonalen; jede trägt die …“, 3 „Die Hälfte der Last stimmt …“; darunter der vorige Schritt mit seiner Entscheidung](../medien/kursrunde-lehrende.png)

<sub>Stimmen im Bild: 24 simulierte Studierende und eine Person im Browser (Messung vom 12.11.2026).</sub>

Mit **Abstimmung schließen** entscheidet die Mehrheit (bei Gleichstand die Möglichkeit, für die zuerst gestimmt
wurde), und alle sehen sofort die Rückmeldung. Haben alle abgestimmt, ist sofort entschieden. **Runde beenden**
beendet sie für alle.

## Fortgeschritten: das Szenario als Datei

Hinter dem Editor steht eine JSON-Datei `szenario.json`; das Format beschreibt [Szenarien schreiben](INHALTE.md).
Im Editor zeigt „Allgemein“ → „Fortgeschritten: JSON ansehen und bearbeiten“ die Datei; **JSON herunterladen**
speichert den Entwurf. Unter **Szenarien** → „Szenario-Datei prüfen oder hochladen“ laden Sie eine Datei wieder hoch
(die Versionsnummer muss dann höher sein als die geladene). Ihre IT kann eine Datei auch ohne Oberfläche prüfen:
`node tools/pruefe.js pfad/zur/szenario.json`.

## Gut zu wissen

- Gespeicherte und hochgeladene Versionen liegen in der Datenbank der Installation, nicht im Repository. Wer die
  Daten der Installation löscht (`docker compose down -v`), löscht sie mit. Laden Sie wichtige Fassungen mit
  **JSON herunterladen** herunter.
- Was die Prüfung als Fehler oder Hinweis meldet, steht in [Szenarien schreiben](INHALTE.md#was-die-prüfung-meldet).

Die Bilder des Editors, der Fehlermeldung und der Live-Runde sind am 12.11.2026 mit dem Browsertest dieses
Repositorys (Chromium, headless) entstanden; die Bilder zu Kursen und der Sicht der Studierenden am 09.11.2026 mit
Playwright (Chromium, Sprache Deutsch).
