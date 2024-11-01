"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const tl = __importStar(require("azure-pipelines-task-lib/task"));
const azdev = __importStar(require("azure-devops-node-api"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const xml2js_1 = require("xml2js");
async function run() {
    try {
        // Retrieve inputs
        const mavenGoal = tl.getInput('mavenGoal', true) || 'clean install';
        const mainPomPath = tl.getInput('mainPomPath', true) || 'pom.xml';
        // Parse modules from main POM file
        const modules = await parseModulesFromPom(mainPomPath);
        console.log(`main POM: ${mainPomPath}`);
        console.log(`Modules in main POM: ${modules}`);
        // Fetch changed files from PR
        const changedFiles = await getChangedFiles();
        // Determine modules to build based on changes
        const modulesToBuild = await determineModulesToBuild(changedFiles);
        // Always include the main module
        // modulesToBuild.add(mainPomPath);
        // Run Maven with the specified modules
        const modulesParam = Array.from(modulesToBuild).join(',');
        const mavenCommand = `mvn ${mainPomPath} -pl ${modulesParam} -am ${mavenGoal}`;
        console.log(`Executing Maven command: ${mavenCommand}`);
        (0, child_process_1.execSync)(mavenCommand, { stdio: 'inherit' });
        tl.setResult(tl.TaskResult.Succeeded, 'Build completed successfully.');
    }
    catch (error) {
        tl.setResult(tl.TaskResult.Failed, `Build failed: ${error}`);
    }
}
// Updated getChangedFiles function using azure-devops-node-api
async function getChangedFiles() {
    //console.log('Available variables:', tl.getVariables());
    const orgUrl = tl.getVariable('System.TeamFoundationCollectionUri');
    console.log('orgUrl:', orgUrl);
    const project = tl.getVariable('System.TeamProject');
    console.log('project:', project);
    const repoId = tl.getVariable('Build.Repository.ID');
    console.log('repoId:', repoId);
    const pullRequestId = tl.getVariable('System.PullRequest.PullRequestId');
    console.log('pullRequestId:', pullRequestId);
    if (!orgUrl || !project || !repoId || !pullRequestId) {
        throw new Error('Missing required environment variables to fetch pull request details.');
    }
    // Get Azure DevOps token
    const token = tl.getVariable('System.AccessToken');
    if (!token) {
        throw new Error('Access token is not available. Please check pipeline permissions.');
    }
    // Authenticate with Azure DevOps API
    const authHandler = azdev.getPersonalAccessTokenHandler(token);
    const connection = new azdev.WebApi(orgUrl, authHandler);
    const gitApi = await connection.getGitApi();
    // Get the latest iteration ID
    const iterations = await gitApi.getPullRequestIterations(repoId, parseInt(pullRequestId), project);
    const latestIteration = iterations[iterations.length - 1];
    if (!latestIteration) {
        throw new Error('Could not find any iterations for the pull request.');
    }
    // Fetch changes in the latest iteration
    const iterationChanges = await gitApi.getPullRequestIterationChanges(repoId, parseInt(pullRequestId), latestIteration.id, project);
    // Extract changed file paths
    const changedFiles = iterationChanges.changeEntries
        .map(change => change.item?.path)
        .filter(Boolean);
    console.log('Changed files:', changedFiles);
    return changedFiles;
}
// Function to parse module names from main POM
async function parseModulesFromPom(pomPath) {
    const pomXml = fs.readFileSync(pomPath, 'utf-8');
    const result = await (0, xml2js_1.parseStringPromise)(pomXml);
    const modules = result.project.modules?.[0].module || [];
    return modules.map((module) => module.trim());
}
// Function to determine modules to build based on changed files
async function determineModulesToBuild(changedFiles) {
    const modulesToBuild = new Set();
    for (const file of changedFiles) {
        console.log('Changed file:', file);
        const modulePath = await getModuleFromFilePath(file);
        if (modulePath) {
            modulesToBuild.add(modulePath);
        }
    }
    console.log('modules To Build:', modulesToBuild);
    return modulesToBuild;
}
// Improved function to get module name from file path
async function getModuleFromFilePath(filePath) {
    // Start with the directory containing the file
    let currentDir = path.dirname(filePath);
    console.log('currentDir:', currentDir);
    while (currentDir !== path.parse(currentDir).root) { // Stop when reaching the root
        const pomPath = path.join('.', currentDir, 'pom.xml'); // Prepend '.' to make it relative
        console.log('pomPath:', pomPath);
        if (fs.existsSync(pomPath)) {
            // If pom.xml exists in this directory, try to parse it for the module name
            const moduleName = await parseModuleNameFromPom(pomPath);
            if (moduleName) {
                return moduleName;
            }
        }
        // Move one level up in the directory hierarchy
        currentDir = path.dirname(currentDir);
        console.log('Move one level up currentDir:', currentDir);
    }
    return null;
}
// Helper function to parse the module name from a pom.xml file
async function parseModuleNameFromPom(pomPath) {
    try {
        const pomXml = fs.readFileSync(pomPath, 'utf-8');
        const result = await (0, xml2js_1.parseStringPromise)(pomXml);
        const currentArtifactId = result.project.artifactId?.[0];
        if (!currentArtifactId) {
            console.warn(`No artifactId found in ${pomPath}`);
            return null;
        }
        // Check for parent groupId
        console.log('CurrentArtifactId:', currentArtifactId);
        let moduleName = currentArtifactId;
        const parent = result.project.parent?.[0];
        if (parent) {
            const parentGroupId = parent.groupId?.[0];
            if (parentGroupId) {
                moduleName = parentGroupId + ':' + moduleName;
            }
        }
        console.log('ModuleName:', moduleName);
        return moduleName;
    }
    catch (error) {
        console.error(`Error parsing ${pomPath}:`, error);
    }
    return null;
}
run();
