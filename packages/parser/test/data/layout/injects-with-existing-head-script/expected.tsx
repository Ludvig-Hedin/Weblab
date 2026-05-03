import Script from 'next/script';
import React from 'react';
export default function Layout() {
  return (
    <html>
            <head>
                <Script src="https://example.com/other.js" />
            </head>
            <body>
                <main />
            
        <Script src="https://cdn.jsdelivr.net/gh/Ludvig-Hedin/Weblab@main/apps/web/client/public/weblab-preload-script.js" strategy="afterInteractive" type="module" id="weblab-preload-script"></Script>
      </body>
        </html>);}