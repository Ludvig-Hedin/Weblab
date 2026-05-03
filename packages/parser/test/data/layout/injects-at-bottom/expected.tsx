import React from 'react';import Script from "next/script";
export default function Layout() {
  return (
    <html>
            <body>
                <main />
                <footer />
            
        <Script src="https://cdn.jsdelivr.net/gh/Ludvig-Hedin/Weblab@ec326199ed4eb89b135594a4ad57277c625aa9ac/apps/web/client/public/weblab-preload-script.js" strategy="afterInteractive" type="module" id="weblab-preload-script"></Script>
      </body>
        </html>);}