# Är Weblab redo för kundhemsidor?

Bedömning: **inte för rutinmässigt arbete på riktiga kundprojekt ännu, och inte för kunders egen användning.** Det finns bekräftade vägar till förlorat arbete och oavsiktlig publicering. En intern pilot på separata projektkopior är ett rimligt nästa steg efter säkerhetsrättningarna.

## Läget efter påbörjade rättningar

Inloggningen efter ägarens `done` har kontrollerats: vald Convex-miljö `avid-gnat-539` gav200 och pekar på team `ludvighedin15`, projekt `weblab`. Skyddad codegen slutfördes, och webbappens typkontroll slutfördes utan fel efter de senaste rättningarna av utkast och säker avslutning. Det är åtkomst- och källbevis, inte en ny backendrelease eller installerad app.

**Ny blockerare: flera publicerare.** Lokal låsning skiljer användare, grenar, mappar och datorer. Två klienter kan därför läsa samma liveversion och sedan byta live i tur och ordning utan gemensam kontroll. Native publicering och återställning är nu spärrade av en serververifierad kapabilitet som alltid är false. Granskning, skyddade byggen och avläsning av tidigare osäkra ärenden fungerar fortsatt i källkontraktet. Vercels dokumenterade [promote](https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-given-deployment) och [rollback](https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-previous-production-deployment-by-id) tar ingen förväntad aktuell deployment. Slutsatsen om samtidighetsgapet bygger på dessa kontrakt och appens GET→POST-flöde. Rollback-adressen har också rättats till den dokumenterade v1-adressen.

Före aktivering behövs en gemensam destinationsspärr per verifierat Vercel-konto+projekt och en serverägd publiceringsåtgärd som skickar högst en gång. Skickat/okänt ärende får inte släppas genom timeout, stängd app eller gammal livepekare. Positiv providerbekräftelse och säkerhet om att tidigare arbetare inte kan skicka senare krävs. Detta samordnar Weblab-klienter. Automatiska Git-publiceringar eller externa verktyg saknar samma spärr och behöver vara avstängda eller medföra ny granskning.

**Nivåval:** första öppning och inställningar finns i källa per inloggad användare och enhet. Innehållsvyn har nu ett separat bloggflöde för den godkända Sanity-modellen. Kopplingen är ännu inte aktiverad, och den öppnar inte automatiskt fulla kodeditorn. Övrig innehållsredigering är inte färdig. Nytecknat fulläge öppnar inte de fortfarande spärrade AI/CMS-funktionerna. Vid sajtbyte ska gamla monterade utkast finnas kvar tills säker avslutning lyckats; allhistorik-lås och sista versionskontroll finns nu i källa. Strikt textavslutning delar sin ägare med responsiva skrivningar. Monterade kodutkast har bestående sessioner med ägarkontroll; oberoende källgranskning är klar. Verklig EditorView/paketerad stängning återstår. Bestående webbläsarutkast är bästa möjliga återhämtning, inte en garanti vid strömavbrott, rensad lagring eller ominstallation.

**Weblab CMS-fältregler:** frysta innehållsversioner tappade tidigare tillåtna val, flerval, referensmål och URL-regler. Version2 bevarar endast validerade offentliga inställningar och vägrar saknade referenssamlingar även utan poster. Privata providerinställningar följer inte med. Äldre version1 lämnas orörd och får inte senare räknas som komplett runtimekontrakt. Rättningen klarade27 fokuserade CMS-fixturer, slutlig webbtypkontroll och oberoende källgranskning. Riktad lint av de två filerna gav0 fel och144 varningar. Ingen runtime/publiceringsspärr öppnades.

**Ingen av versionerna är releaseklar.** Den installerade 0.2.0 är oförändrad. Den valda 0.2.6-källan har nu lokala rättningar och nya skydd, men det finns ännu inget kontrollerat nytt installerat paket.

| Område | Nuvarande källa | Kvar före kundanvändning |
| --- | --- | --- |
| Originalfiler och hemligheter | Privata kopior utelämnar kända nyckelfiler, credential-mappar, beroenden och byggresultat. Gamla osäkra kopior nekas. Skärmen förklarar att preview behöver egna nycklar. | Bekräfta nya paketets öppna/installera/preview på riktiga kopior. Git-historik och godtyckliga hemligheter i vanliga filer är inte generellt sanerade. |
| Native inloggning och AI-jobb | Appinitierat engångsärende, origin/main-frame-kontroll, externa URL-regler, avbruten setup, barnprocessägarskap, startgrind, bestående journal och typade Codex-filändringar har skärpts. Okänt processutfall hålls spärrat. | Paketerat bevis. Claude isolering är inte verifierad. Codex read-only hindrar inte i sig läsning utanför arbetskopian. Kundernas fulla AI-läge får inte kallas isolerat innan effektiv policy är bevisad. |
| Visuella ändringar | Literal-säker text, vägran vid blandad Ungroup, skydd för dynamiska klassuttryck, reversibel kodhistorik, tokennamn och projektets egna responsiva gränser har rättats i källa. | Verklig ändra/spara/återöppna/ångra i nya paketet, på flera projekt. |
| Vercel-publicering | Ny native tjänst och skärm granskar frysta filer, inkluderade/utelämnade filer, konto/projekt/domäner, test/live-nycklar och skyddad preview. Separata preview/production-byggen ändrar inte domäner automatiskt. Livebyte är nu spärrat tills gemensam samordning finns. Kunden bekräftar byte och exakt återställningsmål. | Kundens konto, rättigheter, providerutfall, nätavbrott och återställning behöver ett godkänt förbrukningsbart Vercel-projekt. Nytt projekt utan tidigare READY produktion stöds inte ännu. |
| Avbruten eller extern publicering | Stängning och navigering avbryter ännu oskickade native anrop. Definitivt nekad egen begäran frigör endast sitt sparade avsiktskvitto. Osäkra skickade anrop hålls spärrade. Extern live-/domänändring ger bestående varning och kräver explicit ny basversion. | Riktiga Vercel-anrop, återstart och appens användarflöde behöver kontrolleras. Lokala fixturer ersätter inte detta. |
| Weblab CMS | Optimistiska revisioner, validerade fält/länkar/referenser, begränsad sidvis lista, utkast, oföränderliga innehållssnapshot och arkivering med återställning till utkast finns i källa. | Kundläge, godkända block/mallar, bildoriginal, en riktig Next-runtime och korrekt sammanläggning av befintligt liveinnehåll med nya granskade utkast. |
| Sanity | Begränsad adapter för `sanity-pilot-v1`, CAS-utkast, ägarbunden schemalagd skrivning, skydd mot roterade anslutningar och återkallad åtkomst, spärr vid okänt utfall. Befintliga publicerade dokument ändras inte. | Generella godkända kundscheman, anslutnings-/innehållsskärm, bilder, fryst siteruntime samt separat publicering/återställning av Sanity-dokument. Mockade anrop är inte skarpa providerbevis. |

