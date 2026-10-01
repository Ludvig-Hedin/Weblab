# Sanity-pilot

En separat testsajt med startsida, blogg, kategorifilter och artikelsidor. Designen
ligger i Next.js och Tailwind. Innehållet kan hämtas direkt från Sanity. Inget
kopieras till Weblabs eget CMS. Den publika sajten läser bara publicerat innehåll.
På `/studio` finns Sanitys vanliga redigering och publicering för inloggade
projektmedlemmar.

**Status 2026-10-01:** den lokala piloten är verifierad mot ett separat Sanity-
testprojekt. Inloggning, redigering och publicering i Studio fungerar. En rubrik
ändrades och återställdes medan den sparade designen låg kvar. Weblabs
installerade editormotor sparade rubrikens desktopstorlek från 60 till 62 px,
med 36 px kvar på telefon. Förhandsvisningens ångra/gör om och en sparad
64 till 62 px-återställning fungerar. En lokal designpatch gick att applicera
i en separat källkodskopia med CMS-uttrycken kvar. Ingen extern publicering
eller full native mappstart ingår i detta bevis. Detta är en lokal pilot,
inte en lanserad eller generell Sanity-integration.

Det tidigare lokala beviset omfattar 34 fokuserade kontroller: 21 för
den oförändrade mallen och 13 för den separata nyare editorkällan.
Editorändringarna ingår inte i denna PR. Studio byggs på en egen sida utan sajtens navigation eller CSS.
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
  registrering och minnesskydd. Ägaren godkände en tredje startplats enbart
  för piloten. Editor och sajt är ett övervakat projekt.
- Weblabs egen utvecklingsserver omfattas inte av undantaget. Editorstarten
  använder appens befintliga motor, inte en ändrad app eller ett globalt undantag.

Från den fristående kopians mapp kan nästa agent använda:

```sh
agent-heavy-run sanity-pilot install
agent-heavy-run sanity-pilot typecheck
agent-heavy-run sanity-pilot build
```

En lokal förhandsvisning på port 3007 startas med `agent-heavy-run sanity-pilot start`.
Ta en browser-lease först, respektera pilotens tre-jobbsgräns och stoppa bara den egna
servern efter kontrollen. Den publika sidan och kategorifiltret är kontrollerade
på desktop och telefon. Studio-publicering och sparad design är också
kontrollerade. Editor och sajt startas tillsammans med `agent-heavy-run sanity-pilot editor`
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
- Redigera innehållet i Sanity. Den separata nyare editorkällan blockerar direktredigering av
  CMS-rubriker i sina fokuserade kontroller. Det skyddet ingår inte i denna mall. Den installerade
  appens editormotor har inget särskilt Sanity-lås. Prova därför bara design
  där och granska att CMS-uttrycken är kvar i den sparade koden.
- Publicera en annan rubrik i testprojektets Sanity Studio. Uppdatera sajten och
  kontrollera att den nya texten visas med Weblab-designen kvar.
- Ångra/gör om en stiländring och granska att Sanity-kopplingen finns kvar.
  Den installerade appens Upload skickar till GitHub. Det användes inte
  i det avgränsade lokala beviset. En lokal Git-patch kan i stället provas i en separat
  kopia före kundarbete. En desktoprelease behöver separat paketering och acceptans.

Mallens 21 automatiska kontroller finns i `test/`. De använder exempelsvar,
inte ett riktigt Sanity-projekt eller en installerad desktopapp. De 13 övriga
kontrollerna kördes i den separata nyare Weblab-källan, vars editorändringar
inte ingår i den här PR:en.

Teknisk referens: [Sanitys Query API](https://www.sanity.io/docs/http-reference/query),
[Studio i Next.js](https://www.sanity.io/docs/nextjs/embedding-sanity-studio-in-nextjs).

## Begränsningar som det visuella testet hittade

- Installerad Weblab 0.2.0 har inget Sanity-lås för direktredigering av text.
  Redigera innehållet i Studio och granska att designändringar behåller CMS-
  uttrycken. Repots nyare parserkontroller är inte samma sak som installerad app.
- Den installerade editorns källkodspekare visade en genererad Turbopack-fil
  för startsidan. Sparandet fungerade med den faktiska sidfilen angiven i
  instruktionen. Detta behöver fixas innan en kund förväntas spara utan stöd.
- En sparad ändring går att ångra i samma editorbesök. Hela editorns omladdning
  tömde chatten och tog bort den tidigare ångraknappen. Sajten behöll ändringen.
  Spara i Git inför omladdning tills historiken är beständig.
- Patchprovet verifierade applicering och identisk källkod i en annan kopia.
  Kopian byggdes inte separat och Upload/GitHub eller publicering till en värd
  testades inte. Dessa flöden återstår i en separat desktoprelease.
- Piloten klarar sina egna typ-, lint- och byggkontroller. Weblabs delade
  arbetskopia hade vid kontrollen typfel i andra pågående CMS- och tokenändringar.
  Ingen full Weblab-kontroll eller kundrelease påstås ha gått igenom.

## Testa själv och kontrollera releasegränsen

Se [testguiden](TESTA.md). Den beskriver vad du kan prova nu och vad en ny
desktoprelease fortfarande måste bevisa. Den här mallen uppdaterar inte
installerad Weblab och ändrar inte nedladdningen på weblab.build.
