const { EleventyI18nPlugin } = require("@11ty/eleventy");
const { execSync } = require('child_process')

module.exports = function (eleventyConfig) {
    const siteBasePath = process.env.SITE_BASE_PATH || "";

    eleventyConfig.addFilter("sitePath", (value) => {
        if (!value) return value;
        if (/^(https?:)?\/\//.test(value) || value.startsWith("mailto:") || value.startsWith("#")) {
            return value;
        }
        const normalized = value.startsWith("/") ? value : `/${value}`;
        return `${siteBasePath}${normalized}`;
    });

    eleventyConfig.addFilter("displayDate", (value) => {
        if (!value) return value;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toISOString().slice(0, 10);
    });

    eleventyConfig.addFilter("urlEncode", (value) => {
        if (!value) return "";
        return encodeURIComponent(String(value));
    });

    eleventyConfig.addPassthroughCopy("assets");
    eleventyConfig.addPassthroughCopy("admin");

	eleventyConfig.addPlugin(EleventyI18nPlugin, {
		// any valid BCP 47-compatible language tag is supported
		defaultLanguage: "es", // Required, this site uses "en"
	});
    eleventyConfig.on('eleventy.after', () => {
        execSync(`npx pagefind --site _site --glob \"**/*.html\"`, { encoding: 'utf-8' })
    });
};