**CMS-sajter får tills vidare inte publiceras som enbart kod.** Native publicering nekar det tills granskat CMS-innehåll och tillgångar kan ingå i samma release. Att slå på CMS-panelen eller en gammal publish-knapp är inte ett godkänt sätt att komma runt spärren.

**Bekräftade produktbeslut:** arkivera blogginlägg och mallsidor med återställning; välj innehållsläge/fullt läge första gången appen öppnas och byt i inställningar; Vercel i kundens eget konto; Sanity där det finns. För Sanity ska kunden kunna välja mellan **Publicera hemsidan** (standard, fryst innehåll utan publicerade dokumentmutationer) och **Publicera också i Sanity** (separat dokumentdiff, påverkan på andra konsumenter och egen återställning). De två valen är överenskomna produktkrav, inte färdiga skärmar eller levererade providerfunktioner.

**Kvarvarande hinder för verifiering:** Convex-inloggningen fungerar nu och codegen har slutförts. Webbklientens typkontroll har slutförts utan fel efter de senaste editorrättningarna. Riktad lint gav0 fel men1437 varningar, huvudsakligen formatering och befintliga regler. Därför är detta inte en kontroll utan varningar. Den publika nya `/api/native/publishing/authorize`-vägen gav 404 på weblab.build vid den tidigare läsande kontrollen. Ett nytt paket, autentiserat kundflöde, Vercel och Sanity har inte verifierats för dessa nya funktioner. Ingen push/deploy eller produktionsändring gjordes av denna granskning.

**Fokuserade bevis som kan återanvändas:** 129 native/publicerings-/CLI-/Sanity-fixturer passerade efter rättning av felaktiga testdata; senare publiceringsändringar och riktiga release-byte-fixturer passerade 24/24 i två filer. Dessa körningar överlappar. Parserns typkontroll passerade. Arkiv/CMS-revision22, overlay14 och nivåval15 passerade tillsammans; senare nivåval16 och textsession7 passerade. Vercel-transport9 och Next-preset-policy5 passerade. Senaste tvåfasavslutning19, textsession8, responsiv återhämtning9 och kodutkast19 passerade. Kodutkastens19 är utan DOM; faktisk EditorView/React och det nya installerade paketet är fortfarande okontrollerade. Oberoende källgranskning av dessa ändringar slutfördes utan kvarvarande blockerande fynd inom granskad omfattning. Övriga källskrivare är inte generellt bevisat avslutningssäkra. Historiska resultat nedan gäller bara dåvarande revision.

Granskad 2026-10-01. Detta är en jämförande bedömning av den installerade Mac-appen, dess faktiskt paketerade kod och båda lokala källversionerna. Ingen kundsajt ändrades eller publicerades.

## Privat kundtest efter ägarens instruktion

Cyklande Rörmokaren valdes som första verkliga testfall: Next16.2.9, Tailwind4.3.1, Bun-lock och riktiga `/blogg`/`/blogg/[slug]`-rutter. Appens faktiska privata kopieringsfunktion skapade `/private/tmp/weblab-customer-readiness-20261001-hhhUiv/7b681a7c-2308-453d-8281-e714059ff97a/project`. Originalets Git-status var ren före och efter. `.env.local`, `.env.example`, `.npmrc`, `.claude` och `.vercel` utelämnades. Inga Git-pushar, Sanity-skrivningar, beroendeinstallationer eller kundprocesser gjordes. En separat, oautentiserad GET läste endast publicerade Sanity-dokuments antal och struktur, utan texter, nycklar eller utkast.

Oförändrad kopia gick genom riktig plan- och snapshotkontroll:140 inkluderade filer,7 utelämnade filer,2943763 byte, inga källändringar och hash `067a8e5225cd2fbb0e0b7baf4ce131fd85a10ed92c3c7c88f879a4c6cb047835`. Detta bevisar kopiering/frysning på kundkälla, inte rendering eller publicering. Testet fann att en vanlig `vercel.json` med `framework: nextjs` felaktigt nekades. Policyn tillåter nu exakt den deklarationen och nekar andra presets och miljö-/domän-/byggöverskrivningar.

