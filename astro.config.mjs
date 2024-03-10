import { defineConfig } from 'astro/config';
import { exampleRemarkPlugin } from './src/excerpt-remark-plugin.mjs';


// https://astro.build/config
export default defineConfig({
    site: "https://helmgast.se",
    image: {
        domains: ["fablr.co", "helmgast.se"],
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
