# Cloud-pilot: egen provning 2026-10-01

**Retired 2026-10-02:** owner-requested cleanup deleted the mistakenly work-account Convex project and stopped the isolated Railway frontend. Historical URLs below are no longer live. Source and verified local export are retained. Future target is only the owner-confirmed private `ludvighedin15/weblab/avid-gnat-539`, currently inaccessible to CLI/MCP authentication.

Status 2026-10-02: **produktacceptans återkallad**. Användaren avvisade formulärpiloten eftersom den saknade Weblabs visuella editor. Kontrollerna nedan visar endast att det gamla formulärets sparande och åtkomst fungerade. De bevisar inte en färdig cloudeditor. Omtaget och dess kvarvarande steg finns i `2026-10-01-cloud-build-roadmap.md`.

## Uppföljning: riktiga konton och cloudlagring

Den tidigare lokala simuleringen nedan har kompletterats med riktig Clerk-inloggning och Convex-transaktioner. Separat projekt `weblab-cloud-pilot`, deployment `accomplished-grouse-400`, innehåller bara pilotens testdata. Den befintliga webbappens backend och produktion ändrades inte.

- Två särskilda Clerk-testkonton skapades. Riktiga signerade sessioner används, inte påhittad identitet eller adminbehörighet.
- Sex direkta acceptanskontroller godkändes: skapa/öppna samma pilot, spara och läsa från annan session, neka obehörig och anonym, avvisa ogiltigt innehåll utan skrivning samt två samtidiga sparningar med exakt en vinnare och en konflikt.
- Den riktiga Next-appen kördes mot denna backend. Ett automatiserat webbläsarflöde med två separata webbläsarsessioner godkändes: inloggning, sparande, återöppning, konflikt, omladdning med bevarat utkast, kasta eget utkast och hämta senaste, samt kontobyte utan läckta privata utkast.
- Ett verkligt avbrott i testflikens anslutning visade frånkopplat läge och stoppade nya sparningar. Text gick att fortsätta skriva och sparades efter återanslutning. Ingen nätverksinställning för datorn ändrades.
- Pilotens riktiga avstängningsreglage provades: sparat innehåll förblev läsbart, medan servern nekade skrivning. Reglaget är åter aktiverat.
- Mobilbredd 390 px och desktop provades. Ingen horisontell sidscroll.
- Arkiverade CMS-poster avvisas nu innan läsning eller skrivning, även `archivedAt: 0`. Riktade handler- och history-tester godkända, 21 tester. Isolerad backends typkontroll och driftsättning godkända efter rättningen.
- Tre smala rättningar i parallella CMS/history-filer samordnades med desktop-agenten och granskades separat. De ändrar källtypskontroll, antal i översatta texter och en testfixtur. Den delade appens sista typkontroll samordnas fortfarande med ägaren till publiceringsarbetet.

[Desktop, riktig cloudbackend](/Users/ludvighedin/Programming/personal/AB/weblab-cloud-pilot-test/browser-results/live-cloud-desktop.png) · [Mobil, riktig cloudbackend](/Users/ludvighedin/Programming/personal/AB/weblab-cloud-pilot-test/browser-results/live-cloud-mobile.png)

Webbtestmiljön använder en tom Railway-miljö och en separat tjänst `cloud-pilot`. Byggunderlaget är rent versionshanterat basläge plus pilotfilerna, inte hela den delade arbetskopian. Endast Clerk-testnycklar och den isolerade backendadressen är konfigurerade. Ingen AI, betalning, sandbox, kundpublicering eller produktionswebhook har kopplats in. Produktionsbyggets kompilering och typkontroll är godkända. Railway-deployment `cac940c1-a0ec-4e05-afa4-cd808a06dff0` har status SUCCESS. En felkopplad port i testadressens första konfiguration rättades till tjänstens faktiska port 8080. Hälsokontrollen svarar 200.

## Testadressen: slutlig acceptans

