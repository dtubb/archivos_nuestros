const { EleventyI18nPlugin } = require("@11ty/eleventy");
const { execSync } = require('child_process')
require('@citation-js/plugin-bibtex');
require('@citation-js/plugin-csl');
const { Cite } = require('@citation-js/core');

module.exports = function (eleventyConfig) {
    const siteBasePath = process.env.SITE_BASE_PATH || "";

    eleventyConfig.addDataExtension("yml", (contents) => {
        const yaml = require("js-yaml");
        return yaml.load(contents);
    });

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

    const md = require("markdown-it")({ html: false, breaks: true, linkify: false });
    eleventyConfig.addFilter("md", (value) => value ? md.render(String(value)) : "");

    eleventyConfig.addFilter('cite', function(bibtex) {
        if (!bibtex) return '';
        try {
            return new Cite(bibtex).format('bibliography', {
                format: 'html',
                template: 'chicago-author-date',
                lang: 'en-US'
            });
        } catch (e) {
            return '';
        }
    });

    eleventyConfig.addFilter('buildBibtex', function(data, key) {
        const typeMap = {book:'book', article:'article', chapter:'incollection', report:'techreport'};
        const entryType = typeMap[data.cite_type] || 'misc';
        const fields = [];
        if (data.cite_title) fields.push(`  title = {${data.cite_title}}`);
        if (data.cite_author) fields.push(`  author = {${data.cite_author}}`);
        if (data.cite_year) fields.push(`  year = {${data.cite_year}}`);
        if (data.cite_publisher) fields.push(`  publisher = {${data.cite_publisher}}`);
        if (data.cite_place) fields.push(`  address = {${data.cite_place}}`);
        if (data.cite_container) fields.push(`  journal = {${data.cite_container}}`);
        if (data.cite_url) fields.push(`  url = {${data.cite_url}}`);
        if (!fields.length) return null;
        return `@${entryType}{${key},\n${fields.join(',\n')}\n}`;
    });

    eleventyConfig.addFilter('citeStyle', function(bibtex, template) {
        if (!bibtex) return '';
        try {
            return new Cite(bibtex).format('bibliography', {
                format: 'html',
                template: template || 'chicago-author-date',
                lang: 'en-US'
            });
        } catch (e) {
            return '';
        }
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
