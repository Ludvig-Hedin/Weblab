# Cloud: från byggare till kund

Förslag för review, 2026-10-01. Research och källjämförelse, inte en färdig eller provkörd produkt.

## Korrigering efter produktreview, 2026-10-02

Formulärpiloten uppfyllde inte briefen. Den tekniska provningen av dess sparande är giltig, men **piloten är inte accepterad som produkt och ska inte kallas redo**.

Cloud ska öppna Weblabs befintliga visuella editor: canvas, direkt textredigering, lager, sidval, bildpanel och egenskaper. Första sajten är ett riktigt Next.js-projekt med flera sidor. Källfilerna sparas i Convex före sparbesked; den tillfälliga körmiljön visar dem och kan ersättas utan att projektet försvinner. En omstart får inte ändra beroenden eller skriva över nyare innehåll.

Det arbetet pågår bakom `WEBLAB_CLOUD_EDITOR_ENABLED`. Gamla pilotprojekt behålls som återställningskälla. Överföringen skapar ett nytt källprojekt från den sparade revisionen; osparade gamla utkast måste återvinnas i den tidigare vyn. Desktop-agenten äger fortsatt den lokala leveransen.

**Läget 2026-10-02:** riktig visuell textredigering, sparande, återöppning, ångra/gör om, responsiv textstorlek, sidbyte och flerradig text har provats i den isolerade Next.js-editorn. Byggaren har godkänt en rubrik och tilldelat kundrollen via samma canvas. Kundens hela redigeringsresa är ännu inte accepterad. Bilder/egenskaper, mallar/block, publicering/återställning och begränsad AI återstår. Sex tillfälliga testmiljöer har använts inom ägarens uttryckliga budget och alla är stoppade. Inga produktionsändringar har gjorts. Aktuell evidens finns i [QA-loggen](2026-10-01-cloud-pilot-qa.md).

## Rekommendation

Bygg en liten cloudprodukt för **EW Studio som bygger och kunden som sköter innehållet**. Kunden ändrar text, bilder och godkända egenskaper, skapar sidor från mallar och lägger till godkända block på bestämda platser. Vanliga ändringar sparas direkt utan AI. Samma regler gäller när kunden använder chatten.

Behåll desktop-arbetet som ett eget leveransspår. Återanvänd verifierade delar för sparande, innehåll och publicering. Börja med en kontrollerad Next.js-mall i cloud, inte import av godtyckliga kundprojekt. Arkivera gamla webbeditorn först när en ersättare och en väg för befintliga projekt fungerar.

## Kort roadmap

| Steg | Det användaren får | Klart först när |
| --- | --- | --- |
| 1. Ett tryggt cloudprojekt | Byggaren öppnar en Next.js-sajt, ändrar och återöppnar den utan att ha sin dator igång. | Text, bild och vald egenskap överlever omladdning och byte av körmiljö. Avbrott ger aldrig falskt sparbesked. Sparande från en äldre revision stoppas. |
| 2. Kundens byggläge | Kunden får en inbjudan och redigerar tillåtet innehåll direkt på canvas. | Kunden kan inte ändra mallkod, låsta egenskaper eller en annan kunds sajt, även via direkta anrop. Kundens och byggarens ändringar kan inte tyst skriva över varandra. |
| 3. Mallar och godkända block | Kunden skapar en sida och lägger till, flyttar eller tar bort tillåtna block. | Mobilvy, länkar, sidadress och återställning fungerar. Ändringar i en mall förstör inte befintliga sidor. |
| 4. Förhandsvisa och publicera | Kunden eller byggaren granskar en version, publicerar och kan gå tillbaka. | Den granskade versionen är den som går live. Misslyckad publicering lämnar tidigare liveversion kvar. Återställning omfattar både kod och innehåll. |
| 5. Begränsad AI och samarbete | Chatten kan göra samma tillåtna ändringar. Kollegor ser varandra och kan samarbeta. | AI kan inte kringgå rättigheter. Samtidiga ändringar skrivs aldrig över tyst. Börja med synlig närvaro och en redigerare per sida, utöka därefter. |
| 6. Lokal → cloud | Byggaren kan föra över ett projekt som stöds till cloud och lämna över till kunden. | En granskad överföring bevarar innehåll och bilder. Rättigheter tilldelas uttryckligen i cloud. Tvåvägssynk och offlinekonflikter får ett separat senare steg. |

Ordningen är ett förslag. Ingen tidsuppskattning innan ett litet end-to-end-experiment har visat vad som verkligen kan återanvändas.

## Tre enkla roller

