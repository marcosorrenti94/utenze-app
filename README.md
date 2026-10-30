# ⚡ Utenze · Luce & Gas

Web app per ripartire le bollette di **luce** e **gas** tra proprietario e inquilino quando le utenze sono collegate.
Legge i PDF delle bollette nel browser, calcola la quota dell'inquilino voce per voce, tiene lo storico, mostra grafici e
sincronizza i dati tra PC e smartphone tramite un **repository GitHub privato**.

- **Stack:** Vite · React · TypeScript · Tailwind CSS · shadcn/ui · lucide-react · Framer Motion · Recharts · pdfjs-dist · Octokit · IndexedDB (idb) · jsPDF · Vitest
- **Hosting:** GitHub Pages (repository pubblico, solo codice)
- **Dati:** repository GitHub privato separato (`utenze-data`), letto e scritto con la Contents API

---

## Indice

1. [Struttura del progetto](#struttura-del-progetto)
2. [Avvio rapido](#avvio-rapido)
3. [Deploy su GitHub Pages](#deploy-su-github-pages)
4. [Setup del repository dati privato e del token](#setup-del-repository-dati-privato-e-del-token)
5. [Logica di calcolo](#logica-di-calcolo)
6. [Sincronizzazione multi-dispositivo](#sincronizzazione-multi-dispositivo)
7. [Lettura dei PDF e nuovi fornitori](#lettura-dei-pdf-e-nuovi-fornitori)
8. [Sicurezza e privacy](#sicurezza-e-privacy)
9. [Test](#test)
10. [Risoluzione problemi](#risoluzione-problemi)

---

## Struttura del progetto

```
utenze-app/
├── .github/workflows/deploy.yml      # CI: test + build + deploy su GitHub Pages
├── public/favicon.svg
├── index.html
├── package.json
├── vite.config.ts                    # base automatico per Pages + config Vitest
├── tailwind.config.js · postcss.config.js · components.json
├── tsconfig.json · tsconfig.app.json · tsconfig.node.json
└── src/
    ├── main.tsx · App.tsx · index.css
    ├── types.ts                      # modello dati (db.json)
    ├── hooks/
    │   ├── useTheme.tsx              # tema chiaro/scuro + prefers-color-scheme
    │   └── useHashRoute.ts           # routing via hash (compatibile con Pages)
    ├── state/DataContext.tsx         # cache IndexedDB + sync GitHub + coda salvataggi
    ├── lib/
    │   ├── calc/                     # ★ logica di calcolo pura e testata
    │   │   ├── defaults.ts           # regole di ripartizione predefinite
    │   │   ├── electricity.ts        # calcolo luce voce per voce
    │   │   ├── gas.ts                # calcolo gas (percentuale)
    │   │   ├── readings.ts           # consumi, validazioni, anomalie
    │   │   ├── summary.ts            # riepilogo mensile e snapshot
    │   │   ├── round.ts
    │   │   └── electricity.test.ts   # test Vitest
    │   ├── parsers/                  # ★ parser PDF isolato ed estendibile
    │   │   ├── pdfText.ts            # estrazione testo con pdfjs-dist
    │   │   ├── patterns.ts           # regex generiche (Bolletta 2.0)
    │   │   ├── providers/index.ts    # registro fornitori
    │   │   ├── electricity.ts · gas.ts · common.ts · numbers.ts · types.ts
    │   │   └── parsers.test.ts
    │   ├── storage/
    │   │   ├── github.ts             # Octokit, gestione SHA e conflitti
    │   │   ├── cache.ts              # IndexedDB
    │   │   ├── connection.ts         # token nel localStorage del dispositivo
    │   │   └── base64.ts
    │   ├── message.ts                # testo per WhatsApp/email
    │   ├── pdfExport.ts              # PDF del riepilogo mensile
    │   ├── format.ts · palette.ts · utils.ts
    ├── components/                   # Layout, KPI, tooltip, dropzone, empty state…
    │   └── ui/                       # componenti shadcn/ui
    └── pages/                        # Connessione, Dashboard, Letture, Luce, Gas, Riepilogo, Impostazioni
```

---

## Avvio rapido

Requisiti: **Node.js 20+** e npm.

```bash
npm install        # installa le dipendenze
npm run dev        # avvia in sviluppo su http://localhost:5173
npm test           # esegue i test Vitest
npm run build      # type-check + build di produzione in dist/
npm run preview    # anteprima locale della build
```

> Dopo il primo `npm install` fai commit anche di `package-lock.json`: il workflow userà `npm ci` per build riproducibili.

---

## Deploy su GitHub Pages

1. Crea un repository **pubblico** per il codice (es. `utenze-app`) e fai push del progetto sul branch `main`.
2. Su GitHub apri **Settings → Pages** e in **Build and deployment → Source** scegli **GitHub Actions**.
3. A ogni push su `main` il workflow `.github/workflows/deploy.yml`:
   - installa le dipendenze,
   - esegue i test (`npm test`): se falliscono, il deploy si ferma,
   - fa la build e pubblica `dist/` su Pages.
4. L'app sarà disponibile su `https://<tuo-utente>.github.io/<nome-repo>/`.

**Base path:** `vite.config.ts` ricava automaticamente `base` dal nome del repository quando gira in GitHub Actions
(`/<nome-repo>/`, oppure `/` per un repository `<utente>.github.io`). Per un dominio personalizzato imposta la variabile
d'ambiente `VITE_BASE=/` nel workflow.

---

## Setup del repository dati privato e del token

### 1. Crea il repository dati privato

1. Vai su <https://github.com/new>.
2. Nome: `utenze-data` (o un altro a tua scelta).
3. Visibilità: **Private** ✅
4. Spunta **Add a README file** (il repository deve avere almeno un commit e un branch di default).
5. **Create repository**.

L'app creerà da sola, al primo salvataggio:

```
utenze-data/
├── data/db.json              # letture, bollette, calcoli, pagamenti, impostazioni
├── bills/AAAA-MM-luce.pdf    # PDF originali delle bollette luce
├── bills/AAAA-MM-gas.pdf     # PDF originali delle bollette gas
└── photos/AAAA-MM-xxxx.jpg   # foto facoltative del contascatti
```

### 2. Crea un Fine-grained Personal Access Token

1. Vai su **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   (link diretto: <https://github.com/settings/personal-access-tokens/new>).
2. **Token name:** `utenze-app`.
3. **Expiration:** scegli una scadenza (es. 90 giorni o 1 anno). Alla scadenza basterà generarne uno nuovo.
4. **Resource owner:** il tuo account.
5. **Repository access:** **Only select repositories** → seleziona **solo** `utenze-data`.
6. **Permissions → Repository permissions → Contents:** **Read and write**.
   (Metadata: Read-only viene aggiunto automaticamente. Non servono altri permessi.)
7. **Generate token** e copia il valore (`github_pat_…`): GitHub lo mostra una sola volta.

### 3. Collega l'app (su ogni dispositivo)

1. Apri l'app: al primo avvio compare la schermata **Connessione**.
2. Inserisci **owner** (il tuo username), **nome del repository** (`utenze-data`) e il **token**.
3. Premi **Verifica connessione**: l'app controlla che il repository esista, che il token possa scrivere e che il
   repository sia privato (in caso contrario mostra un avviso).
4. Premi **Connetti e sincronizza**.

Ripeti su smartphone e PC: tutti i dispositivi leggono e scrivono lo stesso `data/db.json`.

### 4. Dare accesso in sola consultazione a un'altra persona

1. Crea un **secondo** fine-grained token, dedicato a quella persona: stesso repository `utenze-data`, ma
   **Contents: Read-only** e una scadenza.
2. In **Impostazioni → Condividi in sola consultazione** incollalo e premi **Crea link**: l'app verifica il token e
   genera un link `https://…/utenze-app/#invito=…`.
3. Invia il link: chi lo apre entra direttamente in sola consultazione, **senza token né account GitHub**.

Il token viaggia dentro il link, dopo il `#` (parte che i browser non inviano mai ai server); all'apertura l'app lo
salva sul dispositivo e lo toglie dalla barra degli indirizzi. Il link non è cifrato: chi lo possiede vede i dati, quindi
mandalo solo alla persona interessata. In alternativa la persona può collegarsi a mano dalla schermata **Connessione**
attivando **Solo consultazione**.

Vedrà dashboard, letture, bollette (anche i PDF) e riepiloghi, ma non potrà modificare nulla: l'app nasconde i comandi di
modifica e, soprattutto, GitHub rifiuta qualsiasi scrittura con un token in sola lettura. Per revocare l'accesso basta
eliminare quel token da *Settings → Developer settings → Fine-grained tokens*, senza toccare il tuo.
Con **Impostazioni → Disconnetti** il token e la cache vengono cancellati da quel dispositivo.

---

## Logica di calcolo

Tutta la logica sta in `src/lib/calc/`: funzioni **pure**, senza dipendenze dalla UI, coperte dai test.

### Consumo dell'inquilino

```
consumo del mese = lettura cumulativa del mese − lettura precedente
```

La prima lettura registrata è la **lettura iniziale** di partenza e non genera consumo.
Validazioni:

- la lettura non può essere inferiore alla precedente né superiore alla successiva;
- c'è una sola lettura per mese;
- se il consumo supera di oltre il **50%** la media degli ultimi mesi compare un avviso (soglia configurabile).

### Luce

Ogni voce della bolletta è scomposta in tre componenti: **quota consumo** (€/kWh), **quota fissa** (€/mese) e **quota potenza** (€/kW).
Ogni coppia voce × componente ha un metodo di ripartizione configurabile in **Impostazioni**:

| Voce | Consumo | Fissa | Potenza |
|---|---|---|---|
| Materia energia | proporzionale ai kWh | 50/50 | 50/50 |
| Trasporto e gestione contatore | proporzionale ai kWh | 50/50 | 50/50 |
| Oneri di sistema | proporzionale ai kWh | 50/50 | 50/50 |
| Accise | proporzionale ai kWh | 50/50 | 50/50 |
| Canone RAI | 50/50 | 50/50 | 50/50 |
| Altre partite / conguagli | 50/50 | 50/50 | 50/50 |

Metodi disponibili: *proporzionale ai kWh*, *50/50*, *percentuale personalizzata*, *escluso* (a carico del proprietario).

**Voci a consumo:**

$$\text{costo unitario} = \frac{\sum \text{voci proporzionali ai kWh}}{\text{kWh totali della bolletta}} \qquad \text{quota inquilino} = \text{kWh inquilino} \times \text{costo unitario}$$

**IVA** (impostazione *Ripartizione IVA*):

- *Aliquota* (predefinita): l'aliquota della bolletta viene applicata all'imponibile di ciascuno.
- *Proporzionale*: l'IVA della bolletta viene divisa in proporzione all'imponibile di ciascuno.

Le voci esenti (es. canone RAI) non entrano nell'imponibile.

**Arrotondamento:** gli importi intermedi restano a precisione piena; si arrotonda al centesimo **solo il totale finale**
dell'inquilino. La quota del proprietario è `totale bolletta − quota inquilino`, quindi le due quote sommano sempre al totale.

**Avvisi:** kWh dell'inquilino superiori ai kWh della bolletta (in quel caso le voci a consumo sono attribuite al massimo al 100%), data della lettura fuori dal periodo di fatturazione
(tolleranza 7 giorni), lettura o kWh mancanti, somma delle voci diversa dal totale della bolletta.

In sintesi: **tutto ciò che in bolletta è a €/kWh si divide in base ai kWh reali dell'inquilino; quote fisse
(€/mese) e quote potenza (€/kW) si dividono a metà.**

#### Esempio (bolletta E.ON reale, coperta dai test)

Bolletta di settembre: 787,79 kWh, IVA 10%, totale da pagare 179,00 €. L'inquilino ha consumato 200 kWh:

| Voce | Importo | Criterio | Inquilino |
|---|---:|---|---:|
| Energia, quota consumi | 76,13 € | kWh | |
| Trasporto, quota variabile | 11,60 € | kWh | |
| Oneri di sistema, quota variabile | 26,11 € | kWh | |
| Accise | 17,88 € | kWh | |
| *Totale voci a consumo* | *131,72 €* | *200 / 787,79 kWh* | *33,44 €* |
| Quote fisse (energia 9,09 + trasporto 1,92) e quota potenza (11,86) | 22,87 € | 50/50 | 11,435 € |
| IVA 10% | 15,46 € | aliquota sull'imponibile | 4,49 € |
| Canone RAI (fuori campo IVA) | 9,00 € | 50/50 | 4,50 € |
| Arrotondamento (fuori campo IVA) | −0,05 € | 50/50 | −0,025 € |
| **Totale** | **179,00 €** | | **53,84 €** |

Al proprietario restano 179,00 − 53,84 = **125,16 €**.

Il parser legge gli importi dalla tabella **"Elementi di dettaglio"** della bolletta e li accetta solo se, sommati
all'IVA e al canone, tornano esattamente al totale da pagare; altrimenti ricade sulla lettura generica e li segna da verificare.

### Gas

```
quota inquilino = totale bolletta gas × 35%
```

La percentuale è modificabile in **Impostazioni** (predefinita: 35%).

### Totale mensile

```
dovuto dall'inquilino = quota luce (arrotondata) + quota gas (arrotondata)
```

Quando segni un mese come **pagato**, le regole di calcolo in vigore (ripartizione, IVA, percentuale gas) vengono salvate
insieme al pagamento: modifiche successive alle Impostazioni valgono solo per i mesi ancora da pagare.

Per ogni mese puoi segnare il pagamento (con data), copiare un messaggio pronto per WhatsApp/email con il dettaglio del
calcolo ed esportare il riepilogo in PDF.

---

## Sincronizzazione multi-dispositivo

1. **Avvio:** l'app mostra subito i dati dalla cache **IndexedDB**, poi scarica `data/db.json` da GitHub e memorizza lo **SHA** del file.
2. **Salvataggio:** ogni modifica viene applicata in locale, salvata in cache e inviata con `createOrUpdateFileContents`
   passando lo SHA noto. I salvataggi passano da una **coda**, quindi vengono inviati uno alla volta.
3. **Conflitto:** se nel frattempo un altro dispositivo ha modificato il file, GitHub risponde `409` (o `422`): l'app
   scarica l'ultima versione remota e ci **fonde sopra le modifiche locali** (fusione a tre vie con l'ultima versione
   remota nota, in `src/lib/storage/merge.ts`), poi riprova il salvataggio. Le modifiche a elementi diversi (letture,
   bollette, pagamenti, impostazioni) si uniscono senza perdite; se lo stesso elemento è stato modificato in modo diverso
   su entrambi i dispositivi prevale quello locale e un **toast** elenca gli elementi coinvolti.
4. **Offline:** le modifiche vengono salvate in IndexedDB e segnate come *da inviare*; al ritorno della connessione
   (evento `online`) l'app le invia con lo stesso controllo dello SHA.
5. **Aggiornamento:** quando l'app torna in primo piano (`visibilitychange`) scarica le modifiche fatte dagli altri dispositivi.

L'indicatore in alto mostra lo stato: **Sincronizzato** · **Sincronizzazione…** · **Offline** · **Errore**.
Un pallino ambra indica modifiche locali non ancora inviate. Cliccalo per forzare la sincronizzazione.

**Backup manuale:** in *Impostazioni* puoi esportare e importare l'intero database in JSON.

---

## Lettura dei PDF e nuovi fornitori

- Il testo viene estratto con **pdfjs-dist** direttamente nel browser (niente OCR: i PDF devono contenere testo, come
  quelli scaricati dall'area clienti del fornitore).
- `src/lib/parsers/patterns.ts` contiene regex generiche e tolleranti per il formato "Bolletta 2.0": periodo, totale,
  kWh/Smc, sezioni (materia energia, trasporto e contatore, oneri di sistema, accise, IVA, canone RAI, altre partite e
  conguagli) e righe di quota fissa, quota potenza e quota energia.
- Nel modulo, i valori estratti sono segnati come **"auto · da verificare"** e restano sempre modificabili. Se l'estrazione
  fallisce, il modulo manuale funziona comunque.

### Aggiungere un fornitore

Aggiungi un oggetto in `src/lib/parsers/providers/index.ts`:

```ts
{
  id: 'nuovofornitore',
  name: 'Nuovo Fornitore',
  detect: /nuovo\s+fornitore\s+s\.p\.a/i,
  patterns: {
    // Provati PRIMA di quelli generici. Il gruppo 1 deve catturare il valore.
    total: [/importo\s+addebitato[^\n]{0,40}?(-?\d{1,3}(?:\.\d{3})*,\d{2})/i],
    kwh: [/energia\s+prelevata[^\n]{0,40}?(\d+(?:,\d+)?)\s*kwh/i],
    sections: { altre: [/bonus\s+sociale/i] },
  },
}
```

Poi aggiungi un test in `parsers.test.ts` con un estratto di testo anonimizzato della bolletta.

---

## Sicurezza e privacy

- Nel repository pubblico c'è **solo codice**: nessun token, dato personale o bolletta (`.gitignore` esclude anche
  `data/`, `bills/`, `photos/` e i `*.pdf`).
- Il token è salvato **solo** nel `localStorage` del dispositivo e inviato esclusivamente a `api.github.com`.
- I PDF vengono letti **localmente** nel browser. Dati e file vengono inviati solo al tuo repository privato.
- Usa un token **fine-grained** limitato al solo repository dati, con **Contents: Read and write** e una **scadenza**.
- ⚠️ Tutti i siti GitHub Pages di uno stesso account condividono l'origine `https://<utente>.github.io` e quindi lo stesso
  `localStorage`. Non pubblicare sullo stesso account siti di terze parti di cui non ti fidi, oppure usa un dominio
  personalizzato dedicato. Visto che il token vale solo per `utenze-data`, l'eventuale esposizione resta limitata a quel repository.
- `index.html` include `noindex, nofollow` per evitare l'indicizzazione dell'app.

---

## Test

```bash
npm test
```

`src/lib/calc/electricity.test.ts` copre:

1. **caso standard**: 120 kWh su 300, IVA 10%, canone RAI → 61,51 €;
2. regola personalizzata con **trasporto al 50%** anche sulla quota a consumo;
3. **conguaglio a credito** di −20 € diviso al 50% → 50,51 €;
4. **conguaglio proporzionale ai kWh** (regola personalizzata) che entra nel costo unitario → 52,71 €;
5. **inquilino a consumo zero**: paga solo le quote fisse → 25,51 €;
6. **IVA proporzionale** all'imponibile;
7. regole **personalizzate ed escluse**;
8. avvisi per **kWh inquilino > kWh bolletta** e **totale incoerente**;
9. **kWh della bolletta mancanti**;
10. gas al **35%** e percentuale personalizzata;
11. letture: consumo, lettura inferiore alla precedente, consumo anomalo.

`src/lib/parsers/parsers.test.ts` verifica il parser su un estratto realistico di bolletta luce e gas.

---

## Risoluzione problemi

| Problema | Soluzione |
|---|---|
| "Repository non trovato" | Controlla owner e nome; nel token, in *Repository access*, deve essere selezionato il repository dati. |
| "Token non valido o scaduto" | Genera un nuovo token e ricollegati da *Impostazioni → Disconnetti*. |
| Conflitto di sincronizzazione | Un altro dispositivo ha salvato nel frattempo: l'app ha unito i dati; controlla gli elementi elencati nell'avviso. |
| Il PDF non viene letto | Probabilmente è una scansione (immagine): inserisci i dati manualmente. |
| Pagina bianca su Pages | Verifica che *Settings → Pages → Source* sia **GitHub Actions** e che il workflow sia terminato. |
