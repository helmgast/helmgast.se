import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
    site: "https://helmgast.se",
    image: {
        domains: ["fablr.co"],
    },
    i18n: {
        defaultLocale: "sv",
        locales: ["en", "sv", "fr"],
        routing: {
            prefixDefaultLocale: false
        }
      }
});
