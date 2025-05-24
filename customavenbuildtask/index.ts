import * as core from '@actions/core';
import * as github from '@actions/github';
import * as path from 'path';
import * as fs from 'fs';
import { parseStringPromise } from 'xml2js';

async function run() {
  try {

    // Fetch changed files from PR
    const changedFiles: string[] = await getChangedFiles();

    // Determine modules to build based on changes
    const modulesToBuild: Set<string> = await determineModulesToBuild(changedFiles);

    // Run Maven with the specified modules
    const modulesParam = Array.from(modulesToBuild).join(',');

    // Log the modulesParam for debugging
    core.info(`Final modulesParam to be set as output: ${modulesParam}`);

    // Set modulesParam as an output variable for GitHub Actions
    core.setOutput('modulesParam', modulesParam);
    core.info('Build custom modules successfully.'); // Explicit success message
  } catch (error: any) { 
    if (error instanceof Error) {
      core.setFailed(`Build custom modules failed: ${error.message}`);
    } else {
      core.setFailed(`Build custom modules failed: ${String(error)}`);
    }
  }
}

// Rewritten getChangedFiles function using GitHub Actions toolkit
async function getChangedFiles(): Promise<string[]> {
  const token = core.getInput('github-token', { required: true });
  const octokit = github.getOctokit(token);
  const context = github.context;

  if (context.eventName !== 'pull_request' || !context.payload.pull_request) {
    core.warning('Not a pull request event or pull_request payload is missing. No files will be returned.');
    return [];
  }

  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const pull_number = context.payload.pull_request.number;

  core.info(`Fetching changed files for PR #${pull_number} in ${owner}/${repo}`);

  let files: string[] = [];
  const per_page = 100; // Max items per page for this endpoint
  let page = 1;
  let response;

  try {
    do {
      response = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number,
        per_page,
        page,
      });

      if (response.data.length > 0) {
        const newFiles = response.data.map(file => file.filename);
        core.debug(`Found ${newFiles.length} files on page ${page}: ${newFiles.join(', ')}`);
        files = files.concat(newFiles);
      } else {
        core.debug(`No files found on page ${page}.`);
      }
      page++;
    } while (response.data.length === per_page);

    core.info(`Found a total of ${files.length} changed files in the pull request.`);
    core.debug(`Changed files list: ${files.join(', ')}`);
    return files;
  } catch (error: any) { // Explicitly type error
    core.error(`Error fetching changed files: ${error.message}`);
    throw error; // Re-throw to be caught by the main run function's try/catch
  }
}

// Function to determine modules to build based on changed files
async function determineModulesToBuild(changedFiles: string[]): Promise<Set<string>> {
  const modulesToBuild: Set<string> = new Set();

  for (const file of changedFiles) {
    core.debug(`Processing changed file: ${file}`);
    const modulePath = await getModuleFromFilePath(file);
    if (modulePath) {
      modulesToBuild.add(modulePath);
    }
  }
  core.info(`Modules to build: ${Array.from(modulesToBuild).join(', ')}`);
  return modulesToBuild;
}

// Improved function to get module name from file path
async function getModuleFromFilePath(filePath: string): Promise<string | null> {
  // Start with the directory containing the file
  let currentDir = path.dirname(filePath);
  core.debug(`Starting module search for file: ${filePath} in directory: ${currentDir}`);
  while  (currentDir !== path.parse(currentDir).root && currentDir !== '.') { // Stop when reaching the root or current dir itself
    const pomPath = path.join(currentDir, 'pom.xml'); // No longer prepending '.', path.join handles it correctly
    core.debug(`Checking POM at: ${pomPath}`);
    if (fs.existsSync(pomPath)) {
      core.debug(`Found pom.xml at: ${pomPath}`);
      const moduleName = await parseModuleNameFromPom(pomPath);
      if (moduleName) {
        return moduleName;
      }
    }
    // Move one level up in the directory hierarchy
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) { // Check to prevent infinite loop if dirname stops changing (e.g., at root)
        core.debug(`Reached root or stalled at ${currentDir}, stopping search.`);
        break;
    }
    currentDir = parentDir;
    core.debug(`Moving up to: ${currentDir}`);
  }
  core.debug(`No pom.xml found for file: ${filePath}`);
  return null;
}

// Helper function to parse the module name from a pom.xml file
async function parseModuleNameFromPom(pomPath: string): Promise<string | null> {
  try {
    const pomXml = fs.readFileSync(pomPath, 'utf-8');
    const result = await parseStringPromise(pomXml);
    const currentArtifactId = result.project.artifactId?.[0];
    if (!currentArtifactId) {
      core.warning(`No artifactId found in ${pomPath}`);
      return null;
    }

    // Check for parent groupId
    core.debug(`Current artifactId: ${currentArtifactId} in ${pomPath}`);
    let moduleName = currentArtifactId;
    const parent = result.project.parent?.[0];
    if (parent) {
      const parentGroupId = parent.groupId?.[0];
      if (parentGroupId) {
        moduleName = parentGroupId + ':' + moduleName;
      }
    }

    core.debug(`Module name: ${moduleName} from ${pomPath}`);
    return moduleName;

  } catch (error: any) { 
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.error(`Error parsing ${pomPath}: ${errorMessage}`);
  }
  return null;
}

// run(); // Commented out to prevent auto-execution during tests

export const testExports = { parseModuleNameFromPom, getModuleFromFilePath, determineModulesToBuild, getChangedFiles, run };