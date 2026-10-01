# Prova Sanity-piloten själv

Du kan prova att Sanity ändrar innehållet medan Weblab ändrar designen. Det här
är ett testprojekt. En ny desktopapp eller en färdig kundintegration ingår inte.

## På Ludvigs nuvarande Mac

Den förberedda kopian finns i
`/Users/ludvighedin/Programming/personal/AB/coder-new/sanity-pilot`.
Öppna en terminal i den mappen och kör:

```sh
agent-heavy-run sanity-pilot editor
```

Öppna [editorn](http://127.0.0.1:3008/),
[sajten](http://127.0.0.1:3007/) och
[Sanity Studio](http://127.0.0.1:3007/studio).
Avsluta servern med Ctrl+C när du är klar. Starten kan behöva vänta på ledigt
utrymme i maskinskyddet. Ändra inte dess gränser för att komma vidare.

1. **Innehåll:** Logga in i Studio med ditt Sanity-konto. Ändra startsidans
   rubrik och klicka Publicera. Uppdatera sajten. Den nya texten ska synas.
2. **Design:** Markera rubriken i editorn. Ändra desktopstorleken från 62 till
   64 px. Om storleksfältet är låst, klicka först **Detach variable** vid fältet.
   Byt sedan till agentpanelen. Före Spara, skriv:
   `Ändra bara rubrikens desktopstorlek i src/app/(site)/page.tsx. Behåll home.title och home.intro. Använd endast Read och Edit, inga kommandon.`
   Spara. Kontrollera att rubriken är större, medan texten är samma.
3. **Mobil:** Välj telefonvyn. Rubriken ska fortfarande vara 36 px och sidan
   ska inte kunna dras i sidled. Prova bloggens två kategorier och öppna ett inlägg.
4. **Samspel:** Publicera en ny rubrik i Studio igen. Uppdatera sajten. Texten
   ska bytas medan den nya storleken finns kvar.
5. **Ångra:** Ångra den sparade designändringen innan du laddar om hela editorn.
   Storleken ska gå tillbaka och Sanity-texten vara kvar. Återställ testtexten
   i Studio när du är klar.
6. **Beständighet:** Ladda om sajten. Design och publicerad text ska vara kvar.
   Ladda också om editorn och notera om du tappar historik eller tydligt sparbesked.

Den sista punkten avslöjar en känd lucka: den provade editorn tappar chatten och
den sparade ändringens ångraknapp när hela editorn laddas om. Dess källpekare kan
visa en genererad fil, och den har inget särskilt lås för Sanity-text. Därför
behövs den exakta filinstruktionen ovan. Dessa luckor är kvar inför kundbruk.

## På en annan Mac

Den offentliga appnedladdningen kräver idag Apple Silicon. Installera inte en
annan desktopvariant och anta att den har samma bevisade pilotflöde. Den nya
valda varianten måste först släppas och provas som ett faktiskt installerat paket.

För att prova själva testsajten separat krävs Bun, Node 22.12 eller senare och
en egen Git-kopia av den här mappen. Följ uppsättningen i [README](README.md).
Använd dessa offentliga inställningar i kopians ignorerade `.env.local`:

```dotenv
SANITY_CONTENT_MODE=sanity
SANITY_PROJECT_ID=k73ltzd4
SANITY_DATASET=production
```

Ingen API-nyckel behövs för att läsa testinnehållet. Studio kräver att ditt
inloggade konto är medlem i projektet. Projektägaren måste också tillåta den
exakta nya sajtadressen med credentials i Sanitys CORS-inställningar. Adresserna
`http://127.0.0.1:3007` och `http://127.0.0.1:3008` är redan tillåtna för piloten.
Läs inte in skarpa kundnycklar i testkopian.

## När kan vi säga att en kundsajt fungerar?

Piloten bevisar ett litet innehållsformat, inte alla Sanity-sajter. Den visar
högst 50 artiklar och stödjer inte länkar, listor eller egna block i brödtexten.
En riktig kunds innehållsmodell och kod behöver en separat genomgång.

Före kundbruk behöver den valda desktopappen klara öppna, ändra, spara,
återöppna och återställa på säkra kopior av riktiga Next.js/Tailwind-sajter.
Prova även felaktig anslutning, avbrutet sparande och att en kollega ändrar
samma fil. Formulär, länkar, bilder, mobilvy och publicering behöver egna prov.
En andra Macs faktiska installation återstår. Inget procentlöfte följer av
dagens pilot.
