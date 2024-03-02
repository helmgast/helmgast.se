import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
    site: "https://helmgast.se",
    image: {
        domains: ["helmgast.se", "fablr.co"],
    },
    i18n: {
        defaultLocale: "sv",
        locales: ["en", "sv"],
        routing: {
            prefixDefaultLocale: false
        }
      }
});
