import Script from 'next/script';
export default function Document() {
  return (
    <html>
            <head>
                <title>Test</title>
                <Script type="module" src="https://some-url/onlook-dev/web/script.js" />
            </head>
            <body>
                <main />
            
        <Script src="https://cdn.jsdelivr.net/gh/Ludvig-Hedin/Weblab@main/apps/web/client/public/weblab-preload-script.js" strategy="afterInteractive" type="module" id="weblab-preload-script"></Script>
      </body>
        </html>);}