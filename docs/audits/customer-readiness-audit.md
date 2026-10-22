# Weblab: intern demo och kundberedskap

Granskad 2026-10-15. Lokal källa, installerad Mac-app och publik webb jämförs separat. Ingen appkod ändrad, inget publicerat.

Senare uppföljning samma dag: [Magma/Endra, vanliga redigeringsfel och Weblab + 8pixel](../notes/2026-10-15-basic-editing-customer-sites.md). Den uppföljningen innehåller flera granskade lokala rättningar. Typkontroller och fokuserade tester passerar. Magmas riktiga privata kopia renderar och ansluter via bryggan; full redigera/spara/återöppna i leveranspaketet är fortfarande inte godkänd. Den ursprungliga granskningen nedan är en tidigare ögonblicksbild.

## 1. Dom

**Inte verifierad för demo ännu. En guidad intern arbetsdemo är rimlig efter en repetition i exakt valt paket. Inte redo för självständig kundanvändning eller säker leverans av godtyckliga kundhemsidor.**

Det finns verklig produkt här. Problemet är att fungerande delar, nya källändringar och en putsad marknadsbild ännu inte bildar ett bevisat sammanhängande arbetsflöde.

| Användning | Dom | Villkor |
| --- | --- | --- |
| Guidad intern arbetsdemo | Ja, efter repetition | En förberedd stödd sajt, exakt paket och tydligt avgränsade funktioner |
| Fri intern testning | Inte godkänd av denna granskning | Spara, återöppna och felåterhämtning i samma paket återstår |
| Byråarbete på separat kundkopia | Möjligt avgränsat pilotspår | Designer granskar diff och ansvarar för vanlig extern leverans |
| Kunden redigerar och publicerar själv | Nej | Inträde, återöppning, publicering och återställning saknar sammanhängande acceptans |
| Allmän betald webbbyggare | Nej | Kompatibilitet, leverans och faktisk AI-output är för smalt bevisade |

## 2. Vad som faktiskt granskades

- Aktuell smutsig `main`, 39 commits före och 171 efter lokal `origin/main` vid start. Ingen fetch gjordes, så detta är ingen färsk fjärrstatus.
- Installerad `/Applications/Weblab.app`: version **0.2.0**, startade till Sites och visade befintliga projekt. Inget kundprojekt öppnades eller ändrades.
- Källans desktopmanifest: **0.2.6**. Inget nytt paket byggdes eller startades. Versionsnumren identifierar paket, inte exakt laddad frontend eller funktionsuppsättning. Innehållet i den installerade editorn fastställdes inte; bara Sites-vyn öppnades.
- Publika `https://weblab.build/` och `/sign-in`, samt `/projects` som omdirigerar till inloggning. Desktop 1440×900 och mobil 375×812. Skärmbilder kan tillfälligt ligga efter DOM under animation; tomma mellanbilder räknas inte som produktfel.
- Startsida, nedladdningslänk, bildanrop, publikt inloggningsläge, källans editorgränser, AI/import/export och leveransskydd.
- Tre oberoende läsgranskningar av redigering/återhämtning, kundinträde/publicering och AI-output. Inga externa provideranrop, nya konton, meddelanden, kostnader eller produktionsändringar.

**Bevisnivåer:** direkt observerat nu, verifierat i aktuell källa, tidigare dokumenterat runtimebevis, respektive otestat. De blandas inte ihop.

## 3. Tre användares resa

| Person | Trolig reaktion | Bevisgräns |
| --- | --- | --- |
| Designer som visar en förberedd sajt | Fortsätter om urval och ändring svarar direkt | Installerad start observerad; senaste kompletta redigeringsresa inte körd |
| Stressad byrådesigner med befintlig kundsajt | Tvekar när sajten visas men vanliga stilar inte får sparas | Aktuella källskydd kräver en smal källa/Tailwindprofil |
| Kund som vill ändra innehåll och gå live | Riskerar stopp vid konto, behörighet eller publicering | Källvillkor och dokumenterade acceptansluckor; ingen ny kundresa körd |

## 4. Täckning

