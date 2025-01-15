/** @type {import('@changesets/types').ChangelogFunctions} */
const fs = require('fs');
const path = require('path');

async function getPackageVersion() {
  const packageJsonPath = path.resolve(__dirname, '../packages/changed-elements-react/package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

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

async function getReleaseLine(changeset, versionType) {
  const newVersion = incrementVersion(await getPackageVersion(), versionType);
  // Get the current date in yyyy-mm-dd format
  const date = new Date().toISOString().split('T')[0];
  const releaseDateAndLinkToRelease = `#### [${newVersion}](https://github.com/iTwin/changed-elements-react/tree/v${newVersion}/packages/changed-elements-react) - ${date}`;
  // Customize your release line here
  return `${releaseDateAndLinkToRelease}\n${changeset.summary}`;
}

async function getDependencyReleaseLine() {}

const defaultChangelogFunctions = {
  getReleaseLine,
  getDependencyReleaseLine,
};

module.exports = defaultChangelogFunctions;
