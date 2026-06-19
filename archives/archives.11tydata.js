module.exports = {
  eleventyComputed: {
    permalink: (data) => {
      if (data.published === false) return false;
    },
    eleventyExcludeFromCollections: (data) => data.published === false,
  },
};
