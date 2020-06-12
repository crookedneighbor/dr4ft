const fs = require("fs");
const path = require("path");
const axios = require("axios");
const unzip = require("unzipper");
const semver = require("semver");
const updateDatabase = require("./update_database");
const logger = require("../backend/logger");
const { refresh: refreshVersion } = require("../backend/mtgjson");
const { getDataDir } = require("../backend/data");

const MTGJSON_SETS_ZIP_URL = "https://www.mtgjson.com/files/AllSetFiles.zip";
const REMOTE_VERSION_METADATA_URL = "https://www.mtgjson.com/files/version.json";
const PATH_TO_LOCAL_VERSION_METADATA = path.join(getDataDir(), "version.json");

const setsDataDir = path.join(getDataDir(), "sets");

/**
 * An object with metadata related to the revision of MTGJSON data.
 * @typedef {Object} MTGJSONMetadata
 * @property {string} date - A date string in the form YYYY-MM-DD that indicates the date when the card data was last updated.
 * @property {string} pricesDate - A date string in the form YYYY-MM-DD that indicates the pricing data for cards was last updated.
 * @property {string} version - A semver like string in the form X.Y.Z+DATESTRING where DATESTRING is a date in the form YYYYMMDD
 */

/**
 * @desc Compares 2 MTGJSON version metadata objects and returns true if the first is newer than the second
 * @returns boolean
 */
const isVersionNewer = ({ version: remoteVer }, { version: currentVer }) => (
  semver.compareBuild(remoteVer, currentVer) > 0
);

/**
 * @desc downloads metadata from MTGJSON
 * @returns Promise<MTGJSONMetadata>
 */
const getRemoteVersionMetadata = () => {
  logger.info("Checking data revision on MTGJSON");

  return axios.get(REMOTE_VERSION_METADATA_URL).then(({data: remoteVersion}) => {
    return remoteVersion;
  }).catch(err => {
    logger.error(`Error while fetching metadata version to ${REMOTE_VERSION_METADATA_URL}: ${err.stack}`);

    return Promise.reject(err);
  });
};

/**
 * @desc Checks if a local version of the metadata exists and compares it against the remote version.
 * Returns true if the local version is up to date with the remote version.
 * @param {MTGJSONMetadata} remoteVersion the metadata from MTGJSON to compare with the local version
 * @returns boolean - whether or not the local version is up to date
 */
const isVersionUpToDate = (remoteVersion) => {
  if (!fs.existsSync(PATH_TO_LOCAL_VERSION_METADATA)) {
    return false;
  }

  logger.info("Previous downloaded version metadata file found. Checking against upstream version");

  const localVersion = JSON.parse(fs.readFileSync(PATH_TO_LOCAL_VERSION_METADATA, "UTF-8"));
  const localVersionIsUpdateToDate = !isVersionNewer(remoteVersion, localVersion);

  logger.info(`Local version is ${localVersionIsUpdateToDate ? "up to" : "out of"} date`);

  return localVersionIsUpdateToDate;
};

/**
 * @desc downloads and unzips the card data files from MTGJSON
 * @returns Promise<void>
 */
const fetchZip = () => (
  new Promise((resolve, reject) => {
    logger.info("Downloading a zip file of all the MtG set data");

    axios({
      method: "get",
      url: MTGJSON_SETS_ZIP_URL,
      responseType: "stream"
    }).then(response => {
      response.data.pipe(unzip.Extract({
        path: setsDataDir,
        concurrency: 4
      }))
        .on("finish", resolve)
        .on("error", reject);
    });
  }));

/**
 * @desc The entry point for this script. Checks if the card data needs to be updated and does so.
 * @returns Promise<void>
 */
const download = async () => {
  const version = await getRemoteVersionMetadata();
  const isUpToDate = isVersionUpToDate(version);

  if (isUpToDate) {
    logger.info("Card set data is up to date. Skipping update");

    return;
  }

  await fetchZip();

  logger.info("MtG set download complete. Updating the cards and sets data in database");
  updateDatabase();

  logger.info("Update to database finished. Writing new version metadata");
  fs.writeFileSync(PATH_TO_LOCAL_VERSION_METADATA, JSON.stringify(version));

  refreshVersion();
};

module.exports = {
  download
};

// Allow this script to be called directly from commandline.
if (!module.parent) {
  download();
}
