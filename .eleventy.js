const { EleventyI18nPlugin } = require("@11ty/eleventy");
const { execSync } = require('child_process')

module.exports = function (eleventyConfig) {
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
