# Närmast Vinner — Analys & Förbättringsplan

Skriven inför På Spåret-premiären. Baserad på kodgenomgång **och** på faktisk
produktionsdata från Supabase (518 spel, 923 spelare, 5 035 gissningar, 102 events).

---

## Status

**Batch 1 (kritiska fixar) är implementerad** på grenen
`fix/critical-server-authority`. Se §9 för vad som återstår.

Åtgärdat: §2.1, §2.2, §2.3, §2.4, §2.5, §2.6, §2.7, §3.2, §4.2, §4.3 (delvis),
§4.4, §4.6, §5.2, §5.3, §8.

Kvarstår som viktigast: **§3.1 (rotera nyckeln — kräver dig)**, §6.1 solo-läge,
§6.2 avslöjandet, §6.3 poängkurvan, §5.1 bildoptimering, §7 innehåll.

---

## 0. TL;DR — de fem viktigaste sakerna

| # | Problem | Bevis | Åtgärd |
|---|---|---|---|
| 1 | **65 % av alla spel spelas ensam** — men spelet är byggt som ett värd-styrt partyspel | 275 av 426 spel hade exakt 1 spelare | Bygg ett riktigt **solo-läge** |
| 2 | **42 % av startade spel dör inom 2 rundor** | 122 spel slutade efter runda 1, 73 efter runda 2 | Fixa tempot (se #3) + auto-advance |
| 3 | **Varje runda tar alltid full tid + 5 s** — det går inte att svara klart | Ingen submit-knapp finns i `MapComponent` | Lägg till "Klar"-knapp + tidig rundavslut |
| 4 | **Poängbuggen i `closest_wins`** delar ut 1–N poäng istället för 1 | `Results.tsx:65-93` körs på *varje* klient | Flytta poängsättning till servern |
| 5 | **Supabase pausas vid inaktivitet** | Free tier pausar efter 7 dagars inaktivitet | Cron-ping var 3:e dag (10 rader) |

---

## 1. Vad produktionsdatan säger

Detta är den viktigaste delen av dokumentet. Koden kan vara hur fin som helst —
datan visar var spelarna faktiskt tappar intresset.

### 1.1 Spelarantal per spel

```
1 spelare   275 spel   ◄── 65 %
2 spelare    47
3 spelare    27
4 spelare    23
5 spelare    29
6-26         25
```

**Slutsats:** Spelet marknadsförs och är designat som "utmana dina vänner", men
två tredjedelar spelar ensamma. En ensam spelare måste idag:

1. Klicka "Skapa nytt spel"
2. Välja spelläge, spellängd, gissningstid
3. Skriva sitt namn
4. Landa i en lobby som säger *"Dela spelkoden med dina vänner"*
5. Klicka "Starta"
6. Klicka "Börja gissa"
7. Vänta ut hela klockan + 5 sekunder
8. Klicka "Nästa runda"

Åtta steg innan första bilden, och en lobby som aktivt påminner dem om att de är
ensamma. Detta är sannolikt den enskilt största orsaken till bortfallet.

### 1.2 Trattanalys

```
518 spel skapade
 -57 startades aldrig            (11 % föll bort i lobbyn)
 461 startade
 -122 dog efter runda 1          (26 %)
 -73  dog efter runda 2          (16 %)
 ...
 median: 3 rundor
```

Dessutom: **181 spel (35 %) står kvar i status `playing` för alltid.** De blev
aldrig `finished`. Det är spel som övergavs mitt i — helt i linje med att värden
kan stänga fliken och då kan ingen föra spelet vidare (se §3.2).

### 1.3 Valda inställningar

```
Spelläge:      highscore 420  |  closest_wins 98
Gissningstid:  15s 367  |  30s 77  |  20s 74
Spellängd:     maraton/obegränsat 260  |  10 rundor 192  |  5 rundor 42  |  20 rundor 24
```

**Maraton är det vanligaste valet (50 %)** — men maraton har ingen naturlig
avslutning alls, den tar bara slut när alla 102 events är förbrukade. Kombinerat
med medianen på 3 rundor betyder det: folk väljer "obegränsat" och slutar sedan
när de tröttnar, utan segerskärm, utan slutpoäng, utan anledning att spela igen.

### 1.4 Svårighetsgrad

```
Median-avstånd:   315 km
Medel-avstånd:  1 814 km
Gissningar > 1000 km (= 0 poäng i highscore):  32 %
Gissningar < 100 km:                            32 %
```

**Nästan en tredjedel av alla gissningar ger noll poäng.** Den linjära formeln
`max(0, 1000 - km)` skapar en hård klippkant: 999 km ger 1 poäng, 1001 km ger 0.
Spelaren får ingen som helst återkoppling på om hen var 1 100 km eller 11 000 km
fel. Det känns som att misslyckas, inte som att vara nära.

### 1.5 Innehållet

```
102 events totalt
Europa        55  ◄── 54 %
Nordamerika   22
Asien          8
Afrika         7
Sydamerika     4
Oceanien       3
Övrigt         3

Årtal: samtliga mellan 1968 och 2026
```

Två problem:

- **Geografisk slagsida.** Med 54 % Europa är "gissa någonstans i Centraleuropa"
  en statistiskt stark strategi. Det urholkar spelet för återkommande spelare.
- **102 events räcker inte.** Med 518 spelade spel har varje event visats ~5
  gånger i snitt. En grupp som spelar två kvällar i rad ser repriser. Inför
  premiären behövs betydligt fler — sikta på 400–500.
- `year`-kolumnen är obligatorisk, ifylld på alla 102 events, och **visas aldrig
  någonstans i gränssnittet**. Ren död data som skulle kunna bära en hel
  spelmekanik.

---

## 2. Kritiska buggar

### 2.1 `closest_wins` delar ut för många poäng — `components/Results.tsx:65-93`

`Results` renderas på **varje spelares enhet**. Varje instans kör
`awardPointsToClosest()`, som gör en läs-modifiera-skriv:

```ts
const { data: player } = await supabase.from('players').select('score')...
await supabase.from('players').update({ score: player.score + 1 })...
```

Med 5 spelare körs detta 5 gånger parallellt. Vinnaren får någonstans mellan
**+1 och +5 poäng**, beroende på race conditions. `scoringDone` skyddar bara
inom en enda komponentinstans — inte mellan klienter. Och eftersom `guesses`
finns i dependency-arrayen kan effekten dessutom köra två gånger på *samma*
klient om arrayen uppdateras under `await`-anropet.

Det här gör `closest_wins`-läget i praktiken trasigt. Att bara 98 av 518 spel
använder läget är antagligen delvis en konsekvens av det.

**Fix:** Flytta all poängsättning till en Postgres-funktion som körs en gång
per runda (se §4.1).

### 2.2 Det går inte att svara klart — `components/MapComponent.tsx:135-139`

```ts
useEffect(() => {
  if (disabled && hasPlacedPin && !submitting && guessLat && guessLon) {
    submitGuess()
  }
}, [disabled, hasPlacedPin, guessLat, guessLon, submitting])
```

`disabled` blir sant bara när `timeLeft === 0`. Det finns **ingen submit-knapp**
i gränssnittet. Konsekvenser:

- Varje runda tar alltid exakt `guess_time + 5 s`, oavsett hur snabbt alla svarar.
- Logiken i `page.tsx:246-256` som ska visa resultat tidigt när alla gissat är
  **död kod** — alla gissningar landar samtidigt på t=0.
- Alla klienter skriver till `guesses` i exakt samma sekund → onödig topplast
  och realtidsstorm. 5-sekundersbufferten på `page.tsx:220-228` finns bara för
  att dölja detta.
- Det tar bort hela spänningsmomentet. I På Spåret är poängen att svara *tidigt*.

**Fix:** Lägg till en tydlig "Klar!"-knapp. Avsluta rundan direkt när alla
lämnat in. Ta bort 5-sekundersbufferten när servern styr rundavslut.

### 2.3 Klockskev ger orättvis speltid — `app/game/[code]/page.tsx:213-216`

```ts
const startTime = new Date(game.phase_started_at!).getTime()
const now = Date.now()
```

`Date.now()` är klientens lokala klocka. En spelare vars telefon går 20 sekunder
fel får 20 sekunder mer eller mindre speltid än alla andra. Ingen synkronisering
mot servertid sker.

**Fix:** Mät offset en gång vid anslutning (`select now()` mot Supabase, jämför
med lokal tid) och kompensera. Alternativt låt servern stänga rundan.

### 2.4 Ingen unik constraint på gissningar

`guesses` saknar `UNIQUE (game_id, player_id, round)`. Vid dubbelinlämning
(reconnect, remount, snabb dubbelklick) kan samma spelare få poäng två gånger i
highscore-läget.

```sql
CREATE UNIQUE INDEX guesses_one_per_round
  ON guesses (game_id, player_id, round);
```

### 2.5 Realtidskanalen rivs och byggs om vid varje uppdatering — `page.tsx:141`

```ts
}, [game])   // ◄── hela game-objektet
```

`game` byts ut vid varje realtidsuppdatering, så prenumerationen avslutas och
återupprättas vid **varje fasbyte, varje rundbyte, varje speluppdatering**. Under
omprenumerationen kan meddelanden tappas — vilket ger den klassiska buggen
"vissa spelare hänger sig i fel fas".

Samma problem på rad 199 (`loadPlayers` vid varje `game`-ändring) och rad 259.

**Fix:** `}, [game?.id])`.

### 2.6 Tom `used_event_ids` ger ogiltig SQL — `components/GameControls.tsx:142-145`

```ts
.not('id', 'in', `(${usedEventIds.join(',')})`)
```

Om arrayen är tom blir det `in ()` — syntaxfel. Idag räddas det av att `startGame`
alltid initierar arrayen, men det är skört. Dessutom växer query-strängen med en
UUID per runda; ett maratonspel på 100 rundor skickar 3 600 tecken UUID i
URL:en och riskerar att slå i URL-längdsgränsen.

### 2.7 Spelare som lämnar blockerar rundan — `page.tsx:253`

```ts
if (roundGuesses.length === players.length && players.length > 0)
```

`players` innehåller alla som någonsin gått med. Ingen närvarohantering finns.
Om en spelare stänger fliken blir villkoret aldrig sant och varje runda måste
alltid vänta ut hela klockan.

---

## 3. Säkerhet

### 3.1 Service-role-nyckel i git-historiken ⚠️

Commit `8e85e58` ("Add auto script") innehåller en hårdkodad
`service_role`-JWT i `scripts/import-wikipedia-event.ts`. Nyckeln går ut 2080 och
kringgår all RLS — full läs- och skrivåtkomst till databasen.

**Bra nyheter:** commiten ligger bara på den lokala grenen `do-not-push` och har
inte pushats. Repot är dock **publikt** på GitHub, så ett enda `git push --all`
läcker nyckeln permanent.

**Åtgärd, i denna ordning:**

1. Rotera nyckeln i Supabase (Settings → API → Reset service role key). Gör detta
   oavsett — den finns i klartext på disk och i reflog.
2. Ta bort grenen `do-not-push` helt, eller kör `git filter-repo` på den.
3. Lägg till `.env*` i `.gitignore` (redan gjort) och aktivera GitHub
   secret scanning + push protection på repot.

### 3.2 RLS är avstängd i praktiken — `supabase/schema.sql:68-112`

Samtliga policies är `USING (true)` utan `WITH CHECK`. Med enbart den publika
anon-nyckeln kan vem som helst:

- **Sätta sin egen poäng till valfritt tal** (`update players set score = 999999`)
- **Ändra vilket spel som helst** — avsluta andras spel, byta fas, byta event
- **Skriva in egna events** i den globala poolen som alla spel drar från
- **Radera eller ändra andras gissningar**

Inför en trafikökning när programmet återvänder är särskilt "vem som helst kan
skriva till `events`" en reell vandaliseringsrisk — en enda person kan förstöra
eventpoolen för alla.

### 3.3 Svaret ligger i klienten under gissningsfasen

`page.tsx` hämtar hela event-raden med `select('*')` — inklusive `latitude`,
`longitude` och `description` — och skickar den till `EventDisplay` **innan**
gissningen är gjord. Svaret syns i nätverkstrafiken och i React-state.

Dessutom beräknas `distance_km` i webbläsaren (`MapComponent.tsx:168`) och
skickas till servern. Den kan alltså förfalskas till `0`.

**Fix:** Låt klienten under gissningsfasen bara få `id, title, image_url`. Beräkna
avståndet i Postgres med en trigger (PostGIS `ST_Distance` finns tillgängligt i
Supabase, eller en enkel Haversine i plpgsql).

Detta spelar mindre roll i ett vardagsrum, men gör spelet oanvändbart för allt
som liknar en tävling eller topplista.

---

## 4. Robusthet & arkitektur

### 4.1 Flytta speltillståndet till servern (den stora)

Idag ligger *all* spellogik i webbläsaren: fasbyten, val av event, poängsättning,
rundavslut. Det ger fyra separata problem som alla har samma lösning.

Rekommendation: **tre Postgres-funktioner** anropade via `supabase.rpc()`.

```sql
-- Väljer nästa event, sätter fas och nollställer klockan. Idempotent.
create function advance_round(p_game_id uuid, p_player_id uuid) returns void ...

-- Beräknar avstånd server-side, hindrar dubbletter, hindrar för sena svar.
create function submit_guess(p_game_id uuid, p_player_id uuid, p_lat float, p_lon float) returns void ...

-- Delar ut poäng EN gång per runda. Skyddad av unik constraint på (game_id, round).
create function close_round(p_game_id uuid) returns void ...
```

Det löser i ett svep: §2.1 (dubbla poäng), §2.2 (tempo), §2.4 (dubbletter),
§3.2 (fusk), §3.3 (svaret läcker) och §2.6 (N+1-frågan).

Behåll klienten som ren vy. Det är också en förutsättning för allt i §6.

### 4.2 Värd-migrering — orsaken till de 181 döda spelen

`host_id` finns bara i värdens `sessionStorage`/`localStorage`. Om värden stänger
webbläsaren kan **ingen** föra spelet vidare. Spelet fastnar i `playing` för alltid.

**Fix, i stigande ambition:**

1. **Enklast:** om ingen `phase`-uppdatering skett på 90 sekunder, visa
   "Nästa runda"-knappen för alla. Kostar ~10 rader.
2. **Bättre:** Supabase Presence — om värden varit borta i 30 s, överlåt
   automatiskt värdskapet till spelaren som anslöt först.
3. **Bäst:** ta bort behovet av en värd helt i solo-läget (§6.1) och auto-advance
   i flerspelarläget (§6.4).

### 4.3 Städa gamla spel

Inget rensas någonsin. 518 spel, 923 spelare och 5 035 gissningar ligger kvar. Det
växer obegränsat och äter av free tier-utrymmet.

```sql
-- Kör som pg_cron-jobb en gång per dygn
delete from games where created_at < now() - interval '30 days';
-- players/guesses försvinner via ON DELETE CASCADE
```

Överväg att först aggregera till en statistik-tabell (§7.3) innan raderingen.

### 4.4 `revealing`-fasen finns men används aldrig

Schemat har `phase = 'revealing'` men inget sätter den. Resultatvisningen är helt
klientlokal (`showResults` i React-state), vilket gör att olika spelare kan se
olika saker samtidigt. Använd fasen på riktigt — då blir avslöjandet synkat för
alla, vilket är en förutsättning för animationen i §6.2.

### 4.5 Saknad lint-konfiguration

`npm run lint` finns i `package.json` men det finns ingen `.eslintrc`. Kommandot
gör alltså ingenting användbart. Lägg till `eslint-config-next` och kör den i
CI — det hade fångat flera av useEffect-buggarna ovan.

### 4.6 Saknade databasconstraints

```sql
alter table events add constraint events_lat_valid check (latitude between -90 and 90);
alter table events add constraint events_lon_valid check (longitude between -180 and 180);
alter table events add constraint events_img_https check (image_url like 'https://%');
```

Idag kan importskriptet skriva in trasiga koordinater utan att någon märker det
förrän mitt i ett spel.

---

## 5. Prestanda

### 5.1 Bilderna är det största problemet

`EventDisplay.tsx:75` använder en vanlig `<img>` med Wikipedias **originalbild**.
Flera av dem är 3–8 MB. De laddas i samma ögonblick som rundan börjar, på mobil,
med klockan tickande.

Samtidigt är `images.remotePatterns` och `minimumCacheTTL` i `next.config.js`
**helt verkningslösa** — de gäller bara `next/image`, som inte används någonstans
i projektet.

**Fix (störst effekt av allt i detta dokument):**

1. Byt till `next/image` — då börjar `remotePatterns` faktiskt fungera och
   bilderna serveras som WebP/AVIF i rätt storlek.
2. Eller ännu bättre: kopiera bilderna till **Supabase Storage** vid import,
   nedskalade till max 1600 px bredd. Då slipper du också Wikimedias
   rate limiting (som redan orsakat commit `fb511ac` och `986ac6f`).
3. **Förladda nästa runda:** hämta nästa events bild i bakgrunden under
   resultatvisningen. Rundstarten blir då momentan.

### 5.2 `pickReachableEvent` är långsam och skalar dåligt — `GameControls.tsx:31-54`

Vid varje rundstart, från värdens webbläsare:

1. Hämta **alla** event-ID:n (`select('id')`, ingen limit — Supabase returnerar
   max 1 000 rader, så vid >1 000 events blir urvalet tyst felaktigt)
2. Blanda i JavaScript
3. För varje kandidat: en `select` **plus** en HEAD-request mot bildens URL,
   sekventiellt

Det är ett N+1-anrop plus nätverksrundturer mot ett tredjepartsdomän innan varje
runda kan börja. Det förklarar sannolikt en del av fördröjningen som får spelare
att tro att spelet hängt sig.

**Fix:** Validera bild-URL:er **en gång vid import** (och i ett nattligt
cron-jobb), spara resultatet i en `image_ok boolean`-kolumn. Låt sedan
`advance_round()` välja med `order by random() limit 1 where image_ok`.

### 5.3 Leaflet-ikoner hämtas från raw.githubusercontent.com — `lib/colors.ts:57`

```ts
iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`
```

`raw.githubusercontent.com` är inget CDN, det är rate limitat och får inte
användas som hotlink-källa. Om det börjar strypa förlorar alla spelare sina
kartnålar. Samma sak med cdnjs-beroendet för skuggan.

**Fix:** lägg de 9 PNG-filerna i `public/markers/`. Tar två minuter.

### 5.4 Överflödiga databasanrop

Kombinationen av §2.5 och effekten på rad 241-259 gör att varje fasbyte utlöser
flera onödiga rundturer per spelare. Med 26 spelare i ett spel (vilket har hänt)
blir det snabbt hundratals anrop per runda. Det äter av free tier-kvoten helt i
onödan.

---

## 6. Speldesign — göra det roligare

Alla förslag nedan **behåller kärnmekaniken**: se en bild, sätt en nål, närmast vinner.

### 6.1 Solo-läge ⭐ Högst prioritet

65 % spelar ensamma. Ge dem ett läge som är byggt för det:

- Knapp på startsidan: **"Spela själv"** — direkt in i spelet, inget namn, ingen
  kod, ingen lobby, ingen värdknapp.
- 5 rundor, automatiskt tempo, ingen väntan på någon annan.
- Slutskärm med totalpoäng och **"Dela ditt resultat"** — en emoji-rad i
  Wordle-stil som går att klistra in i en gruppchatt:

  ```
  Närmast Vinner #142
  🟩🟩🟨⬜🟩  4 210 p
  narmastvinner.se
  ```

  Det är den billigaste tillväxtmekanismen som finns, och den passar perfekt när
  programmet återvänder och folk pratar om det på jobbet.

### 6.2 Avslöjandet — störst effekt per rad kod ⭐

Idag poppar resultatkartan bara upp med alla nålar redan utsatta. All spänning
försvinner. Gör det till ett *moment*, precis som i programmet:

1. Kartan startar utzoomad och visar bara spelarnas nålar.
2. Kameran flyger till rätt plats (`map.flyTo()`, ~1,5 s).
3. Röd svarsnål landar med en liten studs.
4. Linjerna ritas ut **en i taget, längst bort först**, med spelarnamn och
   avstånd. Vinnaren avslöjas sist.
5. Poängen tickar upp i topplistan.

Ren frontend, ingen mekanikförändring, enormt mycket mer dramatik.

### 6.3 Fixa poängkurvan

32 % av alla gissningar ger noll poäng med dagens `max(0, 1000 - km)`. Byt till
en exponentiell kurva så att *alla* gissningar ger meningsfull återkoppling:

```ts
// 0 km = 1000 p, 300 km ≈ 740 p, 1000 km ≈ 370 p, 5000 km ≈ 7 p
const points = Math.round(1000 * Math.exp(-distanceKm / 1000))
```

Samma rangordning, samma känsla av "närmare är bättre", men ingen klippkant och
ingen spelare som ser "0 poäng" en tredjedel av tiden.

### 6.4 Tempo

- **"Klar!"-knapp** (§2.2) — låt folk lämna in tidigt.
- **Avsluta rundan när alla lämnat in.** Med i snitt 1,8 spelare kan en runda gå
  på 6 sekunder istället för 20.
- **Auto-advance** efter resultatvisningen med en 8-sekunders nedräkning, som
  värden kan hoppa över. Tar bort två klick per runda och räddar de 181 spel som
  fastnar när värden tappar intresset.
- **"Alla har svarat"-indikator** under gissningsfasen — visa prickar som tänds
  när varje spelare lämnat in. Skapar press, precis som i studion.

### 6.5 Tidsbonus (valfritt läge, inte som standard)

Det som gör På Spåret spännande är att svara *tidigt* är värt mer. Lägg till som
ett **tredje spelläge** så att befintliga lägen är orörda:

> **Snabbast vinner** — poängen börjar på 10 och sjunker till 4 under rundan,
> precis som i programmet. Multipliceras med hur nära du gissar.

Detta kräver §2.2 (submit-knapp) för att fungera överhuvudtaget.

### 6.6 Kategorier och teman

`events` behöver en `category`- och `difficulty`-kolumn. Då kan värden välja:

- **Sverige** — bara svenska platser
- **Naturkatastrofer**
- **Musik & film**
- **Blandat** (nuvarande beteende)
- **Svår** — bara platser utanför Europa

Det löser också Europa-slagsidan (§1.5) genom att göra den till ett medvetet val
istället för en dold statistisk snedvridning.

### 6.7 Använd `year`-kolumnen

Alla 102 events har ett årtal som aldrig visas. Två gratis idéer:

- Visa årtalet **efter** avslöjandet, som en liten "visste du att"-detalj.
- Ett bonusläge: gissa året också, ±5 år ger extrapoäng. Kartmekaniken orörd.

### 6.8 Ledtrådar

Ett ledtrådssystem passar källmaterialet perfekt och kostar lite att bygga:
efter 5 sekunder kan spelaren trycka **"Ledtråd"** och få första meningen ur
`description` — mot 25 % poängavdrag. Skapar ett verkligt beslut varje runda.

### 6.9 Mindre men billiga vinster

- **QR-kod och delbar länk i lobbyn.** `/join?code=XXX` stöds redan i koden men
  visas aldrig som länk. Att läsa upp sex tecken högt är onödig friktion.
- **Otvetydigt spelkodsalfabet.** `lib/utils.ts:36` innehåller `0/O` och `1/I`
  som blandas ihop när koden läses upp. Ta bort dem.
- **Låt folk gå med i pågående spel.** `join/page.tsx:48-52` blockerar all
  anslutning efter start. I ett vardagsrum kommer folk in efterhand — låt dem
  gå med med 0 poäng.
- **Ljud.** Tickande klocka sista 5 sekunderna, en ton när svaret avslöjas, en
  fanfar för vinnaren. Enormt mycket stämning för väldigt lite kod.
- **Poänganimation** — låt siffrorna räkna upp istället för att bara byta värde.
- **Ta bort `userScalable: false`** (`app/layout.tsx:66-67`). Det bryter mot
  WCAG 1.4.4 och ignoreras ändå av modern iOS Safari.
- **Sätt `width`/`height` på bilderna** för att undvika layouthopp.
- **PWA-manifest** så att spelet kan läggas på hemskärmen.

---

## 7. Innehåll — lägga till nya platser enkelt

Detta var ett uttalat önskemål, och det är i sämre skick än det ser ut.

### 7.1 Importverktyget saknas i repot

`AGENTS.md` dokumenterar `npm run import-wiki` och
`scripts/import-wikipedia-event.ts`. **Ingetdera finns.** Skriptet togs bort ur
arbetsträdet och `package.json` saknar kommandot. Det ligger kvar i commit
`8e85e58` på grenen `do-not-push` — tillsammans med service-role-nyckeln (§3.1).

Skriptet i sig är bra byggt (hämtar titel, beskrivning, bild och koordinater från
Wikipedias REST- + MediaWiki-API). **Åtgärd:** återinför det, men läs nyckeln
från `process.env` istället för hårdkodning, och lägg tillbaka npm-scriptet.

### 7.2 Gör importen till en admin-sida istället för ett CLI

Med målet 400–500 events är ett interaktivt terminalskript fel verktyg. En enkel
lösenordsskyddad `/admin`-sida skulle göra innehållsarbetet dramatiskt snabbare:

- Klistra in en Wikipedia-URL → förhandsvisning med bild och karta
- **Justera nålen manuellt** — Wikipedias koordinater pekar ofta på fel sak
  (t.ex. en artikel om ett företag pekar på huvudkontoret, inte händelsen)
- Sätt kategori, svårighetsgrad och årtal
- Massimport: klistra in 20 URL:er på en gång
- Se statistik per event (§7.3) och kunna dölja dåliga events

Detta går att göra på en kväll och betalar sig direkt när du ska tredubbla
innehållet inför premiären.

### 7.3 Du sitter redan på svårighetsdata

5 035 gissningar finns lagrade. Det räcker för att räkna ut exakt hur svårt varje
event är — utan att bygga något nytt:

```sql
create view event_stats as
select e.id, e.title,
       count(g.id)                as times_played,
       round(avg(g.distance_km))  as avg_distance_km,
       round(percentile_cont(0.5)
         within group (order by g.distance_km)) as median_km
from events e
left join guesses g on g.event_id = e.id
group by e.id, e.title
order by avg_distance_km desc;
```

Använd den till att:

- Sätta `difficulty` automatiskt istället för att gissa
- Hitta trasiga events (extremt högt medelavstånd = koordinaten är nog fel)
- Blanda lätta och svåra events medvetet inom ett spel

### 7.4 Skydda eventpoolen

Byt ut policyn `"Anyone can insert events"` (§3.2). Import ska ske med
service-role-nyckeln från admin-sidan, inte från anon-nyckeln.

---

## 8. Hålla Supabase igång

Free tier pausar projektet efter 7 dagars **inaktivitet**. Med vikande
spelarantal är det ett reellt hot — och ett pausat projekt precis när programmet
har premiär vore illa.

### Lösning: ett cron-jobb (10 minuters arbete)

`.github/workflows/keepalive.yml`:

```yaml
name: Supabase keepalive
on:
  schedule:
    - cron: '0 6 */3 * *'   # var tredje dag
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sf "$SUPABASE_URL/rest/v1/events?select=id&limit=1" \
            -H "apikey: $SUPABASE_ANON_KEY" > /dev/null
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

Notera att GitHub inaktiverar schemalagda workflows i repon utan aktivitet på
60 dagar — lägg därför gärna in `workflow_dispatch` (ovan) och kör den manuellt
ibland, eller använd Vercel Cron istället eftersom du redan hostar där.

**Överväg också Pro-planen (25 USD/mån) inför premiären.** Utöver att pausningen
försvinner får du daglig backup i 7 dagar. Om spelet får en trafiktopp när
programmet startar vill du inte att free tier-gränserna blir det som avgör
upplevelsen — särskilt inte med de överflödiga anropen i §5.4 kvar.

---

## 9. Föreslagen ordning

### Steg 1 — Innan något annat (någon timme)

- [ ] **Rotera service-role-nyckeln, ta bort grenen `do-not-push` (§3.1)** ← kräver dig
- [x] Lägg in keepalive-cron (§8)
- [x] Flytta Leaflet-ikonerna till `public/` (§5.3)
- [x] Byt `[game]` → `[game?.id]` i realtidsprenumerationen (§2.5)

### Steg 2 — Fixa det trasiga (1–2 helger)

- [x] Ta bort anons skrivrättigheter (§3.2) — RLS räckte inte, se not nedan
- [x] Flytta poängsättning och rundhantering till Postgres-funktioner (§4.1) —
      löste §2.1, §2.3, §2.4, §2.6, §2.7, §3.3 (delvis), §5.2
- [x] Unik constraint på `guesses` (§2.4)
- [x] Värd-migrering (§4.2) — 90 s stall-regel, vem som helst får ta över
- [ ] Städjobb för gamla spel (§4.3) — SQL finns, men inget schemalagt jobb ännu

> **Not till §3.2:** planen var "skriv RLS-policies som faktiskt begränsar
> något". Det visade sig vara omöjligt: utan auth är `auth.uid()` alltid `NULL`,
> så en policy kan bara bli `true` eller `false`. Lösningen blev att återkalla
> skrivrättigheterna helt och tvinga allt genom `SECURITY DEFINER`-funktioner.

### Steg 3 — Fixa tempot och tratten (1–2 helger)

- [x] "Klar!"-knapp + avsluta rundan när alla svarat (§2.2, §6.4)
- [ ] **Solo-läge** (§6.1) ⭐ — störst kvarvarande effekt
- [ ] Exponentiell poängkurva (§6.3)
- [ ] Bildoptimering + förladdning (§5.1)
- [ ] Auto-advance efter resultatvisning (§6.4)

### Steg 4 — Gör det roligt inför premiären (2–3 helger)

- [ ] Animerat avslöjande (§6.2) ⭐
- [ ] Ljud (§6.9)
- [ ] Delbart resultat i Wordle-stil (§6.1)
- [ ] QR-kod i lobbyn (§6.9)
- [ ] Kategorier och teman (§6.6)

### Steg 5 — Innehåll (löpande, starta nu)

- [ ] Återinför importverktyget utan hårdkodad nyckel (§7.1)
- [ ] Bygg admin-sidan (§7.2)
- [ ] Väg upp innehållet: mindre Europa, fler events. Mål 400–500 (§1.5)
- [ ] `event_stats`-vyn och automatisk svårighetsgrad (§7.3)

---

## 10. Sammanfattning

Koden är i grunden välstrukturerad — realtidsflödet är rent, typerna kommer från
ett ställe, och SSR-hanteringen av Leaflet är korrekt gjord. Problemen ligger
någon annanstans:

1. **Spelet är byggt för fel spelare.** Två tredjedelar spelar ensamma i ett
   värd-styrt partyspel. Ett solo-läge är den enskilt största förbättringen.
2. **Tempot är trasigt.** Att inte kunna svara klart gör varje runda lika lång
   oavsett vad som händer, och tar bort all spänning.
3. **Logiken ligger i webbläsaren.** Det ger poängbuggar, fastnade spel,
   fuskmöjligheter och onödig last. En handfull Postgres-funktioner löser allt
   på en gång.
4. **Innehållet är för tunt och för europeiskt.** 102 events med 54 % Europa
   räcker inte för en publik som återkommer.

Fixa 1 och 2 före premiären och du kommer märka skillnaden i statistiken direkt.
