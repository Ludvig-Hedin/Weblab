import React from 'react';import Script from "next/script";
export default function Layout({ children }: {children: React.ReactNode;}) {
  return <html lang="en"><body><Script src="https://cdn.jsdelivr.net/gh/Ludvig-Hedin/Weblab@d73589eedb16a13b17b8bf5edf22511bde77053a/apps/web/client/public/weblab-preload-script.js" strategy="afterInteractive" type="module" id="weblab-preload-script"></Script>
{children}</body></html>;}