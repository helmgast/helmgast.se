import { defineConfig } from 'astro/config';
import { exampleRemarkPlugin } from './src/excerpt-remark-plugin.mjs';


// https://astro.build/config
export default defineConfig({
    site: "https://helmgast.pages.dev",
    image: {
        domains: ["helmgast.se"],
    },
    redirects: {
        "/blog": "/blog/page/1",
    },
    markdown: {
        remarkPlugins: [exampleRemarkPlugin]
    },
    i18n: {
        defaultLocale: "sv",
        locales: ["en", "sv", "fr"],
        routing: {
            prefixDefaultLocale: false
        }
      }
});
