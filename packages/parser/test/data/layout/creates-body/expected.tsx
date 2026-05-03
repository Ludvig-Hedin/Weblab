import Script from "next/script";export default function Document() {
  return <html>
    <body><Script src="https://cdn.jsdelivr.net/gh/Ludvig-Hedin/Weblab@main/apps/web/client/public/weblab-preload-script.js" strategy="afterInteractive" type="module" id="weblab-preload-script"></Script></body>
  </html>;}