EW Studio tilldelar roller per sajt. Förslaget är tre kundnära roller ovanpå befintliga medlemskap, inte ett automatiskt byte av alla gamla kontoroller.

| Roll | Får göra |
| --- | --- |
| Ansvarig | Hantera sajtens personer, roller och publiceringsrätt samt allt nedan. |
| Designer/utvecklare | Ändra design, mallar, komponenter och kod på tilldelad sajt. Kan ges till teknisk personal hos kunden. Får inte ge sig själv fler rättigheter. |
| Innehållsredaktör | Ändra godkänd text, bilder, CMS och egenskaper samt skapa sidor från godkända mallar. Block endast där byggaren tillåter. |

**Får publicera** är ett separat val per användare och sajt. Kunden får publicera själv efter förhandsvisning när EW Studio gett rättigheten. Den omfattar inte rollhantering. Alla roller använder samma versions- och återställningsskydd. En teknisk kund kan använda den enkla vyn utan att förlora sin beviljade roll; att byta vy ger aldrig fler rättigheter.

## Tre versioner, olika styrkor

| | Minimal fristående desktop | Nyare desktop | Legacy webbapp |
| --- | --- | --- | --- |
| Upplevelse | Liten visuell editor för lokala sajter | Begränsad variant av den större editorn | Många paneler och arbetsflöden |
| Grund | Electron och egen TypeScript-overlay | Electron laddar React/Next.js-editorn | Samma React/Next.js-familj som nyare desktop |
| Visuellt sparande | Utkast skickas till AI som ändrar koden | Vanliga ändringar kan skrivas direkt, med skydd och kvarvarande fel | Direkt källredigering finns, men kräver stabilare körmiljö och verifiering |
| Lokal kod | Arbetar mot originalmappen i den granskade fristående linjen | Privat arbetskopia och granskad överlämning | Molnprojekt, ingen lokal mapp krävs i avsett flöde |
| Innehåll och samarbete | Inte färdigt kundflöde | CMS, medlemmar och flera andra funktioner är avstängda i nuvarande editorscope | Kod för CMS, komponenter, roller, kommentarer och närvaro finns. Det bevisar inte fungerande kundflöden |
| Publicering | GitHub Upload och Vercel-flöden finns i källan | Nya skydd och releaser under aktivt arbete | Äldre publicerings- och hostingdelar är delvis spärrade eller ofullständiga |
| Ta med till cloud | Enkelhet och tydliga visuella val | Sparande, konfliktskydd och kommande innehålls-/releasearbete efter verifiering | Konton, arbetsytor, medlemskap, CMS- och komponentdelar efter kontroll |

Alla använder JavaScript/TypeScript. Inget generellt språkbyte behövs. Egen overlay och React-editor har däremot olika struktur, så komponenter kan inte antas vara direkt utbytbara. Legacy webb och nyare desktop är inte två helt oberoende kodbaser.

## Det som måste byggas eller bevisas

- **Beständigt projekt:** kodversion, innehåll och bilder lagras utanför den tillfälliga körmiljön. Preview återskapas från en känd version. En sparad fil i en sandbox räcker inte som hållbart sparande.
- **En tydlig innehållskälla:** för pilotmallen sparas kundens ändringar som validerat innehåll och blockegenskaper som Next.js-sajten läser. Mallkod ändras separat av byggaren. Undvik att varje kundändring kräver omskrivning av godtycklig JSX.
- **Äkta kundrättigheter:** behåll befintliga sajtmedlemskap, men komplettera breda projektroller med tillåtna handlingar, fält, mallar och block. Kontrollera dem på servern vid varje ändring, även AI och publicering. Ett dolt reglage eller byte av UI-läge är inget skydd.
- **Mallkontrakt:** stabila block-ID:n, typade egenskaper, tillåtna placeringar och versionsbundna mallar. Kunden får skapa instanser, inte ändra originaldesignen. Återanvänd befintliga komponentverktyg först efter att dessa regler kan bevisas.
- **Utkast och live:** separata versioner, kontrollerade bildreferenser, sparstatus, konflikter och återställning. En release binder exakt mall/kodversion, innehållsversion och de bilder/filer som behövs. Ändring av utkast får inte ändra live. Aktuella åtkomsträttigheter ligger separat; återställning får aldrig återge indragen åtkomst.
- **Cloudpublicering:** börja med en hostingväg. Desktop-agentens lokala releasearbete är ett möjligt återbruk, inte automatiskt en fungerande molnrelease. Driftsättning av Weblab på Railway och hosting av kundernas sajter är skilda saker.
- **Samarbete:** närvaro är inte konfliktlösning. Pilotförslag: serverkontrollerad redigeringsrätt per sida, utgångstid och revisionskontroll även vid sparande. Hantera bruten anslutning och återanslutning innan samtidig fri redigering.
- **AI:** anropa samma begränsade innehållsverktyg som formulären. Kundagenten får inte fri terminal, råa filskrivningar eller mallredigering som genväg. En prompt med regler ersätter inte kontrollen.
- **Överföring:** välj först en tydlig cloudversion som blir gemensam källa. Desktop Upload är i dag Git-push, inte Weblab-cloudsynk. Import av befintliga sajter kräver uttrycklig mappning till stödda mallar/innehåll, inte ett löfte om att all Next.js-kod blir kundredigerbar.

