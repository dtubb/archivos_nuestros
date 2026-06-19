// Aggregate every *_photos.json in _data into one object keyed by grid name,
// so archive.njk can look a record's photoGrid up dynamically instead of a
// hand-maintained if/elif. Add a collection's JSON and it just works.
const fs = require("fs");
const path = require("path");

module.exports = () => {
  const dir = __dirname;
  const grids = {};
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith("_photos.json")) {
      grids[file.replace(/\.json$/, "")] = JSON.parse(
        fs.readFileSync(path.join(dir, file), "utf8")
      );
    }
  }
  return grids;
};
