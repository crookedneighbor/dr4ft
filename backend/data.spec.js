const assert = require("assert");
const path = require("path");
const data = require("./data");
const {describe, it} = require("mocha");

describe("Acceptance tests for Data functions", () => {
  describe("can find certain starter sets", () => {
    it("find starter key in playable sets", () => {
      const playableSets = data.getPlayableSets();
      assert(playableSets["starter"]);
    });
  });

  describe("can get file from data directory", () => {
    it("file in data directory as absolute path", () => {
      const repoRoot = process.env.INIT_CWD;
      const dataDir = data.getDataFile("foo", "bar", "version.json");

      assert(dataDir);
      assert(path.isAbsolute(dataDir));
      assert.equal(dataDir, `${repoRoot}/data/foo/bar/version.json`);
    });
  });
});