Första experimentet ska bevisa en mall, en byggare och en kund: bjud in → ändra rubrik och bild → skapa mallsida → återöppna → förhandsvisa → publicera till ett separat testmål → återställ. Publiceringssteget kräver godkänd testmiljö innan det utförs. Inga nya betalade tjänster eller produktionsändringar ingår i detta arbete.

## Samordning med desktop-arbetet

Agent Mail-projekt: `/projects/weblab`. Denna research/pilot: **AmberBasin**. Aktiv desktop-agent: **WhiteGorge**, registrerad för nyare desktop, säkert sparande, CMS och publicering. Start, kontrakt och handoff med typkontrollens fynd har skickats i `cloud-build-roadmap-2026-10-01` (senast meddelande 19); svar inväntas. Samordning är kontaktad, inte bekräftad.

Agentens aktiva filreservationer visar arbete med native-säkerhet, parser/editor, utkast, innehållsrevisioner och frysta releases. Aktuell källkod i `cmsItems` har redan fältvalidering, revisionskontroll och separat publiceringskontroll; `cmsReleases.freeze` skapar en oföränderlig snapshot av inbyggt CMS och avvisar externa CMS. Dessa områden motsvarar flera av jämförelsens viktigaste behov. Statusen är pågående arbete, inte provkörda färdiga funktioner. Den första researchdelen ändrade bara detta dokument. Efter klartecken tillkom ovanstående isolerade pilot, utan att aktivera gamla cloudspärrar.

Piloten har egna nya filer och återanvänder desktop-spårets pågående CMS-revisioner utan att ändra dem. Delad schema-/CMS-kod är ännu ocommittat kollegaarbete i arbetskopian. Piloten får därför inte landas eller driftsättas som en fristående ändring utan dessa beroenden. Före nästa steg behöver projekt-/sid-/block-ID:n, innehållsschemats version, bildreferenser och release-ID stämmas av.

| Behov från jämförelsen | Ansvar nu | Cloud behöver dessutom |
| --- | --- | --- |
| Tillförlitlig ändring, ångra och konflikter | Desktop-agentens parser/editor-arbete | Sparande som överlever förlorad sandbox och serverstyrda samtidiga skrivningar |
| Utkast och innehållsversioner | Desktop-agentens CMS-arbete | Begränsad kundbehörighet, mall- och blockmodell |
| Granskad release och återställning | Desktop-agentens releasearbete | Publicering från cloud utan användarens dator |
| Konton och kundöverlämning | Befintlig webbkod som grund | Fungerande inbjudan och faktisk begränsning av kundens ändringar |
| Fristående desktop | Ingår i jämförelsen | Ingen separat portering av hela editorn rekommenderas nu |

## Vad användarrecensionerna säger

Detta är kvalitativa signaler från ett litet urval, inte en representativ kundundersökning eller verifierade aktuella produktfel.

