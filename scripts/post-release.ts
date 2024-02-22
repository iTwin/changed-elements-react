/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const usage = "Usage: npm run post-release -- <release-branch>";

main();

function main() {
  const releaseBranch = validateArgs(process.argv);

  const gitStatus = exec("git status --porcelain").toString();
  if (gitStatus.length > 0) {
    printErrorAndExit("git working directory is not clean.");
  }

  if (checkBranchExists("post-release")) {
    printErrorAndExit("git branch 'post-release' already exists.");
  }

  switchAndPullBranch(releaseBranch);
  switchAndPullBranch("master");

  const changelogFilePath = path.join(process.cwd(), "packages/changed-elements-react/CHANGELOG.md");
  const unreleasedHeader = getUnreleasedHeader(changelogFilePath);
  if (!unreleasedHeader) {
    printErrorAndExit("Could not find Unreleased section in master CHANGELOG.md.");
  }

  exec("git switch -c post-release");
  console.log(`Merging '${releaseBranch}' into 'post-release'`);
  exec(`git merge --no-ff ${releaseBranch}`);

  if (!getUnreleasedHeader(changelogFilePath)) {
    console.log("Manually fixing CHANGELOG.md merge.");
    updateChangelog(changelogFilePath, unreleasedHeader);
    exec(`git stage ${changelogFilePath}`);
    exec("git commit --amend --no-edit");
  }

  console.log("Done, you can publish this branch now.");
}

function validateArgs(args: string[]): string {
  if (args.length !== 3) {
    printUsageAndExit();
  }

  const releaseBranch = args[2];
  if (!checkBranchExists(releaseBranch)) {
    printErrorAndExit(`git branch '${releaseBranch}' was not found.`);
  }

  return releaseBranch;
}

function getUnreleasedHeader(changelogFilePath: string): string | undefined {
  const changelogContent = String(fs.readFileSync(changelogFilePath));
  const matches = changelogContent.match(/^(## \[Unreleased\].+)$/m);
  if (!matches) {
    return undefined;
  }

  return matches[0];
}

function updateChangelog(changelogFilePath: string, unreleasedHeader: string): void {
  const changelogContent = String(fs.readFileSync(changelogFilePath));
  const changelogHeader = changelogContent.indexOf("# Changelog");
  if (changelogHeader === -1) {
    printErrorAndExit("Failed to find changelog header.");
  }

  const firstEntry = changelogContent.indexOf("#", changelogHeader + 1);
  if (firstEntry === -1) {
    printErrorAndExit("Failed to locate first changelog entry.");
  }

  const updatedChangelogContent = changelogContent.substring(0, firstEntry) + `${unreleasedHeader}\n\n`
    + changelogContent.substring(firstEntry);

  fs.writeFileSync(changelogFilePath, updatedChangelogContent);
}

function switchAndPullBranch(branchName: string): void {
  exec(`git switch ${branchName}`);
  console.log(`Updating branch '${branchName}'`);
  exec(`git pull --ff-only origin ${branchName}`);
}

function checkBranchExists(branchName: string): boolean {
  try {
    exec(`git rev-parse --verify --quiet ${branchName}`);
    return true;
  } catch {
    return false;
  }
}

function exec(command: string): Buffer {
  const [file, ...args] = command.split(" ");
  return execFileSync(file, args);
}

function printUsageAndExit(): never {
  console.log(usage);
  process.exit(1);
}

function printErrorAndExit(errorMessage: string): never {
  console.error(`Error: ${errorMessage}`);
  process.exit(1);
}
