const fs = require('fs');
const path = require('path');

/**
 * Get the current package version
 * @returns {Promise<string>} - The current package version
 */
async function getPackageVersion() {
  const packageJsonPath = path.resolve(__dirname, '../packages/changed-elements-react/package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

/**
 * Increment the version based on the version type
 * @param {string} version - The current version
 * @param {string} versionType - The type of version increment (major, minor, patch)
 * @returns {string} - The incremented version
 */
function incrementVersion(version, versionType) {
  const [major, minor, patch] = version.split('.').map(Number);

  switch (versionType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unknown version type: ${versionType}`);
  }
}

/**
 * Get the release line for the changelog
 * @param {import('@changesets/types').NewChangesetWithCommit} changeset - The changeset object
 * @param {string} versionType - The type of version increment (major, minor, patch)
 * @returns {Promise<string>} - The release line for the changelog
 */
async function getReleaseLine(changeset, versionType) {
  const newVersion = incrementVersion(await getPackageVersion(), versionType);
  // Get the current date in yyyy-mm-dd format
  const date = new Date().toISOString().split('T')[0];
  const releaseDateAndLinkToRelease = `#### [${newVersion}](https://github.com/iTwin/changed-elements-react/tree/v${newVersion}/packages/changed-elements-react) - ${date}`;
  // Customize your release line here
  return `${releaseDateAndLinkToRelease}\n${changeset.summary}`;
}

/**
 * Get the dependency release line for the changelog
 * @returns {Promise<string>} - The dependency release line for the changelog
 */
async function getDependencyReleaseLine() {
  // Implementation for dependency release line
}

/** @type {import('@changesets/types').ChangelogFunctions} */
const defaultChangelogFunctions = {
  getReleaseLine,
  getDependencyReleaseLine,
};

module.exports = defaultChangelogFunctions;