Öppna [cloud-piloten](https://cloud-pilot-cloud-pilot.up.railway.app/projects), logga in och välj **Cloud pilot** i arbetsytans projektlista. Varje byggare kan skapa en pilot i sin arbetsyta. Använd egna testprojekt, inte kunddata.

På den driftsatta adressen provades den riktiga e-postinloggningen med två testkonton. Befintlig pilot öppnades via projektlistan, en ändring sparades och återlästes i en ny flik. En konkurrerande sparning visade konflikt, behöll det lokala utkastet och spärrade sparknappen. Knappen för att kasta det egna utkastet hämtade senaste versionen. Efter kontobyte nekades tillgång till det första kontots projekt. Det andra kontot skapade därefter en egen pilot via formuläret, sparade innehåll och återöppnade det. Inga konsolfel observerades i dessa pilotflöden.

[Bild från den driftsatta piloten](/Users/ludvighedin/.t3/userdata/browser-artifacts/browser-screenshot-cloud-pilot-cloud-pilot-up-railway-app-muq12vgo-0234a65f.png)

### Kvar utanför den interna piloten

- Kundroller med låsta fält, godkända sidmallar/block, uppladdade bilder, publicering och återställning av en live-sajt är nästa produktsteg.
- Testadressen innehåller även äldre webbappsskärmar. Endast **Cloud pilot** är godkänd här; gamla AI-/sandbox-/publiceringsflöden saknar tjänstenycklar i testmiljön.
- Två separata webbläsarsessioner är provade, inte två fysiska datorer. Stängda lokala dev-servrar hindrar inte den driftsatta piloten.
- Delade arbetskopian är ännu inte en samlad release eller commit. Senaste slutförda gemensamma typkontrollen hade tre fel: ett antal i CMS rättades, två kvarvarande meddelanden i desktop-publiceringen saknades i genererade språktyper. Ägaren är underrättad. Ny körning väntar på delad checkscheduler. Detta gäller inte det isolerade testbygget, vars typkontroll är godkänd.
- Riktad frontend-lint hade inga fel men varningar i parallella CMS/history-filer. Convex-filer ignoreras enligt projektets lintkonfiguration och har i stället typkontrollerats vid backenddriftsättningen. Ingen full testsvit kördes.

Bevis: `weblab-cloud-pilot-test/live-results.json`, `live-browser.spec.ts`, `browser-results/`, samt denna notering. Testmiljön bygger på `6c511bfe74cabc392bb75f1d403e6d0d062a20e2` plus de angivna pilotfilerna och de valfria CMS-fälten `revision`/`archivedAt`. Desktop-agenten har fått en separat överlämning via [agent-mail-coordination](/Users/ludvighedin/.codex/skills/agent-mail-coordination/SKILL.md).

## Tidigare fas: lokal simulering

Resten av dokumentet beskriver den tidigare fasens dåvarande begränsningar. Resultaten ovan ersätter dess påstående att riktig cloudinloggning och lagring saknar provning.

## Riktig webbkörning

- Startade egen skyddad Next-server på port 3106 med projektets utvecklingsnycklar. Produktionsmiljön ändrades inte.
- Återskapade HTTP 500 vid `/projects` när servern bands till `127.0.0.1`. Next normaliserar URL till `localhost`, Clerk skriver en rewrite, och Next tolkar den andra origin som en extern proxy till sig själv. Samma server startad med `--hostname localhost` ger `/projects` → 307 och inloggningen → 200. Detta var ett startproblem, inte ett rättat kodfel i editorn.
- Den riktiga inloggningssidan öppnades i T3-webbläsaren. Inget konto skapades och ingen inloggning eller autentiserad cloudskrivning påstås vara testad.
- Läsanrop mot konfigurerad utvecklingsbackend `avid-gnat-539` bekräftar att `cloudPilot:workspace` inte är driftsatt. Att pusha hela den delade arbetskopians schema/funktioner skulle också skicka desktop-agentens pågående ändringar. Det gjordes inte.

## Rättade fel och oklarheter

1. Skapa-vyn krävde ett namn som sedan ignorerades om en pilot redan fanns. Nu visas befintlig pilots namn och en tydlig öppna-knapp. Nytt skapande förklarar begränsningen till en pilot per byggare/arbetsyta.
2. Pilotlänken visades även när experimentet var avstängt eller otillgängligt. Den visas nu bara vid tillgängligt skapande eller en åtkomlig befintlig pilot. Ett fel i experimentets fråga kan inte fälla hela projektlistan.
3. Spara kunde låsa alla fält under ett långt anslutningsavbrott. Nu visas anslutningsstatus, nya sparningar stoppas offline och användaren kan fortsätta skriva under en pågående sparning.
4. Ett sparande som servern redan accepterat kunde efter omladdning felaktigt visas som någon annans konflikt. Återställningen känner nu igen exakt matchande lagrat innehåll.
5. Om man sparade B, fortsatte skriva C och laddade om före svaret tappades kopplingen till B. Återställningen behåller nu även den inskickade versionen. Bara exakt förväntad nästa revision med samma innehåll får bekräfta sparningen; C finns kvar som osparat utkast. Senare revisioner ger fortfarande konflikt.
6. Felaktig lokalt cachad alignment kunde accepteras via strängkonvertering. Endast de två riktiga strängvärdena accepteras nu.

## Verifiering och gränser

- 33 riktade tester godkända över fyra filer: backendhandlers (10), innehållsregler (6), mall (4) och utkast (13). Giltiga resultat återanvändes för oförändrad kod. Riktad lint godkänd, även efter sista utkaständringen. Oberoende granskare hittade punkt 5 och har kontrollerat rättningen.
- Appens typkontroll slutfördes och rapporterade fem fel i det parallella CMS/history-arbetet, inga pilotfel vid den körningen. Slutlig typkontroll för hela appen är alltså fortfarande inte godkänd.
- Browserprovning av själva editorvyn använder en separat tillfällig Vite-harness med **riktiga UI-komponenter men simulerad backend**. Den märks uttryckligen som isolerat UI-test. Den bevisar inte Clerk-inloggning, verkliga Convex-transaktioner, två datorers cloudlagring eller publicering.
- Kvarvarande releasegräns är redan noterad i [BACKLOG](../../BACKLOG.md), F-802/F-803 och T-845. Ingen produktion, publicering, full testsvit eller desktopkod ändrades här.

## Provade flöden i webbläsaren

Samtliga rader nedan gäller riktiga pilotkomponenter med simulerade tjänster. Den gula testlisten i bilderna gör den gränsen synlig.

| Flöde | Observerat resultat |
| --- | --- |
| Ändra, spara och öppna igen | Innehållet finns kvar, sparstatus stämmer. |
| Misslyckad sparning | Fel visas och texten ligger kvar som osparad. |
| Tappad anslutning | Spara stängs av, fälten går fortfarande att redigera. |
| Skriva vidare under sparning | Den inskickade versionen sparas, senare text ligger kvar som osparad. |
| Läsfel och försök igen | Utkastet ligger kvar medan fel visas och efter återhämtning. |
| Två flikar med olika ändringar | Efter återöppning visas konflikt, det lokala utkastet skrivs inte över. Bakgrundsflikens omedelbara uppdatering är inte styrkt. |
| Byta konto och logga ut | Det andra kontot får inte föregående kontos osparade utkast. Utloggning tar bort editorn. Detta testar UI-isolering, inte riktig autentisering. |
| Läsbehörighet | Fält och spara är låsta i den simulerade läsrollen. |
| Skapa och sedan öppna befintlig pilot | Skapandet öppnar editorn. Befintlig pilot visas med rätt namn och öppna-knapp, även när experimentet pausats. |
| Ogiltig bildlänk | Svenskt fel visas. Ingen ogiltig bild renderas och revisionen ändras inte. |
| Textjustering och svenska | Centrerad text syns i förhandsvisningen och går att spara. Svenska etiketter visas. |
| Bakåt och återvända | Osparad text återställs i samma flik. |
| Mobil, 390 px | Läsbara fält och ingen horisontell sidscroll. |
| Pilotlänk i projektlistan | Visas när skapande är tillgängligt. Döljs för tom pausad pilot. Simulerat frågefel lämnar projektlistan kvar. |

[Desktopbild, isolerat UI-test](/Users/ludvighedin/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mupz04xn-86db2a35.png) · [Mobilbild, isolerat UI-test](/Users/ludvighedin/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mupyzdvl-e552cd13.png)

## Nästa steg före kundprovning

Driftsätt pilotfunktionerna i en överenskommen testmiljö, samordnat med desktop-agentens CMS-ändringar. Prova sedan riktig inloggning, behörighetskontroll, spara och konflikt från två separata sessioner. Den delade arbetskopians fem typfel behöver också lösas av sin ägare. Desktop-agenten har fått resultaten och felplatserna. Kundroller, publicering och drift av en publik sajt ingår ännu inte i denna pilot.

## Visual cloud replacement, 2026-10-02

The form experiment is rejected as product acceptance. Its old checks remain evidence only for that form. The replacement uses the actual Weblab Main/canvas and a durable source provider.

- Full web-client typecheck passed after native-owner handoff and cloud branch/preview integration.
- Real isolated Convex test: authenticated create/retry, atomic two-file save, same-operation retry, separate-session reopen, anonymous/other-account denial, competing CAS, exact binary-image recovery and private-asset denial passed. The live image test exposed an empty content-type storage failure, fixed by storing binary blobs with an explicit media type. The exact test is `scripts/qa/cloud-source-live.test.ts`; it is opt-in and pinned to the disposable backend.
- Focused source, cleanup, preview, access and literal-content contract checks passed. Latest contract run: 15 cases / 128 assertions, including real OID insertion and formatting helpers for multiline text. Full web-client typecheck passed after the latest cold-open/preview changes; focused lint has no errors and existing/style warnings. Independent reviewers checked the source/recovery/gateway fixes and the contract boundaries.
- Private preview gateway and exact URL helper have source-level checks. The owner approved up to eight 15-minute runtimes within 25 SEK. The first real runtime rendered the Next.js site in the actual canvas; inline save failed as recorded below. HMR/edit acceptance is incomplete.
- Customer grants are deployed only in the isolated backend. The narrow literal-edit validator is tested but unintegrated and excluded from the deployed artifact. These are not an invited customer editor, approved templates/blocks, publishing/rollback or constrained AI yet.
- Existing native publishing, CMS and global feature gates remain in place. Isolated cloud deployment is not native/package/production acceptance.

### Browser follow-up

- Isolated frontend deployment `1cf3e348-8154-4af5-a540-c60b8a7aa9fb` succeeded. Browser navigation from the workspace opened the actual canvas, pages/layers/assets controls, inspector and code editor. Editing `public/verification.txt` through the visible code panel and pressing Save returned an acknowledged save. After signing out and completing a new login, reopening the file showed the exact saved text. Cold direct-entry proof is still pending the follow-up deployment.
- Cold direct entry initially queried source before the shared Clerk token arrived. The cloud init now awaits the existing auth-readiness helper and rechecks teardown. The helper still has a five-second grace timeout; a slow or failed identity provider remains a real error rather than guaranteed readiness.
- Preview failure was incorrectly shown as endless workspace setup. The cloud overlay now distinguishes backend/expiry from exhausted browser iframe retries. A browser retry reloads only its own frame, including sibling breakpoints; a runtime retry remains explicit on the primary frame. Unsupported Git Commit is hidden for this source provider.
- One login and sign-out remained on their current screen after Clerk state changed. An instrumented retry login completed normally: activation resolved and the cache-invalidation POST returned 200. The intermittent earlier cause is not proved; no speculative authentication patch was made.
- T3 screenshot capture repeatedly fails at the preview tool layer. DOM inspection and interaction work, but no new visual screenshot proof is available. Do not substitute the old form screenshots for the replacement editor.

### Required next live proof

Owner approval is recorded for at most8 disposable runtimes of15minutes within25SEK. Credentials are installed only in the isolated backend. One runtime has stopped. Next test: open actual Next page, select and edit headline inline, replace an owned image, change a supported style, undo/redo, switch Home/About and phone frame, reload browser, reopen from another authorized session, expire/recreate runtime, and confirm retained source. Check iframe assets/HMR and popout permissions. A passing run would establish the builder slice only; customer permissions/templates/blocks and previewed publishing/rollback still require implementation and separate acceptance.


Final isolated frontend follow-up deployment `fc6e729f-efa7-49ad-8efa-804f9eb6c9fb` has status SUCCESS. The four refreshed frontend paths exactly match the checked shared source. The final cold direct-entry browser navigation timed out as the T3 automation host disconnected; `preview_open` still reports an existing loading tab, but automation reported no host. No alternative browser was started. Therefore the cold-load fix and final failure-overlay UI have source/type/build review, not completed post-deployment browser proof. The earlier actual code Save → new login → reopen proof remains valid. This was the pre-runtime checkpoint. Owner approval and first paid runtime follow below; no production or native release occurred.


### First real runtime, 2026-10-02 06:30–06:45 UTC

- Owner approved the bounded 25 SEK test budget. One 2-vCPU/4-GB iad1 sandbox started, rendered the actual Next site, and stopped at its 15-minute expiry. SDK readback confirmed stopped: 52,934 CPU-ms, 223,924,851 ingress bytes and 2,677,392 egress bytes. The private test ledger reserves 2 SEK for this run; this is a conservative reservation, not an invoice.
- A new T3 tab restored screenshot and interaction support. Cold authenticated entry, sandbox creation, Next compilation, private gateway cookie and preload/canvas rendering worked.
- **Inline save failed.** Typing a headline and blurring retained the overlay but source remained revision12. The runtime had sealed dependencies from revision11 to12; automatic source hydration advanced the external counter after history attached its baseline. Strict text finalization correctly refused that stale baseline. The status incorrectly said Saved. No history safety check was bypassed.
- Overlay refresh also lost named typography by replacing captured styles with an incomplete computed-style snapshot. Failed finalization left both the underlying heading and overlay visible.
- Startup-only hydration, explicit guarded full reload, truthful local-draft status, code-draft protection and typography corrections are in progress. Focused source lifecycle cases pass; deployment and real inline save/reload proof still remain.


### Fresh-project live follow-up

Deployment `25bbe132-2d88-47b4-9811-ee75debf3113` succeeded. The second paid runtime opened a fresh Next project and synchronized the dependency seal before editor history attached. Inline typography remained correct; active/failed text now says Unsaved changes and is downloadable. However first headline save still failed: interaction setup writes its generated CSS and private interaction JSON *after* the history baseline attaches, advancing own-write revision0→2 while the external baseline stays correctly equal. A narrowly reviewed history admission correction now acknowledges completed idle own writes before a new gesture, never remote revisions, active transactions or retained failures. Live proof of this final correction remains pending.


### Third real runtime, 2026-10-02 07:21–07:34 UTC

Deployment `3e7a2ab0-c98e-4dcf-a721-ba018a065c3a` established the first live visual-save proof. In the actual Weblab canvas, the headline was edited directly, blurred, acknowledged Saved, read back from retained source and retained after a hard browser reload. Undo and Redo changed the retained source correctly. Changing the selected headline font size from60 to48 produced the desktop breakpoint class and rendered at48px. Opening Pages eventually displayed Home/About and switching to About loaded that page. The initially blank panel was temporary lazy loading, not a confirmed persistent failure.

A confirmed multiline-paste defect concatenated separate ProseMirror paragraphs. Shared extraction now preserves paragraph boundaries, hard breaks and empty lines; focused fixtures, typecheck and independent review passed. Cloud startup now shows progress and scans pages immediately after source admission. Deployment `0dde3560-aac8-4be6-8c9f-c11ddda9fd30` carries those four reviewed paths; live multiline/recreated-runtime proof remains pending until it is live.

Three runtime starts are used, all stopped, with6SEK conservatively reserved against the25SEK/eight-start authorization. The third runtime was explicitly stopped at07:34:32UTC. This proves only selected builder operations. Image replacement, customer restrictions/templates/blocks, publishing/rollback and constrained AI are not accepted.


### Fourth runtime: retained-project recovery and multiline acceptance

Deployment `0dde3560-aac8-4be6-8c9f-c11ddda9fd30` reopened the retained project in a replacement runtime. Home/About were discovered before opening the Pages panel. The first multiline check found a second defect: preload `buildLayerTree` labels `<br>` elements, while final extraction recognized only attribute-free breaks. The text overlay retained newlines but final source lost them. The narrow delimiter-aware extraction correction passed four focused fixtures, preload typecheck/build/lint and independent review. Deployment `8fa6b872-4028-4fb8-a103-3322ab394138` succeeded with the rebuilt bridge.

The retained test project's bridge was explicitly upgraded through the signed-in builder's normal source commit, after checking its hash. This was test setup, not an automatic customer migration. The frontend CDN served an old unversioned asset until a versioned query was used; runtime bridge versioning remains a release task. After upgrade, multiline paste → blur → Saved retained an attributed `<br>` in source; hard browser reload rendered both lines in both desktop and phone frames. Screenshot: `/Users/ludvighedin/.t3/userdata/browser-artifacts/browser-screenshot-cloud-pilot-cloud-pilot-up-railway-app-muqo45wb-46e08ddb.png`.

Fourth runtime stopped at07:55:38UTC. Four starts used, all stopped,8SEK reserved. Approved-content contracts/transport and same-canvas member/approval UI are now being integrated in source; not deployed or accepted yet.

### Approved-text integration, 2026-10-02 08:35 UTC

- Same Weblab canvas: Design/Build/Code switch, selection approval and People roles; stopped previews have an explicit Start button. Approved text uses restricted server transport and recovery pinned to its original protocol/contracts.
- Independent reviewers found and resolved delayed drag revocation, component-master gesture admission, designer-history replay in Build, stale selection and missing stopped-preview CTA.
- Preview starts now have actor-bound one-use reservations and replaceable allowance generations; customers need a builder-prepared lock. Ordinary saves never provision VMs.
- Gateway uses actor tickets, current request checks, and active-stream checks every two seconds with two-second timeout. Legacy shared capability is private readiness-only; gateway version2 required. Normal cloud member removal deletes current branch ticket.
- Focused evidence: contract/source/recovery48; auth/content/cleanup29; reservation/history40; gateway11; ticket/content17 pass. Web-client typecheck passed, isolated backend typecheck/deploy passed. Frontend integration lint has zero errors with existing formatting warnings; backend is excluded by repository ESLint configuration.
- Isolated backend updated 08:34:40 UTC. Frontend deployment `9c6bde1f-afdc-478e-98a3-d36e1cdb12e8` building. No new paid runtime started: four of eight used and all stopped. Customer browser acceptance remains pending.


### Fifth runtime and customer boundary follow-up, 2026-10-02

The fifth runtime (`sbx_ejLziYaXTB4mw9indKl2QLkxsLmb`) is confirmed stopped. Five of eight authorized starts have been used; the private ledger reserves 10 SEK conservatively, not as a billed total. The designer used the actual canvas to approve the heading and People to assign the test customer a content role. Customer browser save/reopen remains unaccepted.

A live API candidate initially failed the strict contract because the test omitted the editor's final formatter. A local fixture using actual CodeFS output passed: raw Babel output was rejected, real editor output and the corrected test candidate were accepted and byte-identical. No validator restriction was weakened. The corrected live source-only test still needs execution; it does not create a runtime.

The OTP activation path now retains the return destination through Clerk activation/remount and uses its navigation callback. Independent review and focused type/lint checks passed. Disabled publishing controls now state that cloud publishing is unavailable. Preview startup no longer mistakes a previous runtime's expiry for failure of the new starting runtime. Isolated frontend deployment `581b2810-e150-4ee2-b20e-861c8ee59837` contains these changes; deployment/live acceptance is pending. T3 browser tools recovered after temporary timeouts; a stale page showed an upstream error, while a fresh sign-in navigation returned successfully.

Corrected source-only live acceptance passed against real Clerk test users and the isolated Convex backend: approved heading save, exact retry without another revision, fresh source readback, original heading restoration, formatted unauthorized class/file rejection, removed customer's snapshot/access rejection and original membership restoration. This mode performs no runtime allocation and no preview-ticket HTTP check. Browser customer edit and gateway live revocation remain pending.


### Approved attributes source review

The next slice covers existing literal image src/alt, explicit safe link destinations and named complete class choices. Asset ownership alone does not authorize selecting that image. Fresh backend review found that localized choice names could not be Convex record keys; stable ASCII IDs now carry separate localized labels, checked with the actual Convex serializer. The parser's generated OID alphabet also includes colons; strict validation now accepts that actual alphabet while preserving duplicate-ID and attribute checks. A deterministic colon line-break fixture accompanies the randomized formatter case. The initial focused run found the colon defect (34 passed, one failed); after fixes the 35 contract/handler cases passed. A final reserved-key alignment and UI/transport integration still need checks. None of this attribute slice is deployed yet.

The attribute backend is deployed to the isolated Convex environment with successful typecheck. All 35 backend cases pass, including reserved-key rejection and Convex serialization. Integrated web-client typecheck passed before the final draft-guard correction; 56 action/history/source/recovery cases pass, and focused frontend lint has zero errors with existing warnings.

Real customer attribute acceptance passed against the isolated backend: designer preserved existing bindings and approved named class/link values; customer saved, reread and retried the exact operation; unapproved values were rejected; original source and approval bindings were restored. Coverage is explicitly className/href only. No eligible image existed in that page, so src/alt live proof is not claimed. No VM was provisioned.

Independent integration review identified same-OID cross-scope draft carryover and silently dropped alt drafts on selection change. The UI fix is in progress and must be checked/re-reviewed before frontend deployment. Visible attribute changes after HMR/Undo/Redo remain a browser acceptance requirement, including old designer style overrides; this is an unverified concern, not a confirmed new CSS defect.


### Real image acceptance and final source review

The no-runtime image test passed against real builder/customer sessions. Two small repo-owned PNGs were atomically uploaded with a temporary literal img; customer changed approved src and alt, read back exact binary bytes, retried the same receipt and received rejection for an unapproved URL. Original page, complete path/kind/hash/bytes manifest and semantic approval bindings were restored; source revision advanced to21, no recovery required. The private recovery journal was removed only after exact restoration. Unreferenced upload blobs remain subject to normal cleanup, not claimed physically deleted immediately. No sixth VM start.

Independent final source review found no remaining concrete blocker in the attribute slice. Image-description drafts pin source/Clerk identity and target; selection changes retain Save/Discard, revoked permissions retain read-only copy/discard, session recovery is scoped and bounded. Final UI checks/deployment follow. Browser must still prove actual src/href/computed-class updates after edit/undo/redo, style-capture → Build transitions, draft retention on selection/revocation, account switch and failed storage. Full templates/publishing/AI requirements remain open.


Final reviewed UI typecheck passed; focused final UI lint has zero errors (seven warnings). Isolated frontend deployment `fc3ca31a-8040-4892-ba39-a32475def67a` is building. Browser host remains unavailable, and the user has been asked to reopen the T3 preview panel. To prevent unattended paid starts while blocked, the isolated backend cloud-editor gate was set false and VERCEL_TOKEN/TEAM_ID/PROJECT_ID were removed. Only this test deployment was changed; source and approvals remain retained. The private budget ledger records five stopped starts, 10 SEK conservative reserve, three authorized starts remaining. Reinstall isolated credentials and enable the gate only when browser acceptance can proceed within that same remaining budget. Own browser lease released; no local server was started.

Isolated frontend deployment `fc3ca31a-8040-4892-ba39-a32475def67a` is SUCCESS. Remote build and final type/lint checks passed. Browser acceptance remains blocked by the unavailable T3 host; no production deployment or commit was made in the shared dirty checkout.


### Customer browser reopened, 2026-10-02

T3 automation recovered after the owner reopened the panel. The actual customer completed the OTP journey and returned to the exact project, confirming the deployed return-navigation fix. Project initialization then failed before preview startup: ZenFS reported EEXIST for the project directory. Retry reproduced the failure. Source revision21 remains intact. Investigation traced the cross-tab cache inconsistency to per-tab inode metadata over shared IndexedDB directory entries. A cloud-only instance cache is under review; pre-transport failed edits must remain durably recoverable before that change is accepted.

Initial navigation also requested obsolete Next chunks. Their origin in service-worker caching is unproven. Startup-only recovery is being corrected so it cannot reload an editor after hydration or user interaction. The separate service-worker private-navigation cache seam needs an offline-safe solution; globally removing it would regress native cold offline project opening.

The isolated cloud-editor gate was enabled for source loading, but runtime credentials remain removed. No sixth runtime was started; five stopped starts and the 10 SEK conservative reserve are unchanged. Customer canvas editing remains unaccepted.


### Cloud cache correction, 2026-10-02

Durable cloud caches now use unique instance-owned memory mounts, leaving native persistent storage and logical project/branch index keys intact. Initialization is single-flight; disposal closes admission, drains pending work and releases only its own mount. Pre-transport parser/index failures preserve raw actor/scope/revision-pinned bytes in the existing durable recovery store as download-only records. Older pending operations cannot be overwritten; storage collisions retain both downloads and explicitly warn that the new attempt needs the tab to remain open.

The first focused run caught a real ZenFS directory-write problem and four changed recovery expectations. Cloud create/write/copy now reject directory destinations before ZenFS can damage their listing. Final focused run:79 cases,490 assertions passed, including actual installed ZenFS lifecycle/isolation/native behavior, local filesystem, source/recovery and attribute/history cases. Startup bootstrap17 cases/57 assertions passed. Final web-client typecheck passed. Focused app/startup/filesystem lint has zero errors with existing/style warnings. Independent source and final correction review found no remaining concrete blocker. These are source/lifecycle checks, not customer browser acceptance.

Isolated frontend deployment238d4de4-0fb3-4f38-a01c-b2e3f48183dc is building. A reviewed private fixture will add visible owned images and approved heading/link options for customer canvas acceptance; restore requires an unchanged fixture or explicitly reviewed exact page hash, plus full manifest/contract checks and CAS. No sixth runtime yet.


### Sixth customer canvas run, 2026-10-02

The customer reached the real canvas on isolated deployment238d4de4 after OTP. The cache EEXIST failure did not recur. The reversible fixture installed visible owned images, approved image/alt choices, heading style choices and a link target at source revision22. Selecting the heading displayed Edit on canvas and its approved choices. The generic design toolbar, misleading Viewer label and unsupported terminal entry were observed and have reviewed source guards pending checks/deployment.

A real inline text attempt failed with CLOUD_CONTENT_UNAPPROVED_CHANGE. Recovery bytes show only approved heading text, permitted generated line-break ID churn and one compiler-empty JSX line before the heading. The API candidate independently reproduced that rejection; it never reached live preview-ticket revocation checks. A narrow comparison-only normalization plus atomic source/fingerprint update is under implementation. The original fingerprint algorithm and approval generation remain unchanged.

Load saved version could not discard the retained failed text and instead asked for a refresh. Downloading the recovery opened a native save dialog; it was completed, but the T3 automation host subsequently remained unavailable after panel reopen and reload. The private recovery bytes and fixture restoration journal are retained. Source revision22 is unchanged by the rejected saves.

Run 6 sbx_7Dmzo813Qz0dHKklQzjQKE2NUBXL was confirmed stopped at 17:44:35.093 UTC, before its 15-minute deadline. Six starts reserve 12 SEK conservatively, two starts remain within the original eight/25 SEK authorization. All three isolated Vercel runtime credentials were removed and the cloud gate disabled. No production change or local dev server.

The deployed bootstrap is self-contained and disarms on interaction/hydration. Actual response HTML places Next async scripts before it, so source tests do not prove earliest-load recovery. This remains a limitation, alongside the separately recorded offline-safe private-navigation cache seam.


### Empty-spacing correction and source acceptance

The independently reviewed correction changes only candidate comparison for existing JSXText nodes containing a newline whose rendered value is empty. Persisted fingerprint format stays unchanged. Accepted source and its recomputed fingerprint commit atomically after existing actor, revision, generation and old-fingerprint checks; approval metadata remains unchanged. 38 focused contract/handler cases pass, including sequential edits/Undo and meaningful-whitespace rejection. The exact captured failed browser candidate separately passes and yields only the approved text operation. Web-client typecheck and isolated backend deployment/typecheck pass.

The first live source-only rerun saved, retried and restored the heading, then exposed a stale test expectation: the fixture now approves className choices, so an unknown full class correctly returns INVALID_VALUE. The corrected test still rejects success, verifies no source revision change after each forged request and emits only fixed diagnostic codes. The full rerun passed: customer save, exact retry/readback, original text restore, forbidden style/file writes, removed-member source/access denial and original membership restoration. No runtime was started. Preview-ticket HTTP revocation remains unproven live because source-only execution deliberately skips it.

The reversible canvas fixture was fully restored with its original source manifest, owned assets and approval bindings; source is now revision 27. Recovery journal was archived only after verification. The downloaded failed browser recovery exists (6901 bytes) and remains private. Three task-only test wrappers were removed. The three customer UI guards have no lint errors; failed-text explicit reload recovery is still being implemented/reviewed.


### Rejected-text explicit reload recovery

The customer recovery button now has an explicit, cloud-only navigation lease for one settled failed text session. It requires idle matching history/source ownership and no other drafts or uncertain operation. Confirmation removes only the exact definitively rejected journal with existing CAS, never finalizes or replays the failed text, and leaves text/history in memory until unload. A cancelled navigation keeps Download and an explicit retry available in a frozen document. Known synchronous navigation failure restores the journal without overwriting another owner; source teardown releases only its own lease. No cancellation timer or native history mutation.

Independent source review found no concrete blocker. The first focused run found a real new eligibility mistake: the existing start lock deliberately remains true for retained failed text, so it cannot mean work is still running. The guard now relies on pending operations, finalization promise and exact settled session/history instead. The mock history also uses a class like the actual manager to preserve identity under MobX. Final focused source/text/history run:73 cases,478 assertions passed. Final type/lint and isolated frontend delivery follow; this is not browser acceptance.


The final one-line settled-session correction was independently reviewed. Final web-client typecheck passed; focused app lint has zero errors with existing/style warnings. Repository ESLint project service does not include the standalone `scripts/qa/cloud-content-live.test.ts` helper, so its attempted lint reports a configuration inclusion error; no configuration was weakened, and its real guarded Bun run passed. The isolated frontend snapshot includes the reviewed three Build-mode UI guards and failed-text reload changes, with no shared schema/generated copy. Deployment `3f6f9200-df25-4ab3-9d6b-858131e22cf6` is building. No new runtime or production change.


### Owner-directed account cleanup

Provenance: this thread’s root agent explicitly ran `--configure new --team ludvig-hedin --project weblab-cloud-pilot` on 2026-10-01 at 20:35:17 UTC. The accessible team’s display name was mistaken for private account ownership. This was not a subagent or an automatic default.

Before deletion, the official project metadata matched id 3122303, team 482242/ludvig-hedin, sole dev deployment 5845301/accomplished-grouse-400 and no production. The local 552969-byte export passed ZIP integrity and all five storage payload size/SHA256 comparisons. Separate independent review approved the exact-target cleanup. Official delete returned 200; subsequent project lookup 404 and team project listing confirmed removal. Deletion receipt and backup manifest remain private beside the export. Isolated Railway project 9e732bdc-952d-4a3e-ae67-247bdfc08806/environment 44dd9e53-2feb-4d72-984e-6c1077903d01/service be24887b-96ef-4eee-9f6f-ad281d763b7d was stopped; deployment list shows REMOVED and test URL 404. No private project or other work project was modified.

Owner supplied the private dashboard link https://dashboard.convex.dev/t/ludvighedin15/weblab/avid-gnat-539. Main app target already matches. Current Convex authentication sees only work teams and MCP returns no access to the selected private project. Do not create a replacement in an accessible work team. Further cloud deployment requires private-account authentication and an isolated plan within the existing private project.


Owner completed private Convex device login. Fresh CLI team/project lookup and MCP status both verify `ludvighedin15/weblab`, project2128291, dev `avid-gnat-539`; production remains read-only. No private writes or imports occurred. Existing dev metadata lists337 functions and no cloud modules. Further resumption needs a reviewed isolated plan inside this project or coordinated additive shared-dev integration; do not restore the test archive into existing data.
