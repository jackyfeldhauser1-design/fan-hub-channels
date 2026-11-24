import { createFileRoute } from "@tanstack/react-router";

import { resolvePublicBaseUrl } from "@/lib/base-url";

const entries = [
  { path: "/warteliste", changefreq: "weekly", priority: "0.8" },
  { path: "/werbepartner", changefreq: "weekly", priority: "0.8" },
  { path: "/datenschutz", changefreq: "yearly", priority: "0.2" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const base = resolvePublicBaseUrl();
        if (!base) {
          return new Response("Public URL not configured", { status: 503, headers: { "Cache-Control": "no-store" } });
        }
        const urls = entries
          .map(
            (e) =>
              `  <url>\n    <loc>${base.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}${e.path}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
          )
          .join("\n");
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          urls,
          `</urlset>`,
        ].join("\n");
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
