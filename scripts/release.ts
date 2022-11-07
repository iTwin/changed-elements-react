/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const usage = `Usage: npm release -- <version>
Where <version> is one of:
    major | minor | patch | premajor [preid] | preminor [preid] | prepatch [preid] | prerelease [preid]`;

main();

function main(): void {
  const args = validateArgs(process.argv);
  validateChangelog(args.changelogFilePath);

  try {
    const parameters = ["version", "--no-git-tag-version", args.version];
    if (args.preid) {
      parameters.push("--preid", args.preid);
    }

    execFileSync("npm", parameters, { cwd: args.packageDirPath });
  } catch (error) {
    printErrorAndExit(error instanceof Error ? `${error.name}: ${error.message}` : "Could not bump package version.");
  }

  const { packageName, packageVersion } = readPackageJson(args.packageJsonFilePath);
  updateChangelog(args.changelogFilePath, packageVersion);

  try {
    // Make sure only the modified package.json and CHANGELOG.md files get committed
    execFileSync("git", ["reset"]);
    execFileSync("git", ["add", args.packageJsonFilePath, args.changelogFilePath]);
    execFileSync("git", ["commit", "-m", `Release ${packageName}@${packageVersion}`]);
  } catch (error) {
    printErrorAndExit(error instanceof Error ? `${error.name}: ${error.message}` : "Could not commit file changes.");
  }

  console.log(`Successfully bumped ${packageName} version and committed the changes.
Release tag: v${packageVersion}`);
}

function readPackageJson(packageJsonFilePath: string): { packageName: string; packageVersion: string; } {
  const packageJson = JSON.parse(String(fs.readFileSync(packageJsonFilePath)));
  const packageName: string = packageJson.name;
  if (!packageName) {
    printErrorAndExit("Could not obtain package name.");
  }

  const packageVersion: string = packageJson.version;
  if (!packageVersion) {
    printErrorAndExit("Could not obtain package version.");
  }

  return { packageName, packageVersion };
}

function updateChangelog(changelogFilePath: string, packageVersion: string): void {
  const {
    changelogContent,
    unreleasedHeaderStartPosition,
    unreleasedHeaderEndPosition,
  } = validateChangelog(changelogFilePath);

  const unreleasedHeader = changelogContent.substring(unreleasedHeaderStartPosition, unreleasedHeaderEndPosition);
  const releaseHeader = unreleasedHeader
    .replace("Unreleased", packageVersion)
    .replace("HEAD", `v${packageVersion}`)
    .concat(` - ${formatDate(new Date())}`);

  const updatedChangelogContent = changelogContent
    .slice(0, unreleasedHeaderStartPosition)
    .concat(releaseHeader, changelogContent.slice(unreleasedHeaderEndPosition));

  fs.writeFileSync(changelogFilePath, updatedChangelogContent);
}

interface ChangelogInfo {
  changelogContent: string;
  unreleasedHeaderStartPosition: number;
  unreleasedHeaderEndPosition: number;
}

function validateChangelog(changelogFilePath: string): ChangelogInfo {
  const changelogContent = String(fs.readFileSync(changelogFilePath));
  const unreleasedHeaderStartPosition = changelogContent.indexOf("## [Unreleased]");
  if (unreleasedHeaderStartPosition === -1) {
    printErrorAndExit("Could not find Unreleased section.");
  }

  const unreleasedHeaderEndPosition = changelogContent.indexOf("\n", unreleasedHeaderStartPosition);
  if (unreleasedHeaderEndPosition === -1) {
    printErrorAndExit("Changelog does not explain what has changed since the last version.");
  }

  let releaseNotesEndPosition: number | undefined = changelogContent.indexOf("\n## [", unreleasedHeaderEndPosition);
  if (releaseNotesEndPosition === -1) {
    releaseNotesEndPosition = undefined;
  }

  const changesInThisVersion = changelogContent.substring(unreleasedHeaderEndPosition, releaseNotesEndPosition);
  const trimmedChanges = changesInThisVersion.replace(/\s/g, "");
  if (trimmedChanges.length === 0) {
    printErrorAndExit("Changelog does not explain what has changed since the last version.");
  }

  return { changelogContent, unreleasedHeaderStartPosition, unreleasedHeaderEndPosition };
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function pad(component: number): string {
  return String(component).padStart(2, "0");
}

interface ProcessedCliArgs {
  version: string;
  preid: string | undefined;
  packageDirPath: string;
  packageJsonFilePath: string;
  changelogFilePath: string;
}

function validateArgs(argv: string[]): ProcessedCliArgs {
  if (argv.length < 3) {
    printUsageAndExit();
  }

  const version = argv[2];
  const preid = argv[3];

  if (!new Set(["major", "minor", "patch", "premajor", "preminor", "prepatch", "prerelease"]).has(version)) {
    printUsageAndExit();
  }

  const maxArgvLength = version.startsWith("pre") ? 4 : 3;
  if (argv.length > maxArgvLength) {
    printUsageAndExit();
  }

  const packageDirPath = path.join(process.cwd(), "packages/changed-elements-react");
  if (!fs.existsSync(packageDirPath)) {
    printErrorAndExit(`Directory "${packageDirPath}" does not exist.`);
  }

  const packageJsonFilePath = path.join(packageDirPath, "package.json");
  if (!fs.existsSync(packageJsonFilePath)) {
    printErrorAndExit(`File "${packageJsonFilePath}" does not exist.`);
  }

  const changelogFilePath = path.join(packageDirPath, "CHANGELOG.md");
  if (!fs.existsSync(changelogFilePath)) {
    printErrorAndExit(`File "${changelogFilePath}" does not exist.`);
  }

  return {
    version,
    preid,
    packageDirPath,
    packageJsonFilePath,
    changelogFilePath,
  };
}

function printUsageAndExit(): never {
  console.log(usage);
  process.exit(1);
}

function printErrorAndExit(errorMessage: string): never {
  console.error(`Error: ${errorMessage}`);
  process.exit(1);
}
