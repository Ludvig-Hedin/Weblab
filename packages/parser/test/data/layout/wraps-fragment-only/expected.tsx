import React from 'react';import Script from "next/script";
export default function Layout() {
  return <html lang="en"><body><Script src="https://cdn.jsdelivr.net/gh/Ludvig-Hedin/Weblab@main/apps/web/client/public/weblab-preload-script.js" strategy="afterInteractive" type="module" id="weblab-preload-script"></Script>
      <>
            <div>Header</div>
            <main />
        </></body></html>;

}