| Yta | Status | Rekommendation |
| --- | --- | --- |
| Publik startsida | Öppnad på desktop/mobil | Behåll grundformen, rätta bildfel och begränsa löften |
| Installerad Sites-vy | Öppnad | Skilj dess paket från nyare källa |
| Ny sajt i installerad app | Inte slutförd | Native-automationens dialog hade instabil exponering; inget knappfel fastställs |
| Senaste lokala visuella editor | Källgranskad, inte körd | Repetera i ett exakt paket innan demo |
| Kundinbjudan/inloggning | Publikt läge observerat, scoped entry källgranskad | Testa med en verklig avsedd testidentitet |
| Importerad sajt/text/bild/Studio | Separata källfunktioner, olika spärrar | Demonstrera endast accepterat delsteg |
| AI/wireframes/Figma | Källgranskad | Visa inte som färdig sajtproduktion |
| Publicering/rollback | Källgranskad och tidigare bevis lästa | Håll utanför demo tills avgränsad ansluten acceptans finns |
| Betalning, full tillgänglighet, prestanda | Inte granskade | Ingen dom om dessa delar |

## 5. Styrkor att behålla

- Visuell redigering av riktig källa är ett tydligt och relevant värde för en designer.
- Mörk, återhållsam grund och tydlig huvudsaklig handling. Publika mobilens dokumentbredd var 375px utan horisontell överflytning i kontrollerade lägen.
- Källan vägrar flera osäkra redigeringar i stället för att skriva över dynamisk kod. Det begränsar produkten men är rätt skydd.
- Tidigare riktig betasession skapade en privat Cyklande-kopia och visade kundsidan. Bloggutkast sparades, arkiverades, återställdes och återöppnades genom UI. Det är verkligt men begränsat bevis, [acceptansanteckningar](../notes/2026-10-03-native-beta-testing.md:11).
- Nedladdningslänken svarade HTTP 200 efter omdirigering. Installerarens innehåll eller funktion kontrollerades inte.

## 6. Prioriterade fynd

### P1: Välj en faktisk produktversion innan ni säger att demon fungerar

**Direkt observerat:** installerad app är 0.2.0. Aktuellt [desktopmanifest](../../apps/desktop/package.json:3) är 0.2.6. Ingen lokal utvecklingsserver hittades på de vanliga portarna. Root- och parserberoenden saknas i denna checkout.

Två fokuserade parserfiler gick inte ens att ladda. Det visar en lokal miljölucka, inte två bevisade logikfel. Den nyare koden är därför inte runtimegodkänd här. Minsta steg är att välja ett exakt paket och återanvända eller återställa dess stödda körmiljö, sedan repetera resan.

### P1: Det viktigaste förtroendelöftet saknar paketerat helhetsbevis

**Tidigare runtimefel:** betaprojektet kunde inte laddas; Retry/Reload hjälpte inte. Quit/reopen återställde projektlistan, men återöppning av kundkopian förblev okontrollerad. Förberedelse vägrade också på grund av en instrumenterings-/historiekonflikt. En reparation finns i källan, men var inte aktiverad i testpaketet. Se [betanoter](../notes/2026-10-03-native-beta-testing.md:15).