- **Webflow:** designfrihet uppskattas, men inlärning och prismodell kan bli hinder. [Gartner-användarrecensioner](https://www.gartner.com/reviews/market/design-collaboration-tools/vendor/webflow/product/webflow).
- **Framer:** snabb visuell produktion uppskattas; mer komplexa innehållsflöden och kostnader får kritik. [G2-användarrecensioner](https://www.g2.com/products/framer/reviews).
- **Wix Studio:** användare beskriver både nyttan av visuellt byggande och frustration över migration, komplexitet och begränsningar. [G2-användarrecensioner](https://www.g2.com/products/wix-studio/reviews?page=4&qs=pros-and-cons).
- **Duda:** en recensent beskriver oväntad ändring av textstil vid vanlig textredigering. Det stödjer att testa vardagsändringar, inte bara avancerade funktioner. [G2-användarrecension](https://www.g2.com/products/duda/reviews?hsctatracking=d9f5895d-3d59-428b-b636-644ec762bb63%25257C692245a2-7aa3-4ad7-bf42-4bb426567742&page=3).

Webflows egna beskrivningar av [mallar, slots och byggläge](https://help.webflow.com/hc/en-us/articles/33961210206483-Page-building) samt [roller och AI inom rollgränser](https://help.webflow.com/hc/en-us/articles/46651804072467-Create-and-manage-custom-roles) visar att idén redan används. Vår möjliga fördel är ett enkelt kundflöde på riktig Next.js-kod, med tydligt ägande och pålitliga ändringar. Det är en hypotes att pröva med kunder, inte ett bevisat marknadsövertag.

## Bekräftat och kvar för review

- **Publicering, bekräftat:** kunden kan publicera efter förhandsvisning om byggaren gett den rättigheten, med möjlighet att återställa.
- **Roller, riktningen bekräftad:** EW Studio bestämmer. Tekniska kunder kan få större frihet. Exakt tre rollnamn och ansvar enligt tabellen ovan är vårt förslag.
- **Block:** rekommendation är godkända block i godkända platser, inte fri layout. Text/bilder/egenskaper och mallsidor är bekräftad önskan; blockreglerna är ännu förslag.
- **Lokal/cloud, bekräftat:** en gemensam cloudversion som fungerar utan byggarens dator kommer först. Tvåvägssynk skjuts upp. Cloudspåret behöver inte vänta på hela desktop-releasen, men delade kontrakt ska samordnas.

## Källor i projektet och gränser

- [Tidigare jämförande desktop-audit](../audits/desktop-client-readiness-2026-10-01.md). Installerad 0.2.0 verifierades där, inte på nytt i denna research. Fristående källversion är 0.2.1 under `../weblab-html-dropdown/apps/desktop-local/apps/desktop`.
- `apps/desktop/main.js`: nyare shell laddar webbeditorn. `apps/web/client/src/lib/editor-scope.ts`: funktioner är globalt avstängda i aktuell källa, inte ett färdigt kundläge.
- `apps/web/client/src/components/store/editor/code/index.ts` och `sandbox/index.ts`: direkt källskrivning respektive lokal filmodell. Den senare är inte desktop/cloudsynk.
- `apps/web/client/convex/projectActions.ts`: molnskapande spärrat i aktuell källa. [Backloggen](../../BACKLOG.md) beskriver att spärrar inte säkert motsvarar driftsatt backend. Livebeteende är inte kontrollerat här.
- `packages/auth/src/capabilities.ts`, `matrices.ts` och `apps/web/client/convex/lib/permissions.ts`: befintliga projektbehörigheter är användbar grund, men inget kontrakt för tillåtna kundfält eller block.
- `apps/web/client/convex/lib/hostingFactory.ts`: flera äldre hostingadaptrar saknar fungerande implementation. [Funktionskatalogen](../feature-catalog.md): komponenter F-788, CMS F-380–392, publicering F-209.

Researchdelen följdes av den avgränsade implementationen ovan. Ingen publicering eller produktionsändring ingår. Befintlig kod och pågående ändringar är inte bevis för en felfri kundprodukt.

## Verifiering av första källimplementationen

- 31 riktade Bun-tester passerar: 15 för innehåll/behörigheter/CMS-referenser och sparande, 16 för utkast/återställning och renderad mall. Handler-tester använder den riktiga behörighetskoden med en minnesdatabas; de bevisar inte riktiga Convex-transaktioner, deploy eller webbläsarinloggning.
- Riktad frontend-lint är ren efter rättningarna. Projektets lintkonfiguration undantar Convex-filerna; backend har därför handler-tester och källgranskning, inte ett påstått backend-lintresultat.
- Den genomförda app-typkontrollen gav 60 fel, varav ett nytt API-typimportfel rättades. Övriga fynd ligger i pågående desktop/CMS/native/parser-kod och har skickats till desktop-agenten. Försöken att köra om efter rättningen avbröts med kod 143 utan diagnostik. Slutlig typkontroll är alltså **inte klar**.
- Oberoende kodgranskning: bakåtnavigering och byte av inloggat konto rättades. Inga kvarvarande konkreta blockerare hittades i den granskade pilotkoden.
- Webbläsarprovning, två konton, avbrott/återanslutning och faktisk sparning i en godkänd cloudmiljö återstår. Projektets regel förbjuder att starta devserver i automation, och ingen matchande server har använts. Ingen produktionsmiljö ändrades.
- Piloten ligger i den delade arbetskopian och är inte en separat commit: den använder kollegans pågående CMS-revisionskontrakt. Ingen publik changelog-annons görs innan funktionen är provad och aktiverad.
