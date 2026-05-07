import type { MetadataRoute } from "next";

import { APP_DOMAIN } from "@weblab/constants";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = `https://${APP_DOMAIN}`;

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/login",
          "/projects/",
          "/project/",
          "/invitation/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