**Aktuell lucka, inte ny datatappsbugg:** spara, undo/redo, sidbyte, appstängning och återhämtning efter misslyckad skrivning behöver provas tillsammans i det valda paketet. Källan har många nya skydd. [Känd acceptanspunkt](../../BACKLOG.md#mounted-desktop-buffers-still-need-protection-across-page-exits).

### P1: Riktiga kundhemsidor stöds betydligt smalare än marknadsföringen antyder

**Aktuell källa:** statisk HTML kan inte få visuella stiländringar sparade. Next-stilar kräver en inkopplad Tailwind v4 App Router-stilmall. Dynamiska `className` och vissa prop-spreads vägras. Se [skrivskydd](../../apps/web/client/src/components/store/editor/code/index.ts:201) och [parser](../../packages/parser/src/code-edit/style.ts:8).

Den nya molnimportens förberedda profil kräver exakt Next16.3.1/Bun1.3.11 och snäva scripts/configs. Det är en separat, smal profil, inte ett globalt krav på alla lokala sajter. [Profil](../../apps/web/client/convex/lib/cloudImportedNextProfile.ts:159).

**Observerad offentlig text:** startsidans FAQ säger att valfri lokalt körbar sajt fungerar, inklusive Vite, Remix, Astro, Rails och HTML. Att kunna visa en sajt är inte samma sak som att säkert kunna redigera dess utseende. Detta är en överdriven kompatibilitetsförväntan.

### P1: Redigera → publicera → återställ är inte en bevisad kundleverans

**Aktuell källa:** native livepublicering vägras utan gemensam publiceringssamordning; CMS-sajter vägras utan granskat innehållssnapshot. [Service](../../apps/desktop/release/service.js:44).

Den nya molnsamordnaren accepterar bara `*.vercel.app`, inte kundens vanliga domän. [Destinationspolicy](../../apps/web/client/convex/lib/cloudReleasePolicy.ts:8). Äldre domänpaneler är en annan väg och bevisar inte stöd i denna nya väg.

**Dokumenterad lucka:** riktiga kundkontroller för granskning/publicering/rollback och återställd canvas är fortfarande öppna. Lokala monterade tester använder syntetiska tjänstesvar. [Senaste checkpoint](../agent-context/current-progress.md:13). Ingen aktuell produktionskonfiguration kontrollerades här.

### P1: AI-outputens kvalitet är inte bevisad

**Aktuell källa:** de äldre molnvägarna för promptskapande, webbklon och Figma stängs av innan provisionering via [projektspärren](../../apps/web/client/convex/projectActions.ts:85). Detta innebär inte att all lokal CLI-AI saknas.

Figma-scaffolden skapar tomma färgade rutor, inte en trogen designöversättning. [Scaffold](../../packages/figma/src/scaffold.ts:13). Wireframes har ett verkligt block-/schemasystem men använder platshållare och `href="#"`; deras kodexport är spärrad. [Hero](../../packages/wireframe-blocks/src/blocks/hero-1.tsx:29), [export](../../apps/web/client/convex/wireframeEmit.ts:32).

Molnagenten har designinstruktioner och komponentkatalog, medan lokal desktop-CLI får en kortare kontext. Prompttester bevisar att instruktionerna finns, inte att sidorna blir bra. Inga nya sajter genererades i denna granskning. Halcyon på startsidan är en marknadsillustration, inte bevis på dagens AI-output.

### P2: Gränssnittet säljer en bredare produkt än den nya lokala editorn tillåter

**Aktuell källa:** vanliga paneler för AI, CMS, komponenter, bildbyte, versionshistorik och delning är avstängda i den lokala editorns [scope](../../apps/web/client/src/lib/editor-scope.ts:10). Separata native-AI/bloggflöden finns, så detta är inte ett påstående att AI/CMS saknas överallt.

**Designbedömning:** Halcyon-bilden ser putsad ut men visar Design/Code/CMS, samarbete och Publish samtidigt. Den skapar större förväntningar än den avgränsade arbetsprodukten kan försvara. Behåll formspråket, visa ett riktigt accepterat arbetsflöde i stället.

### P2: Nytt reproducerat livefel i startsidans bilder

**Direkt observerat två gånger:** optimerade `ivory.webp`, `sky.webp` och `sand.webp` misslyckades vid olika desktop-/mobilstorlekar. Exempel:

`/_next/image?url=%2Fassets%2Flanding%2Ffeature-backdrops%2Fivory.webp&w=1920&q=75`

HTTP400, svar `The requested resource isn't a valid image.` Samma originalfil `/assets/landing/feature-backdrops/ivory.webp` svarade HTTP200 `image/webp`. Felet är i den serverade optimeringsvägen; exakt orsak är inte fastställd. Fallbackytor gör att allt inte ser trasigt ut, men bildlagret saknas och anrop ger fel.

Skärmbild efter stabilisering: [live mobil](</Users/ludvighedin/.t3/userdata/browser-artifacts/browser-screenshot-weblab-build-mv9sb8tm-f29b8d04.png>). Källa som använder optimeringen: [FeatureBackdrop](../../apps/web/client/src/app/_components/landing-page/feature-backdrop.tsx:36).

## 7. UX, typografi och belastning

Utseendets grund är tillräckligt bra för en arbetsdemo. Den publika startsidan har tydlig rubrik och nedladdning; installerade Sites är enkel och lugn. Största bristen är inte fler skuggor eller bättre hörnradier, utan att användaren behöver förstå vilka funktioner/versioner som faktiskt gäller.

Halcyon visar en generisk SaaS-sajt med generisk statistik, påhittad social proof och standardspråk. Det ger en putsad referens men bevisar varken kundanpassning eller kvalitet i genererad svensk kundcopy. Detta är en bedömning av marknadsexemplet, inte en mätning av aktuell generator.

Layout: mobilbredd kontrollerad. Writing: kompatibilitetslöftet behöver snävas in. Typografi/polish: grundhierarki visuellt granskad. Tillgänglighet: ingen full tangentbordsresa, kontrastmätning eller hjälpmedelsgranskning genomförd; inget tillgänglighetsgodkännande ges.

## 8. Vad som är produktvärde och vad som bör vänta

Behåll val av riktigt element, text/stilredigering, riktig källa och tydlig återställning. Gör dessa pålitliga tillsammans innan ytterligare ytor öppnas. Bildbyte, inbjudningar, CMS och publicering är viktiga kundjobb, men bör inte användas som demofyllnad innan respektive resa är accepterad.

## 9. Differentiering

En designer kan arbeta i den befintliga sajten och lämna riktig kod vidare. Det är den tydligaste styrkan. Ingen konkurrentbenchmark genomfördes och inget stöd finns här för ett generellt bäst-på-marknaden-påstående.

## 10. Ärlig positionering

Rekommendation: **En visuell arbetsyta för designers som gör avgränsade ändringar i befintliga Next/Tailwind-sajter och lämnar vidare riktig kod.**

Efter tio sekunder säger marknadsbilden snarare komplett AI-webbbyggare. Efter källgranskningen är det avgränsade designerverktyget mer trovärdigt. Detta är en bedömning, inte en genomförd användarintervju.

## 11. Drift och kommersiell beredskap

Publika `/projects` ledde till `/sign-in`. E-postfält och fortsättningsknapp var inaktiva med uttryckligt invite-only-besked. Detta är avsiktligt publikt läge, inte ett konstaterat authfel. Nya scoped invitations använder sign-in, inte full nykontoregistrering. Korrekt privat Clerk-/Convexkonfiguration och verkligt kundinträde återstår enligt senaste noterna.

Ingen aktuell driftlogg, prisplan, betalning, supportberedskap eller produktionsbehörighet kontrollerades. En granskning av lokala flaggor säger inte vilka funktioner som är driftsatta.

## 12. Krav före demo respektive kund

**Före intern demo:** välj exakt paket och sajt. Kör välj element → textändring → stiländring → spara → reload → undo/redo → stäng → öppna igen. Visa inte spontan import eller livepublicering som fungerande. Förbered en inspelning av samma verifierade resa som reserv.

**Före kundpilot:** upprepa på en verklig separat kundkopia med text, bild, mobilvy och faktiskt kundkonto. Bevisa felåterhämtning. Redovisa tillåtna stackar och vilka kundjobb som ännu kräver designer.

**Före kundproduktion:** bevisa godkänd version → publicering → rätt domän → återställning, med rätt innehåll och behörigheter, på uttryckligen godkänd testdestination.

## 13. Ändringar och kontroller i denna granskning

Ingen appkod ändrad. Rapport och ett nytt bildfel i BACKLOG dokumenteras; auditindex uppdateras.

Fokuserad kontroll: `agent-heavy-run weblab-focused-test bun test packages/parser/test/style.test.ts packages/parser/test/ungroup-safety.test.ts` gav exit1, 0pass/2laddningsfel. `@babel/standalone` och `@weblab/models/actions` kunde inte hittas. `node_modules` saknas vid root/parser/web-client. Ingen installation gjordes i den delade checkouten. Ingen full svit, build, lint eller typecheck kördes.

Appen som öppnades för granskningen avslutades normalt. Ingen devserver startades av granskningen. Browserlease släpptes. Inget stage, commit, push eller deploy.

## 14. Rekommendationer som inte implementerades

1. Ett paket och en obruten demoresa före ytterligare funktionsarbete.
2. En kompatibilitetslista som skiljer visa, visuellt redigera och leverera.
3. Tre verkliga briefs som outputprov: svenskt tjänsteföretag, innehållssajt och befintlig designsajt. Bedöm copy, verkliga länkar/formulär, mobil, bilder och byggbar leverans. Kräver separat avgränsad generering, inte bara promptgranskning.
4. Rätta och verifiera startsidans optimerade bilder i driftsmiljön.

## 15. Kvarvarande okända saker

Hur ofta sparning faktiskt tappar eller stoppar arbete i senaste paketet; faktisk kundinträdesgrad; outputkvalitet på nya briefs; riktiga formulär/SEO/prestanda i levererade sajter; publicerings- och återställningstid. Dessa är okända, inte konstaterade fel.

## 16. Nästa prioritet

**Bevisa en liten komplett produkt innan ni visar en stor halvfärdig.** För den här demon är valet av paket, spara/återöppna och en ärlig avgränsning viktigare än fler paneler eller kosmetisk puts.