Verifierad offentlig Sanity-konfiguration: projekt `l45nowfu`, dataset `production`. Publicerad, oautentiserad GET gav200 och198 `blogPost`; ett begränsat strukturprov innehöll h3, kategorilistor och författare. Läsningen följde [Sanitys Query API](https://www.sanity.io/docs/http-reference/query) med `perspective=published`. Den verifierar läsning och schemagap, inte skrivning eller återställning. Kvitto: `/private/tmp/weblab-customer-readiness-20261001-hhhUiv/sanity-public-shape.json`.

Verkligt `blogPost` använder `heroImage`, `content`, `categories[]`, `author`, SEO och PortableText med h3/h4/citat/listor/länkannotationer/bilder. Adapterstödet för `pilotHome`/`pilotPost` kan inte redigera detta. Garba har också gemensamma bildreferenser och parallella språkversioner. Ny kontroll av samma140 filer och oförändrad hash identifierade Sanity i de frysta paketen och nekade kodbaserad publicering innan provideråtkomst. Den tidigare kontrollen såg bara CMS anslutna i appens databas och missade befintliga kundintegrationer. SDK-guard är rättad och verifierad med36 policy/service/snapshot-fixturer, inklusive äldre READY-release; den bevisar inte att godtycklig egen nätkod saknar mutabelt innehåll. Återställning till en äldre extern baseline kräver också innehållsbehörighet innan liveflödet senare aktiveras. Typerna får inte döpas om för att skapa falskt kompatibilitetsbevis. Release kräver granskad schema-/fält-/routeadapter och en fryst loader som bevarar dessa strukturer samt samma rendering i preview/live/rollback. Ingen faktisk CMS-mutation är verifierad för dessa kundscheman. Även startsida, inställningar, tjänster, recensioner, områden, produkter, team och FAQ läser Sanity. Sluglistor och sitemap går delvis direkt genom freshClient. Ett bloggbyte ensamt lämnar resten mutabelt och är därför inget säkert release-/återställningsbevis.

## Vilken app gäller bedömningen?

Två olika produkter finns på den här datorn. Deras skydd får inte blandas ihop.

| Version | Vad den faktiskt är | Bevis och gräns |
| --- | --- | --- |
| Installerad Weblab 0.2.0 | Fristående Mac-app, lokalt dashboard, egen editor och GitHub/Vercel-flöden. Ingen Weblab-inloggning krävdes på startsidan. | `/Applications/Weblab.app`, dess `app.asar`, paketerade CLI och källkartor inspekterades. Startsidan öppnades och appen stängdes efteråt. |
| Motsvarande fristående källa 0.2.1 | Finns i `../weblab-html-dropdown/apps/desktop-local`, vid `1def84820` före denna granskning. | De berörda runtime-, settings-, upload- och deploy-filerna jämfördes med 0.2.0 och matchade. Nyare main/update-kod är inte bevis för installerad funktion. Äldre fristående D-rättningar i denna granskning ligger här. Den valda nyare appen har egna separata rättningar. |
| `onlook/apps/desktop` 0.2.6 | En separat desktop-shell för den större webbeditorn, med Clerk/Convex och privata arbetskopior. | Dess källkod och 99 fokuserade native-tester granskades. Den är inte samma app som den installerade 0.2.0. Dess avstängda publicering och skydd för originalmappen beskriver inte den installerade appen. |

Ägaren har bekräftat att **båda versionerna ska bedömas**. Bedömningen av 0.2.0 gäller den faktiska installerade appen. Bedömningen av 0.2.6 gäller nuvarande källa med pågående ändringar från andra arbeten, inte ett verifierat installerat paket. Ingen installerare har byggts om, bytts ut eller publicerats i denna granskning.

## Beslut för de tre användningsfallen

| Användning | Redo nu? | Vad det betyder |
| --- | --- | --- |
| Experiment på en separat, förbrukningsbar kopia | Begränsat | Kan användas för att lära känna editorn. Kopian behöver egna testnycklar och får inte vara kopplad till automatisk livepublicering. |
| Du och kollegor bygger betalda kundhemsidor | Nej för normal drift | Bör först klara projektkopior, återställning, filkonflikter och en riktig genomgång i det nya installerade paketet. En utvecklare behöver tills vidare granska varje kodändring och äga releasen. |
| Kunder använder appen själva för sin livesajt | Nej | Kunder kan ändra kod, köra AI och publicera utan de rättighets-, gransknings- och återställningsskydd som deras självservice kräver. |

En lokal ändring behöver inte påverka besökare direkt. **Upload till en bevakad Git-gren kan däremot utlösa publicering.** Förhandsvisningen kör dessutom projektets kod och kan använda dess externa tjänster. Testmiljö och liveproduktion måste därför vara tydligt åtskilda.

## Bekräftade fel och nuvarande status

”Rättat i källa” betyder att nästa paket kan innehålla rättningen. Den installerade 0.2.0 har fortfarande sitt gamla beteende.

| ID | Fel och ett konkret sätt att utlösa det | Konsekvens | Status |
| --- | --- | --- | --- |
| D-01 | AI ändrar en fil. En kollega sparar nyare arbete i samma fil. Ångra den gamla AI-ändringen. | Kollegans arbete skrivs över. En ny fil kan raderas trots att den ändrats senare. | **Rättat i källa.** Exakta aktuella bytes måste matcha ändringens sparade slutläge. Okänt slutläge, länkar och konflikter nekas. |
| D-02 | Ångra ett äldre jobb medan ett nytt AI-jobb fortfarande arbetar. | Två skrivare kan ändra samma filer samtidigt. | **Rättat i källa.** Ångra väntar nu i samma kö som AI-ändringar. Fel tillhör rätt jobb och kön fungerar efter ett fel. |
| D-03 | Klicka en `.env`-fil, eller Välj alla, i Upload. | En fil märkt ”Secret, left out” kan ändå skickas till GitHub. | **Rättat i källa.** Både skärmen och den faktiska uppladdningen blockerar kända hemliga filnamn, även när en hemlig fil döpts om. |
| D-04 | Spara appens Anthropic-nyckel och öppna en sajt. | Sajtens dev-/predev-kod ärver appens AI-nyckel. | **Rättat i källa.** Bara appens injicerade nyckel tas bort från sajtprocessen. Agentens inloggning och vanliga projektvariabler bevaras. |
| D-05 | `.env.local` är en länk till en fil utanför projektet. Spara inställningar. | Den externa filen kan skrivas över. Ett läsfel kan också behandlas som en tom fil. | **Rättat i källa.** Länkar och icke vanliga filer nekas. Komplett fil skrivs privat före byte, och ändrat innehåll nekas. Pipe-filer kan inte blockera huvudprocessen. |
| D-06 | AI ändrar filer och misslyckas sedan, eller stoppas. | Delvis ändrad kod ligger kvar, men chatten erbjuder ingen Ångra-knapp. | **Rättat i källa.** Delvis ändrade filer visas och får skyddad Ångra. Commit och PR öppnas inte för misslyckade jobb. |
| D-07 | Upload skickar den nuvarande grenen till en befintlig origin med automatisk hosting. | Texten lovar att livesajten inte ändras, trots att uppladdningen kan starta en release. | **Felaktigt löfte rättat i källa.** Själva publiceringsrätten kräver beslut nedan. |
| D-08 | Skapa ett Test link-projekt. | Skärmen kallar länken privat, men appen stänger av Vercel Authentication för nya projekt. | **Felaktigt löfte rättat i källa.** Åtkomstskydd är ett produktbeslut. |
| D-09 | En deploy avbryts eller CLI-resultatet inte kan tolkas efter att fjärrarbete startat. | Skärmen lovar ”Nothing changed online” utan att kontrollera fjärrläget. | **Felaktigt löfte rättat i källa.** Användaren hänvisas nu till att kontrollera hosting. Säker återställning återstår. |
| D-10 | Öppna en projektmapp utan `node_modules`. | Ofrysen installation och projektets installationsskript körs direkt i originalmappen. | **Återstår.** Kräver separat arbetskopia och ett tydligt, granskat installationsflöde. |
| D-11 | Installationen avbryts efter att `node_modules` skapats. Öppna igen. | Mappens existens räknas som färdig installation, så samma trasiga beroenden kan återanvändas. | **Återstår.** Behöver ett kvitto på färdig installation och säker återförsökshantering. |
| D-12 | Öppna en sajt vars dev-skript har fast port, exempelvis 3000. | Appen väntar på en annan vald port, normalt från 4100. Sajten kan inte nå editorn. | **Återstår.** Portval måste matcha det som faktiskt startas. |
| D-13 | Importera `index.html` som länkar till `about.html`. | Den länkade HTML-sidan kopieras inte och navigationen kan ge 404. | **Rättat i källa.** Länkade HTML-sidor och deras tillgångar följer med. Länkar i filsystemet och sökvägar utanför rotmappen följs inte. |
| D-14 | Hoppa över miljönycklar vid första deployförberedelsen. Lägg sedan till en ny obligatorisk nyckel. | Projektets `keysAsked` stänger av nya kontroller. Saknade nycklar efterfrågas inte igen. | **Rättat i källa.** Saknade nycklar kontrolleras varje gång. Förberedelsen stoppas om fjärrinställningarna inte kan läsas, i stället för att felaktigt erbjuda att ersätta befintliga värden. Separata test/live-mål återstår. |
| D-15 | Välj Kopiera nycklar för en testlänk. | Samma lokala värden skickas både till preview och production. | **Bekräftat beteende, produktbeslut krävs.** Testnycklar får inte tyst bli produktionsnycklar. |
| D-16 | Låt en kollega ha förberedda staged ändringar och använd Upload. | Hela indexet avstages innan valda filer läggs till. Kollegans förberedda commit rubbas. | **Rättat i källa.** Bara valda sökvägar committas. Andras förberedda tillägg och ändringar bevaras, verifierat i separata Git-fixturer. |
| D-17 | Gör visuella ändringar före Apply och stäng eller ladda om. | Utkast och lokal manipulationshistorik finns bara i minnet. | **Återstår.** Bestäm var utkast sparas och hur osparade ändringar visas. |
| D-18 | AI avslutar utan rapporterat fel men genomför inte alla visuella önskemål. | Editorn kan tömma det visuella utkastet och visa att arbetet sparats utan att bevisa motsvarande källändring. | **Återstår.** Kräver verifierat sparresultat och bevarat utkast vid osäkert resultat. Det exakta visuella utfallet behöver ett installerat end-to-end-test. |

Skyddet i D-03 känner igen specifika filnamn. Det är **inte** en innehållsscanner och hittar inte automatiskt en hemlig nyckel inskriven i en vanlig kodfil eller en gammal commit. Upload skickar också tidigare commits. En granskningsbar diff och hantering av redan committade hemligheter återstår före kundrelease.

## Skillnaden mellan versionerna

| För användaren | Installerad 0.2.0 | Aktuell 0.2.6-källa |
| --- | --- | --- |
| Befintlig kundkod | Redigeras i originalmappen | Privat kopia, granskad patch och kontroller av senare ändringar i originalet |
| Spara en visuell ändring | Utkast genomförs via AI Apply | Vanliga ändringar skrivs till källa med kö, syntaxkontroll och konfliktskydd |
| Ångra | Installerad historik kan skriva över senare arbete | Starkare versionskontroll; flera metadata- och tokenändringar saknar dock full historik |
| Öppna lokalt | Ingen Weblab-inloggning på startsidan | Normal öppning kräver Clerk/Convex och nätåtkomst |
| Publicera | GitHub Upload och Vercel test/live finns | Nytt native publiceringsflöde finns i källa; backendväg, installerat paket och providerflöde är inte verifierade. CMS-sajter är spärrade tills fryst innehåll ingår |
| Kundläge | Inget styrt innehållsläge | Inte färdigt; medlemmar/delning och bilduppladdning avstängda i nuvarande editorscope |
| AI | Körs som standard med breda rättigheter | Lokala scopet stänger AI-panelen; separat native CLI-kod under utveckling har egna kvarvarande risker |
| Delning idag | Ett faktiskt installerat, signerat paket finns | Källa finns, men denna bedömning bevisar inget färdigt uppdaterat paket |
| Teamets kundarbete | **Inte redo för normal drift** | **Inte redo för normal drift**, bättre grund för att skydda originalkod |
| Kund ändrar och publicerar själv | **Inte redo** | **Inte redo**, publiceringsflödet saknas dessutom i aktiv lokal produkt |

Jag rekommenderar den nyare privata arbetskopian och konfliktskyddet som grund. Ägaren har valt den som grund. Publicering och kundläge behöver sedan utvecklas mot ägarens beslut. Att slå på de avstängda molnflödena är inte en lösning: backloggen beskriver kvarvarande behörighets- och återställningsproblem bakom spärrarna.

## Bekräftade problem i aktuell 0.2.6-källa

| ID | Utlösare | Konsekvens och minsta nästa steg |
| --- | --- | --- |
| N-01 | Öppna en oombedd `weblab://`-länk med ett giltigt inloggningsärende | Den aktuella användaren kan loggas ut och ersättas utan att appen startat motsvarande inloggning. Kräver engångsärende kopplat till appens egen begäran. Den kortlivade Clerk-biljetten räcker inte som korrelation. |
| N-02 | Previewinnehåll begär en ny ruta med ett annat URL-protokoll | Fönsterhanteringen skickar länken till operativsystemet utan en snäv protokollista. Kräver validering före externa anrop. |
| N-03 | Native Codex startar men den isolerade MCP-inställningen inte skapas; eller Stop används under setup | Felhantering kan fortsätta med bredare inställningar, och setup kan gå vidare efter Stop. Kräver stopp vid misslyckad isolering och avbrottskontroll före spawn. AI-panelen är avstängd i nuvarande lokala scope; risken gäller den separata native CLI-vägen om den används. |
| N-04 | Appen kraschar medan handoff-journalens lås finns | Nästa skrivning/överlämning kan fastna på det gamla låset. Behöver återhämtning som bevisar att tidigare ägare är borta utan att ta över ett aktivt lås. |
| N-05 | Git-kontrollen av ignorerade filer misslyckas när AI-skrivningar journalförs | Okänt resultat behandlas som inga ignorerade filer. Nya ignorerade hemligheter kan hamna i ändringspaketet. Kräver att journal/överlämning stoppas när ignoreringsregler inte kan verifieras. |
| N-06 | Ändra klasschips eller bind en färg på `className={cn(...villkor...)}` | Dagens synliga klasser ersätter hela uttrycket, så tillståndsstyrd design försvinner. Blockera osäkra operationer tills statiska delar kan ändras utan att villkoren tappas. |
| N-07 | Skriv vanlig rubriktext som `Välkommen {clientName}` | Texten sparas som JSX-kod och kan utvärdera ett saknat värde så sidan kraschar. Kräver literal-säker vanlig text. Nyare rich-text-väg skyddar bara sin egen väg. |
| N-08 | Ungroup på `<p>Hello <strong>world</strong>!</p>` eller en dynamisk uttryckslista | Text och uttryck filtrerades bort. **Skydd rättat i källa:** källskrivaren vägrar nu före mutation för direkt text, uttryck, kommentarer och betydelsefulla blanktecken. Skärmens tidigare DOM-manipulation och komplett Ångra behöver fortfarande en egen verifiering och rättning. |
| N-09 | Byt namn på en färgvariabel som används av exempelvis `bg-brand` | Variabeln byts, men kodens klasser följer inte med. Design försvinner. Behöver användningskontroll och komplett namnbyte, eller vägran tills det stöds. Redan känt i backloggen. |
| N-10 | Nollställ en tablet-/desktop-stil | Märket för override försvinner men klassen kan ligga kvar i källa och återkomma efter omladdning. Kräver explicit borttagning av rätt befintlig klasstoken. |
| N-11 | Redigera en 1200px-vy; eller använd projektets egna Tailwind-brytpunkter | Preview och sparad CSS kan få olika nedre gränser, exempelvis 1200 respektive 1024px. Kräver en gemensam beslutad brytpunktsmodell. |
| N-12 | Ändra en variabel/klass/tagg efter en vanlig stiländring och tryck Ångra | Metadataändringen går utanför historiken och tidigare historik kan tömmas av versionskontrollen. Kräver att även dessa egna ändringar går genom återställningsbar historik. |
| N-13 | Lämna editorn, byt konto eller stäng med osparad kod och en misslyckad sparning | **Rättat i källa inom granskad omfattning:** konto-/sajt-/grenbundna kodutkast checkpointas före accepterad ändring, flera sessioner bevaras och sena sparningar får inte radera nyare text. Alla historiker låses och sista kvittot kontrolleras före någon gren släpps. Kodutkast19, avslutning19 och textsession8 passerade; verklig navigation, EditorView och paketerad stängning återstår. Bestående webbläsarlagring är inte en garanti vid strömavbrott eller rensad lagring. |
| N-14 | Responsiv källskrivning misslyckas, lämna sedan editorn | Felet loggades och räknades som färdigt. **Rättat i källa:** misslyckad avsikt håller avslut spärrat; bara bekräftad senaste skrivning av hela egenskapens responsiva avsikt löser den. Ångra av en senare deländring får inte tysta ett tidigare misslyckande. Grenar och egenskaper har separata köer. Senaste återhämtning9 passerade inklusive lokal textägare; tidigare optimistisk/stilskydd12 återanvänds. Oberoende källgranskning och slutlig webbtypkontroll är klara. Paketerad editorintegration återstår. |

För N-01–05 är gränserna native/auth/journal. För N-06–12 är det faktiskt källskrivande editorfunktioner. Exakt beteende har spårats i källa, men en installerad editorrunda återstår. Dessa får inte räknas som rättade bara för att andra native-tester passerar.

Ytterligare redan dokumenterade begränsningar i 0.2.6: mappar utan Git/committad HEAD kan inte gå genom privata kopior; vissa Git-format och submoduler nekas; statisk HTML har ingen hållbar visuell CSS-skrivare; installation, preload och preview behöver paketerad desktopverifiering. Nekad funktion är säkrare än en felaktig ändring, men användaren behöver ett tydligt besked om vad som faktiskt stöds.

## Större blockerare som inte är små UI-fel

**Originalmappen används direkt.** Till skillnad från den andra desktopversionen skapar den fristående appen ingen privat arbetskopia när en befintlig projektmapp öppnas. AI har som standard `bypassPermissions`, och projektinställningar laddas. Den installerade appen kan därför inte beskrivas som begränsad till säkra, isolerade ändringar i kundens sajt.

**Det saknas en återställningskedja för live.** Deploy har preview och production, men appen erbjuder ingen historik över releaser, ingen återställning till en tidigare publicerad version och ingen tydlig hantering av domäner. Vercels dashboard kan användas manuellt. Det är ett möjligt arbetssätt för en intern pilot om ansvarig person accepterar det, men otillräckligt för kunders självservice utan ett uttalat beslut.

**Ångra är bättre men inte en full transaktion.** Den nya jämförelsen stoppar äldre historik från att skriva över redan sparade senare ändringar. En extern editor kan fortfarande skriva mellan jämförelse och ersättning. Flera filer kan också återställas delvis, vilket rapporteras. Den robusta lösningen är projektisolering, en ägare för skrivningar och återställningsbara ändringspaket.

**Kundroller och samarbete saknar ett färdigt säkert arbetssätt.** Att två personer har samma repository ger ingen låsning av dokument, inget innehållsbegränsat kundläge och ingen granskningsregel före live. GitHub kan lösa delar av överlämningen, men appen behöver visa vilket ansvar och vilken rättighet kunden faktiskt har.

## Ägarens beslut och återstående produktval

Ägaren vill ha **team och kunder i samma första release**, ett **enkelt innehållsläge samt självvalt avancerat läge med full kod, AI och sajtinställningar för kunder** och **kundens egen publicering med granskning före och enkel återställning**. Det höjer kraven för första releasen: rättigheter, granskning av ändringar, test/live-separation och återställning behöver finnas från början. En intern pilot är fortfarande ett verifieringssteg, inte en annan beslutad målgrupp.

Förslaget att välja roll eller nivå vid start/inställningar behöver skilja på två saker. Ägaren vill att kunden själv väljer nivå vid start eller i inställningar. Ägaren har bekräftat att även full kod, AI och sajtinställningar ska kunna väljas. Ett enkelt kundläge kan vara standard, men avancerat läge är ingen säkerhetsgräns. Valet får aldrig ge åtkomst till någon annans sajt. Sajttillhörighet och högsta tillåtna funktioner måste kontrolleras även vid själva skrivningen och publiceringen.

Beslutade krav nedan skiljs från mindre återstående produktval. Lokala källrättningar innebär inte att hela det nya kundflödet är levererat.

| Beslut | Alternativ A | Alternativ B | Rekommendation / status |
| --- | --- | --- | --- |
| Första målgrupp | Team först | Team och kunder samtidigt | **B beslutat.** Båda måste klara sina acceptanskriterier före samma release. |
| Kundens frihet | Enbart begränsat innehållsläge | Enkelt innehållsläge och valbart fullständigt kod/AI-läge | **B beslutat.** Alla nivåer behöver samma skydd mot fel sajt, filförlust och osäker livepublicering. |
| Livepublicering | Teamet publicerar | Kunden publicerar själv | **B beslutat.** Sajtspecifik rättighet och säker återställning behövs. |
| Roll och nivå | Självvalda nivåer inom godkända kundfunktioner | Självval även av full kod/AI | **B beslutat.** Sajttillhörighet och andra personers rättigheter får inte ändras med nivåvalet. |
| Tillåtet innehåll | Text/bilder/länkar | Även flytt och viss konfiguration av godkända block, blogg och mallbaserade sidor | **B beslutat**, med teamdefinierade mallar. Exakta blockregler återstår. |
| Kundpublicering | Visa ändringar före publicering och erbjud återställning | Publicera direkt, återställ efteråt | **A beslutat.** |
| Arbetsmapp | Automatisk separat kopia | Originalmapp med backup/konfliktskydd | **A beslutat.** Nyare versionen är vald som grund. |
| Testlänkar | Inloggning/lösenord | Alla med länken kan läsa | **A valt av granskaren på ägarens uppdrag.** |
| Miljönycklar | Separata test- och livevärden | Gemensamma värden efter godkännande | **A valt av granskaren på ägarens uppdrag.** Undvik att test påverkar produktion. |
| Samarbete | En redigerar åt gången, granskat överlämnande | Samtidig redigering | **A** först. B kräver konfliktmodell. |
| Osparat utkast | Automatiskt sparat utkast | Varning före stängning och manuell Apply | **A** på sikt. B kan vara en mindre första rättning. |
| Stödda projekt | Next.js med Tailwind först | Flera ramverk och system direkt | **A beslutat.** Nuvarande Mac-paketering är för Apple Silicon; exakta Next.js/Tailwind-versioner behöver verifieras. |
| Responsiva gränser | Exakt gräns från redigerad vy | Projektets definierade brytpunkter i både vy och källa | **B rekommenderas** för teamets befintliga Tailwind-sajter, ännu obesvarat. Aldrig olika gränser i preview och sparad sajt. |
| Mallarnas gränser | Teamet anger flyttbara block och tillåtna inställningar per mall | Samma regler för alla mallar | **A.** Kunden ser bara möjliga ändringar. |
| Blogg och sidinnehåll | Sajtens befintliga CMS där det finns | Weblab CMS när CMS saknas | **Båda beslutade, i denna ordning.** Ingen tyst migrering eller byte av befintlig innehållskälla. Nuvarande kundflöde är inte verifierat. |
| Ny sidas adress | Föreslagen adress från namnet, kunden kan ändra med kontroll | Appen skapar en fast adress | **A.** Kräver skydd mot dubbletter och hantering av ändrade liveadresser. |
| Bloggpublicering | Kunden publicerar när inlägget är klart | Även tidsinställd publicering | **A** i första releasen. Schemaläggning tillför ett eget fel- och återställningsflöde. |
| Ta bort innehåll | Kunden arkiverar med möjlighet att återställa | Kunden får radera permanent | **A beslutat.** Granska påverkan på länkar före live. |
| Val av läge | Första gången appen öppnas, byt i inställningar | Endast i inställningar | **A beslutat.** Valet ändrar inte sajttillhörighet eller andra användares behörighet. |
| Sanity-publicering | Hemsidan från granskad innehållsversion | Även Sanitys publicerade dokument | **Båda valbara beslutat.** A är standard; B kräver egen granskning och separat innehållsåterställning. |
| Kundspråk | Svenska tydliga ord för spara/test/live | Engelskt utvecklarflöde | **A** för svenska kunder. |
| AI och kunddata | Godkända tjänster och tydliga datagränser | Kunden väljer valfri agent | Valbart avancerat AI-läge är beslutat. Tillåtna tjänster, kunddata och isolering återstår att avgränsa. |

### Beslut om innehållssystem och första sajtstack

Första releasen ska stödja **Next.js med Tailwind**. Blogg och mallbaserade sidor ska använda **sajtens befintliga CMS där det finns**, annars **Weblab CMS**. Ett befintligt CMS ska inte ersättas eller migreras som en bieffekt av att sajten öppnas. Ägaren har valt **Sanity** som första externa CMS. Den nuvarande adaptern stöder endast pilotkontraktet, inte alla befintliga Sanity-sajter. Kundscheman behöver godkännas och verifieras ett i taget.

Ägarens kvalitetsmål är att Weblab CMS ska vara minst lika bra som Framer och Webflow, helst bättre. Det är en ambition, inte en verifierad jämförelse eller en egenskap i dagens app. För denna release innebär ett användbart minsta bevis att kunden kan:

- Skapa, redigera och återöppna blogginlägg och mallbaserade sidor utan kod i det enkla läget.
- Arbeta med text, bilder, länkar och tillåtna blockinställningar utan att ändra själva mallen av misstag.
- Se sparade utkast och riktig förhandsvisning, granska ändringarna och publicera själv.
- Återställa tidigare fungerande innehåll och publicerad sida efter en felaktig ändring.
- Få ett tydligt fel vid konflikt eller tappad CMS-anslutning, med sitt osparade arbete bevarat.

Det befintliga CMS-läget är avstängt i den valda lokala editorscopen. Att slå på det är inte bevis för dessa flöden. Ett gemensamt kundgränssnitt behöver separata, verifierade kopplingar till externa CMS och Weblab CMS. Avancerat kod/AI-läge ska dessutom skydda samma innehåll och tidigare publicerade versioner.

## Vad måste bevisas innan appen kan kallas redo?

### För intern användning på betalda kundprojekt

1. Ett nytt installerat paket av den valda nyare versionen måste motsvara granskad källa och ha åtgärdat N-fynden. D-fynden är en separat äldre-version-lista, inte kod som automatiskt ska kopieras till den nya arkitekturen. Motsvarande felvägar ska ändå bevisas säkra i den valda versionen.
2. Befintliga kundprojekt öppnas i en separat kopia. Originalfiler, Git-index och externa filer ska förbli oförändrade under öppning, installation, preview och AI-arbete.
3. Minst tre verkliga men säkert kopierade kundprojekt inom beslutad stödd stack måste klara öppna, installera, förhandsvisa, ändra text/stil/struktur, ändra mobilvy, spara, ladda om, ångra och återöppna.
4. Samma projekt måste klara senare kollegasparning, avbrutet AI-jobb, nätavbrott, misslyckad installation, portkonflikt och partiell skrivning utan tyst arbetsförlust eller falskt sparbesked.
5. Granskad överlämning måste visa endast avsedda ändringar, bevara kollegans staged arbete och aldrig skicka kända hemliga filer. Ett repository med tidigare lokala commits ska också kontrolleras.
6. Ett **separat förbrukningsbart** repository och hostingprojekt måste bevisa att Upload, testlänk, livepublicering och avbruten publicering beter sig som skärmen säger. Ingen befintlig kundproduktion används för detta.
7. Normal kundsajtverifiering krävs före varje release: sidor och länkar, formulär, verklig mobilvy, tangentbord, delade komponenter, viktiga integrationer och fel/404. AI:s ”klar” ersätter inte dessa kontroller.
8. Ändrad källa måste klara typ- och kodkontroller, och det faktiska paketet måste genomgå installation och uppdatering på en ren mål-Mac.

### Ytterligare för kunders egen användning

Kundnivåer, isolering även för full kod/AI, sajtspecifika rättigheter, skyddade testlänkar, kundens egen granskning före live, återställning, hantering av hemliga inställningar och begripliga felmeddelanden behöver finnas. Blogg och mallbaserade produkt-/andra sidor behöver strukturerat innehåll med teamdefinierade fält, tillåtna block, validering, utkast och publicerade versioner. Mallens kod och inställningar får inte råka ändras när en kund skapar en ny sida. Bildflödet, nya sidors adresser, navigation och eventuella borttagningar behöver egna säkra flöden. Ingen av versionerna har bevisat detta fullständiga kundflöde.

En kund ska kunna slutföra en liten innehållsändring och återställa den utan att behöva förstå Git eller en terminal. Full kod/AI är nu ett uttryckligt produktval och kräver motsvarande isolering, konfliktskydd och återställning även för kunder.

## Verifiering i denna granskning

- Installerad app: paketerad kod och källkartor lästa; startsida öppnad; kodsignatur verifierad; notariseringsbiljett validerad. Detta bevisar inte att editor eller deploy fungerar.
- Fristående rättningar: 72 unika fokuserade tester i nio filer passerade, inklusive riktiga filer/Git-fixturer, hemlighetsblockering, env-isolering, Ångra-kö, misslyckade jobbs återställningsknapp, bevarat Git-index, länkad HTML-import och återkommande kontroll av deploynycklar. JavaScript-syntax och diff-whitespace kontrollerades. Separat läsgranskare hittade två env-hanteringsproblem som rättades och kontrollerades.
- Andra desktopkällan: 99 fokuserade tester passerade i åtta filer. Dessa resultat gäller dess privata kopior och native-handoff, **inte** den installerade fristående appen.
- Nyare källa: eget begränsat Ungroup-skydd klarade sju fokuserade tester och läsgranskades oberoende. Riktad lint av de två egna filerna kontrollerades separat. Granskaren hittade att Unicode-blanktecken behövde skyddas; det rättades. Paketets typkontroll misslyckades med den redan loggade korsimporteringen av hela webbklienten, saknade alias/JSX-inställningar och andra befintliga typfel. Detta är inte en godkänd releasekontroll.
- Inte verifierat: ny fristående installerare, riktig editorrunda på kundprojekt, GitHub-uppladdning, Vercel-deploy, liveåterställning, uppdatering på ren Mac och full typ/lint-kontroll av fristående ändringar.
- Typ/lint är blockerade av den installerade maskinramen: den registrerar Weblab-workspaces och en fast äldre lista för standalone-overlay, men saknar en rätt kontrollväg för ändrade `@airship/git`, `server` och `cli` samt övriga nya filer. Försök att köra fristående typkontroll stoppades eftersom kontrollvägen kräver den fasta huvudcheckouten. Projektets Biome-kontroll stoppades eftersom lint-vägen endast accepterar ESLint. Ingen spärr eller RAM-gräns kringgicks. Tillfälligt upptagen fokuslane hanterades genom att återanvända resultat och vänta med nästa riktade körning.
- Inga livesajter, konton, repo-inställningar eller produktionsnycklar ändrades. Ingen push eller deploy utfördes. Egna testprocesser och den öppnade appen avslutades.

### Kvarvarande kontrollsteg

Följande ska utföras från den fristående paketroten när en korrekt registrerad kontrollväg finns. De är inte ett uppdrag till ägaren att köra en oskyddad process.

```text
Commands: bun --filter @airship/git typecheck
          bun --filter @airship/server typecheck
          bun --filter @airshiplabs/cli typecheck
          bun --filter @airship/overlay typecheck
          bunx biome check packages/git/src/index.ts packages/git/src/index.test.ts packages/server/src/index.ts packages/server/src/undo.integration.test.ts packages/overlay/src/app.ts packages/overlay/src/chat/transcript.ts packages/overlay/src/chat/transcript.test.ts apps/cli/src/lib/exec.ts apps/cli/src/lib/exec.test.ts apps/desktop/src/upload.js apps/desktop/src/upload-safety.test.ts apps/desktop/src/upload-index.test.ts apps/desktop/src/runner.js apps/desktop/src/env-settings.js apps/desktop/src/env-settings.test.ts apps/desktop/src/import-html.js apps/desktop/src/import-html.test.ts apps/desktop/src/deploy.js apps/desktop/src/deploy-keys.test.ts apps/desktop/renderer/publish.js
Reason:   Nuvarande agent-heavy-run saknar matchande kontrollväg för denna kod.
Impact:   Källa är riktat beteendetestad men ännu inte komplett typ/lint-validerad eller paketerad.
```

Källrättningarna är ännu lokala och ej integrerade. Ungroup-skyddet ligger i den valda nyare källan; övriga rättningar ligger i standalone-versionens separata källa och ska inte förväxlas med förbättringar i den valda versionen. Huvudcheckouten är `main` med omfattande andra pågående ändringar. Den separata standalone-checkouten började vid frikopplad `1def84820`. Inget brett stage, commit, merge, push eller installerarbyte gjordes. Nästa integration behöver en känd ägare och den registrerade verifieringen.

## Teknisk evidens och ändrade filer

Fristående filer ligger under `../weblab-html-dropdown/apps/desktop-local/` från huvudcheckouten. För installerad kod ligger desktopfilerna i `app.asar/src/` och CLI-filerna i `Contents/Resources/cli/dist/`.

- D-01/02: `packages/git/src/index.ts` (`restoreFiles`, nu från rad 870), `packages/server/src/index.ts` (`undo`, rad 294), installerad `chunk-ONLFWP6D.js:919` och `index.js:5230`.
- D-03: `apps/desktop/src/upload.js:86,147,416`, `renderer/publish.js:488,684,694`, `src/publish-ipc.js:76`.
- D-04: `apps/desktop/src/runner.js:177`, `apps/cli/src/lib/exec.ts:81`; installerad CLI startade dev-subprocessen utan egen env.
- D-05: `apps/desktop/src/env-settings.js` (`readBytes`, `save`); äldre installerad `save` skrev direkt till `.env.local`.
- D-06: `packages/overlay/src/app.ts:5805`, `src/chat/transcript.ts:216`.
- D-07/08/09: `apps/desktop/src/upload.js:367`, `src/deploy.js:326,489,518`, `renderer/publish.js:562,802,834` före rättning.
- D-10/11/12: `apps/desktop/src/runner.js:80,118,156,182`; originalmapp `src/sites.js:44`.
- D-13: `apps/desktop/src/import-html.js:23,92,123`.
- D-14/15: `apps/desktop/src/deploy.js:405,421,440,444`.
- D-16: `apps/desktop/src/upload.js:379`.
- D-17/18: overlay `change-set.ts`, `structure-set.ts`, `history.ts`, `app.ts` hantering av sparresultat.
- Fokuserade tester: `packages/git/src/index.test.ts`, `packages/server/src/undo.integration.test.ts`, `packages/overlay/src/chat/transcript.test.ts`, `apps/desktop/src/upload-safety.test.ts`, `src/env-settings.test.ts`, `src/upload-index.test.ts`, `src/import-html.test.ts`, `src/deploy-keys.test.ts`, `apps/cli/src/lib/exec.test.ts`.
- Ändringarna dokumenteras som **Unreleased** i den fristående desktopappens `CHANGELOG.md`. Ingen releaseversion bumpades.

0.2.6-fynden nedan kommer från aktuell källa och oberoende läsgranskning. De är inte återgivna som GUI-reproducerade fel eller fel i ett färdigt 0.2.6-paket. Pågående andra ändringar berör nästan alla dessa filer. Enbart den tidigare rena grupp-parsern och en ny egen testfil ändrades här. Andras ändringar skrevs inte över. Integration och paketering återstår.


Publik produktbeskrivning kontrollerad: [weblab.build](https://weblab.build/). Electron kräver validerade IPC-avsändare och snäv hantering av fjärrinnehåll: [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security). Nyare eget skydd: `packages/parser/src/code-edit/group.ts` och `packages/parser/test/ungroup-safety.test.ts`.

Granskningens buggrapporter bygger på faktiskt installerad/lokal kod, inte på dessa marknadstexter eller generella råd.

Nästa avgränsade integrationssteg: [kundens frysta CMS-runtime och gemensam publicering](../notes/2026-10-02-native-cms-publishing-next.md). Dessa är granskade krav och filgränser, inte levererade funktioner.

## Native Sanity-blogg, 2026-10-02

Nästa del finns i koden: ett separat innehållsläge och ett Blogg-fönster i fullt läge. Den godkända Sanity-modellen kan läsas, få Weblab-utkast, skapa nya inlägg och arkivera/återställa utkast. Enskilda textfält, länkar och bildbeskrivningar kan ändras utan att övrig formatering, bilddata, SEO eller okända fält skrivs om. Äldre kodade webbadresser bevaras. Nya adresser har strikt validering. Kundens nya formulär och utkast sparas lokalt innan ändringen accepteras. En sen sparning behåller fortsatt skrivande; osäkra svar behåller samma begäran. Ingen Sanity-skrivning finns i den här kopplingen.

Kontroller för det första bloggflödet: 61 fokuserade fall godkända. Den riktiga Node-läsaren hämtade alla198 publicerade inlägg via sidvis läsning, med198 unika identiteter. Tre riktiga dokument kunde ändras lokalt med all annan data intakt. Originalprojektet är fortfarande rent. Fokuserad lint0 fel/696 varningar. Oberoende kodgranskning klar. De parallella cloud-typfelen rättades, och dess ansvarige slutförde den gemensamma typkontrollen utan fel den2 oktober19:47UTC. Tidigare försök stoppades av datorns minnesskydd. Nytt pågående arbete kräver egna kontroller innan det kan räknas in i dessa resultat.

Detta är fortfarande ingen färdig kundrelease. Den nya backendkopplingen är inte aktiverad och den installerade appen har inte uppdaterats. Öppna/spara/återöppna i den riktiga desktopappen är kvar att verifiera. Nya stycken, rubriker, citat och formatering finns nu i källa enligt nästa avsnitt. Bildbyte, nya länkar, formatering av markerade textdelar, mallar och godkända block är fortfarande inte färdiga. Publicering kräver fortfarande att hela sajten använder exakt det granskade innehållet, gemensamt skydd mot samtidiga publiceringar och bevisad återställning. De befintliga spärrarna för livepublicering är kvar. Inget har pushats eller ändrats live.

## Bloggförfattande och nya bekräftade rättningar,2026-10-02

Arbetsversionen har nu Lägg till stycke, val av stycke/rubrik2–4/citat samt fetstil och kursiv för en hel befintlig textdel. Befintliga listor, länkar, bilder och okända fält bevaras. Nya stycken får stabila identiteter och går att redigera direkt. Detta är ett begränsat steg mot den önskade innehållseditorn, inte ett färdigt alternativ till Framer/Webflow. Bilder, nya länkar och formatering av ett markerat texturval återstår.

| Bekräftat fel | Rättat i källa |
| --- | --- |
| Snabba formateringsväxlingar kunde ge annan ordning efter återställning | Formatering behåller sin exakta följd; visat innehåll återskapas från samma sparlogg |
| Ett återställt sparärende kunde skickas utan att höra till utkastets verkliga ändringar | Exakt ändringsprefix och sparbart resultat kontrolleras före återställning |
| En öppen stilmeny kunde ändra ett dolt innehållsutkast | Menyn stängs och redigering nekas när vyn inte är aktiv |
| För långa värden kunde accepteras lokalt men aldrig sparas | Samma maxgränser gäller före accepterad redigering; tidigare utkast bevaras |
| Nekad ändring eller felaktig återställning kallades lagringsfel | Separata besked beskriver problemet utan att felaktigt skylla på enhetens lagring |

45 fokuserade fall godkända och oberoende källgranskning klar. Slutlig gemensam typkontroll och riktad lint stoppades av minnesskyddet, båda med143. De är inte godkända kontroller. Den tidigare godkända typkontrollen gäller källan före dessa ändringar. Originalkundprojektet är fortfarande rent. Ingen server, ny installerare, aktivering, push eller Sanity-/liveändring gjordes. Verklig desktopredigering, publicering och återställning är fortsatt okontrollerade.

## Nästa betasteg, 2026-10-03

Varken installerad0.2.0 eller källversion0.2.6 är godkänd för kunders livesajter. Den nya koden har nu ett isolerat betaprofilflöde och granskad förberedelse av hela den godkända Sanity-testsajten. Innehållsläget behöver ingen dold kodeditor. Fullt läge sparar via publiceringsflödet före förberedelse. Avbrutet arbete återställs från exakt sparade bytes; ändrade utkast kräver ny förberedelse innan förhandsvisning öppnas. Fokuserade kontroller för motor15, installation21, samordning17 och hjälpare/IPC28 passerade. Riktad lint gav0 fel i båda körningarna, med2201 respektive5388 varningar.

Senaste gemensamma typkontrollen är inte godkänd: språktexternas genererade deklaration behöver förnyas. En granskad generator väntar på en snäv ändring i det ägda byggskyddet, som även behövs för rätt bildpaket och0.2.6-betabygge. Ny installerad app, faktisk bildinsamling, renderad kundkopia, inloggning, publicering och återställning hos kundens Vercel är fortfarande okontrollerade. Liveskyddet är kvar. Städningen tog enbart991933222 bytes oanvänd nedladdningscache och cachad Vercel CLI; projekt, kundkopior och inställningar behölls. [Detaljer och kvarvarande kontrollpunkter](../notes/2026-10-03-native-beta-testing.md).
