# Sanity-pilot

En separat testsajt med startsida, blogg, kategorifilter och artikelsidor. Designen
ligger i Next.js och Tailwind. Innehållet kan hämtas direkt från Sanity. Inget
kopieras till Weblabs eget CMS och sajten skriver aldrig tillbaka till Sanity.

**Status 2026-10-01:** en fristående kopia är ansluten till ett nytt Sanity-
testprojekt. Den riktiga innehållshämtningen läser en startsida och två artiklar.
En publicerad rubrikändring hämtades och återställdes utan kodändring.
Visuell redigering i Weblab, Studio-redigering och extern publicering är ännu
inte verifierade. Detta är ett testunderlag, inte en lanserad Sanity-integration.

Källkods- och sidkontrollerna gick igenom: 18 fokuserade testfall med exempelsvar.
En separat kontroll med den riktiga innehållshämtningen gick igenom före ändring,
efter ändring och efter återställning. Fokuserad lint, fristående typkontroll och
produktionsbygge gick också igenom. Inga skarpa kundprojekt ändrades.

## Den här körningens testprojekt

- [Sanity-testprojektet](https://www.sanity.io/organizations/obLPpyCRw/project/k73ltzd4/datasets):
  projekt-ID `k73ltzd4`, offentligt dataset `production`. Namnet är standardnamnet
  i det nya testprojektet, inte ett dataset i ett kundprojekt.
- Sanity visar en kostnadsfri Growth-provperiod som automatiskt går över till
  Free. Ingen betaluppgradering gjordes.
- Kopian finns i `/Users/ludvighedin/Programming/personal/AB/coder-new/sanity-pilot`.
  Dess ignorerade `.env.local` använder Sanity-läge och behöver ingen läsnyckel.
  Den tillfälliga skrivnyckeln för att lägga in testinnehållet är raderad.
- Det godkända maskinundantaget gäller endast den exakta kopian: installation,
  typkontroll, bygge och en lokal produktionsförhandsvisning. Det behåller
  minnesgränser, registrering och köregler. Det startar inte en utvecklingsserver.
- Weblabs egen kopia, installation och utvecklingsserver omfattas inte av
  undantaget. Desktop-testet kräver en separat, skyddad startväg.

Från den fristående kopians mapp kan nästa agent använda:

```sh
agent-heavy-run sanity-pilot install
agent-heavy-run sanity-pilot typecheck
agent-heavy-run sanity-pilot build
```

En lokal förhandsvisning på port 3007 startas med `agent-heavy-run sanity-pilot start`.
Ta en browser-lease först, respektera två-servergränsen och stoppa bara den egna
servern efter kontrollen. Det visuella testet har ännu inte körts eftersom två
andra registrerade servrar använde platserna. Sanity Studio ingår inte i kopian.

## Generell uppsättning i en annan godkänd miljö

På den här Macen gäller enbart de skyddade kommandona ovan. De generella
kommandona nedan ger inte tillstånd att kringgå skyddet eller starta Weblabs
egen utvecklingsserver.

Den här mappen är en mall utanför Weblabs Bun-workspaces. För att öppna den i
desktopappen behöver den först kopieras till en **egen Git-repomapp** utanför
Weblab-repot. Desktopappen kan inte öppna en undermapp som ett eget repo.

I den fristående kopian: installera med Bun, så att kopian får en egen `bun.lock`,
och skapa en första commit. Ändra inte Weblab-repots dependencies eller lockfil.
Sajten behöver Node 20.9 eller senare.

```sh
bun install
git init
git add src sanity test package.json tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs .gitignore .env.example README.md bun.lock
git commit -m "Add Sanity pilot site"
bun dev
```

Välj sedan den fristående mappen i Weblab. Låt appen granska förberedelsen och
starta sin privata kopia. Öppna `/`, `/blog` och en artikel. Gemensamma
bloggrubriker kommer från samma mall, så en stiländring gäller flera inlägg.

## Ansluta ett nytt Sanity-testprojekt

1. Återanvänd projektet ovan för den här körningen. Skapa ett nytt, separat
   testprojekt endast för en annan framtida pilot. Använd inte kundens skarpa
   innehåll för den första piloten.
2. Lägg typerna från [sanity/schema.mjs](sanity/schema.mjs) i testprojektets
   Sanity Studio. Skapa och publicera en startsida och minst två blogginlägg.
   Slugs använder små bokstäver, siffror och bindestreck. Fyll i rubrik,
   inledning/ingress, kategori och publiceringsdatum. Om du lägger till en bild,
   fyll även i bildbeskrivningen.
3. Kopiera `.env.example` till `.env.local` i den fristående sajten. Ange
   `SANITY_CONTENT_MODE=sanity`, `SANITY_PROJECT_ID` och `SANITY_DATASET`.
   För ett privat dataset behövs också en token med enbart läsrätt i
   `SANITY_READ_TOKEN`. Lägg aldrig token i chatten, Git eller `NEXT_PUBLIC_*`.
4. Öppna mappen på nytt i Weblab om den privata kopian skapades innan
   inställningarna lades till.

Exempelläget visar alltid “Sanity är inte anslutet”. Sanity-läget visar ett fel
om anslutningen eller innehållet inte fungerar. Det byter aldrig till
exempelinnehåll i bakgrunden. Servern hämtar bara publicerat innehåll direkt
från Sanity vid varje besök. Uppdatera sidan för att se en publicerad ändring.
Det finns inga realtidsuppdateringar, utkastförhandsvisning eller Studio-panel
inbyggda i piloten.

Piloten visar de 50 senaste artiklarna. Brödtext stöder stycken, underrubriker,
fetstil och kursiv. Länkar, listor och andra blocktyper ingår inte. Detta är
avsiktligt litet; en kunds befintliga innehållsmodell behöver en egen anpassning.

## Vad testet ska bevisa

- Ändra rubrikens storlek, färg och avstånd i Weblab. Ladda om och kontrollera
  att innehållet finns kvar på telefon och desktop.
- Filtrera bloggen och öppna ett inlägg. Kontrollera att bild, text och länkar
  fortfarande kommer från rätt Sanity-dokument.
- Försök redigera en Sanity-rubrik direkt i canvasen. Weblab ska stoppa
  textändringen. Redigera själva innehållet i Sanity.
- Publicera en annan rubrik i testprojektets Sanity Studio. Uppdatera sajten och
  kontrollera att den nya texten visas med Weblab-designen kvar.
- Ångra/gör om en stiländring, exportera ändringen och granska att Sanity-
  kopplingen finns kvar. Prova exporten i en separat kopia före kundarbete.

Automatiska kontroller finns i `test/` och i
`packages/parser/test/sanity-pilot.test.ts`. De använder exempelsvar och den
riktiga källkodstransformeringen, inte ett riktigt Sanity-projekt eller en
installerad desktopapp.

Teknisk referens: [Sanitys Query API](https://www.sanity.io/docs/http-reference/query).
