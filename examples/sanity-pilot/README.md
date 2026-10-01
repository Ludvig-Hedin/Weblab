# Sanity-pilot

En separat testsajt med startsida, blogg, kategorifilter och artikelsidor. Designen
ligger i Next.js och Tailwind. Innehållet kan hämtas direkt från Sanity. Inget
kopieras till Weblabs eget CMS och sajten skriver aldrig tillbaka till Sanity.

**Status 2026-10-01:** exempelläge är byggt. Inget Sanity-projekt är anslutet.
Riktiga innehållsuppdateringar, visuell redigering i den installerade appen och
publicering är ännu inte verifierade. Detta är ett testunderlag, inte en lanserad
Sanity-integration.

Källkods- och sidkontrollerna gick igenom: 18 fokuserade testfall med exempelsvar.
Den fokuserade lintkontrollen gick igenom utan fel eller varningar.
Typkontrollen är inte körd. Det installerade maskinskyddet tillåter bara de
befintliga paketen, inte den fristående testsajten. Installations-, bygg- och
desktopkontroller återstår också; ingen lokal server har startats.

## Köra som egen sajt

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

1. Skapa ett separat testprojekt och dataset i Sanity. Använd inte kundens skarpa
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
