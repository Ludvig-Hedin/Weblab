# Sanity-pilot

En separat testsajt med startsida, blogg, kategorifilter och artikelsidor. Designen
ligger i Next.js och Tailwind. Innehållet kan hämtas direkt från Sanity. Inget
kopieras till Weblabs eget CMS. Den publika sajten läser bara publicerat innehåll.
På `/studio` finns Sanitys vanliga redigering och publicering för inloggade
projektmedlemmar.

**Status 2026-10-01:** en fristående kopia är ansluten till ett nytt Sanity-
testprojekt. Den riktiga innehållshämtningen läser en startsida och två artiklar.
En publicerad rubrikändring hämtades och återställdes utan kodändring.
Visuell redigering i Weblab, Studio-redigering och extern publicering är ännu
inte verifierade. Detta är ett testunderlag, inte en lanserad Sanity-integration.

Källkods-, schema- och sidkontrollerna gick igenom: 34 fokuserade testfall med
exempelsvar. Studio byggs på en egen sida utan sajtens navigation eller CSS.
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
  kontroller, bygge, en lokal produktionsförhandsvisning och den installerade
  appens editor tillsammans med sajtens server. Det behåller minnesgränser,
  registrering och två-jobbsgränsen. Editor och sajt är ett övervakat projekt.
- Weblabs egen utvecklingsserver omfattas inte av undantaget. Editorstarten
  använder appens befintliga motor, inte en ändrad app eller ett globalt undantag.

Från den fristående kopians mapp kan nästa agent använda:

```sh
agent-heavy-run sanity-pilot install
agent-heavy-run sanity-pilot typecheck
agent-heavy-run sanity-pilot build
```

En lokal förhandsvisning på port 3007 startas med `agent-heavy-run sanity-pilot start`.
Ta en browser-lease först, respektera två-servergränsen och stoppa bara den egna
servern efter kontrollen. Den publika sidan och kategorifiltret är kontrollerade
på desktop och telefon. Studio och sparad designändring väntar på en ledig
startplats. Editor och sajt startas tillsammans med `agent-heavy-run sanity-pilot editor`
på port 3008 respektive 3007. `resolve` uppdaterar kopians låsfil endast för den
fast godkända installationen; använd `install` för fryst återinstallation.

## Generell uppsättning i en annan godkänd miljö

På den här Macen gäller enbart de skyddade kommandona ovan. De generella
kommandona nedan ger inte tillstånd att kringgå skyddet eller starta Weblabs
egen utvecklingsserver.

Den här mappen är en mall utanför Weblabs Bun-workspaces. För att öppna den i
desktopappen behöver den först kopieras till en **egen Git-repomapp** utanför
Weblab-repot. Desktopappen kan inte öppna en undermapp som ett eget repo.

I den fristående kopian: installera med Bun, så att kopian får en egen `bun.lock`,
och skapa en första commit. Ändra inte Weblab-repots dependencies eller lockfil.
Sajten och Studio behöver Node 22.12 eller senare.

```sh
bun install
git init
git add src sanity test package.json tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs .gitignore .env.example README.md bun.lock
git commit -m "Add Sanity pilot site"
bun dev
```

Den installerade Weblab-appen 0.2.0 ändrar den valda mappen direkt. Använd
därför bara den separata Git-kopian. Dess vanliga mappstart ingår inte i det
avgränsade undantaget på den här Macen. Här provas samma editormotor genom
den skyddade starten ovan. Öppna `/`, `/blog` och en artikel. Gemensamma
bloggrubriker kommer från samma mall, så en stiländring gäller flera inlägg.

## Ansluta ett nytt Sanity-testprojekt

1. Återanvänd projektet ovan för den här körningen. Skapa ett nytt, separat
   testprojekt endast för en annan framtida pilot. Använd inte kundens skarpa
   innehåll för den första piloten.
2. Öppna sajtens `/studio` och logga in med en vanlig Sanity-användare som är
   medlem i testprojektet. Studio använder [sanity/schema.ts](sanity/schema.ts).
   Startsida öppnar alltid dokumentet `pilot-home`. Skapa inte ett annat
   startsidedokument. Publicera startsidan och minst två blogginlägg.
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
Den publika sajten har inga realtidsuppdateringar eller utkastförhandsvisning.
Studio ligger på en egen sida och ändrar inte sajtens design.

Piloten visar de 50 senaste artiklarna. Brödtext stöder stycken, underrubriker,
fetstil och kursiv. Länkar, listor och andra blocktyper ingår inte. Detta är
avsiktligt litet; en kunds befintliga innehållsmodell behöver en egen anpassning.

## Studio på `/studio`

Studio visar de två befintliga dokumenttyperna: Startsida och Blogginlägg.
Startsidan är ett enda dokument med ID `pilot-home`. Menyerna erbjuder inte
nya kopior, duplicering eller radering av startsidan. Artiklar kan skapas och
redigeras som vanligt. Fältkontroller hindrar tom text, ogiltiga eller upptagna
adresser, felaktiga datum, bilder utan bildbeskrivning och brödtext med länkar
eller listor som sajten inte kan visa.

Studio läser projekt-ID och dataset från serverns miljöinställningar. Bara de
här två offentliga värdena skickas till webbläsaren. `SANITY_READ_TOKEN` används
bara av sajtens innehållshämtning och ger ingen Studio-inloggning. Studio kan
öppnas även om den publika sajten använder exempelläge, när projekt-ID och
dataset är giltiga. Saknas de visas uppsättningshjälp, aldrig exempeldata.

Sanitys vanliga inloggning och projektbehörigheter styr vem som kan redigera.
För en ny sajtadress måste projektägaren tillåta den exakta adressen som CORS-
origin med credentials i Sanitys projektinställningar. Ingen egen inloggning
eller nyckel som skriver innehåll ingår i mallen. Separata sidlayouter håller
sajtens navigation och Tailwind-stilar borta från Studio. Studio är märkt
`noindex` för sökmotorer.

## Vad testet ska bevisa

- Ändra rubrikens storlek, färg och avstånd i Weblab. Ladda om och kontrollera
  att innehållet finns kvar på telefon och desktop.
- Filtrera bloggen och öppna ett inlägg. Kontrollera att bild, text och länkar
  fortfarande kommer från rätt Sanity-dokument.
- Redigera innehållet i Sanity. Repots källkodstransformering blockerar
  direktredigering av CMS-rubriker i sina fokuserade kontroller. Den installerade
  appens editormotor har inget särskilt Sanity-lås. Prova därför bara design
  där och granska att CMS-uttrycken är kvar i den sparade koden.
- Publicera en annan rubrik i testprojektets Sanity Studio. Uppdatera sajten och
  kontrollera att den nya texten visas med Weblab-designen kvar.
- Ångra/gör om en stiländring och granska att Sanity-kopplingen finns kvar.
  Den installerade appens Upload skickar till GitHub, vilket inte är godkänt
  i detta lokala test. En lokal Git-patch kan i stället provas i en separat
  kopia före kundarbete. Ingen extern publicering ingår utan ägarens godkännande.

Automatiska kontroller finns i `test/` och i
`packages/parser/test/sanity-pilot.test.ts`. De använder exempelsvar och den
riktiga källkodstransformeringen, inte ett riktigt Sanity-projekt eller en
installerad desktopapp.

Teknisk referens: [Sanitys Query API](https://www.sanity.io/docs/http-reference/query),
[Studio i Next.js](https://www.sanity.io/docs/nextjs/embedding-sanity-studio-in-nextjs).
