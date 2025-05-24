import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import { testExports } from '../index'; // Imports all exported functions including 'run'
import * as core from '@actions/core';
import * as github from '@actions/github';

// Destructure all functions from testExports for use in tests
const { parseModuleNameFromPom, getModuleFromFilePath, determineModulesToBuild, getChangedFiles, run } = testExports;

// Global stubs for core functions. Specific behaviors will be set in test cases.
let coreGetInputStub: sinon.SinonStub;
let coreSetOutputStub: sinon.SinonStub;
let coreSetFailedStub: sinon.SinonStub;
let coreInfoStub: sinon.SinonStub;
let coreDebugStub: sinon.SinonStub;
let coreWarningStub: sinon.SinonStub;
let coreErrorStub: sinon.SinonStub;

// Global stubs for github context and octokit
let githubContextStub: any; // Will hold the stubbed context object
let getOctokitStub: sinon.SinonStub;
let listFilesStub: sinon.SinonStub; // For octokit.rest.pulls.listFiles

// Mock Octokit client
const mockOctokit = {
  rest: {
    pulls: {
      listFiles: async () => {} // This will be replaced by listFilesStub
    }
  }
};

describe('parseModuleNameFromPom', () => {
  let readFileSyncStub: sinon.SinonStub;
  // coreErrorStub will be used instead of consoleErrorStub

  beforeEach(() => {
    readFileSyncStub = sinon.stub(fs, 'readFileSync');
    // Initialize core stubs for this describe block if not already done globally
    // For now, assuming coreErrorStub is initialized in a global beforeEach or here
    coreErrorStub = sinon.stub(core, 'error');
    coreWarningStub = sinon.stub(core, 'warning');
    coreDebugStub = sinon.stub(core, 'debug');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return artifactId when pom.xml is valid and has artifactId only', async () => {
    const pomXml = '<project><artifactId>my-artifact</artifactId></project>';
    readFileSyncStub.returns(pomXml);
    const moduleName = await parseModuleNameFromPom('dummy/pom.xml');
    assert.strictEqual(moduleName, 'my-artifact');
  });

  it('should return parentGroupId:artifactId when pom.xml is valid and has both', async () => {
    const pomXml = '<project><parent><groupId>com.example</groupId></parent><artifactId>my-artifact</artifactId></project>';
    readFileSyncStub.returns(pomXml);
    const moduleName = await parseModuleNameFromPom('dummy/pom.xml');
    assert.strictEqual(moduleName, 'com.example:my-artifact');
  });

  it('should return null and call core.warning when pom.xml is missing artifactId', async () => {
    const pomXml = '<project><parent><groupId>com.example</groupId></parent></project>';
    readFileSyncStub.returns(pomXml);
    const moduleName = await parseModuleNameFromPom('dummy/pom.xml');
    assert.strictEqual(moduleName, null);
    assert.ok(coreWarningStub.calledOnceWith('No artifactId found in dummy/pom.xml'));
  });

  it('should return null and call core.error when pom.xml is malformed', async () => {
    const pomXml = '<project><artifactId>my-artifact</artifactBadTag>';
    readFileSyncStub.returns(pomXml);
    const moduleName = await parseModuleNameFromPom('dummy/pom.xml');
    assert.strictEqual(moduleName, null);
    assert.ok(coreErrorStub.calledOnce); // xml2js error parsing
  });

  it('should return null and call core.error when pom.xml file does not exist', async () => {
    const error = new Error('ENOENT: no such file or directory');
    readFileSyncStub.throws(error);
    const moduleName = await parseModuleNameFromPom('nonexistent/pom.xml');
    assert.strictEqual(moduleName, null);
    assert.ok(coreErrorStub.calledOnceWith(`Error parsing nonexistent/pom.xml: ${error.message}`));
  });
});

describe('getModuleFromFilePath', () => {
  let existsSyncStub: sinon.SinonStub;
  let parseModuleNameFromPomStub: sinon.SinonStub;

  beforeEach(() => {
    existsSyncStub = sinon.stub(fs, 'existsSync');
    parseModuleNameFromPomStub = sinon.stub(testExports, 'parseModuleNameFromPom');
    coreDebugStub = sinon.stub(core, 'debug'); // For logging within the function
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return module name if pom.xml found by traversing up', async () => {
    const filePath = 'moduleA/src/main/java/com/example/File.java';
    const targetPomDir = 'moduleA'; // pom.xml is in moduleA/pom.xml
    const expectedPomPath = path.join(targetPomDir, 'pom.xml'); // Corrected path join

    // Simulate fs.existsSync behavior during path traversal
    existsSyncStub.callsFake((p: string) => {
        const normalizedPath = path.normalize(p);
        if (normalizedPath.endsWith('moduleA/src/main/java/com/example/pom.xml')) return false;
        if (normalizedPath.endsWith('moduleA/src/main/java/pom.xml')) return false;
        if (normalizedPath.endsWith('moduleA/src/pom.xml')) return false;
        return normalizedPath === path.normalize(expectedPomPath);
    });
    parseModuleNameFromPomStub.withArgs(sinon.match.string).resolves(null); // Default
    parseModuleNameFromPomStub.withArgs(expectedPomPath).resolves('moduleA-name');

    const moduleName = await getModuleFromFilePath(filePath);
    assert.strictEqual(moduleName, 'moduleA-name');
    assert.ok(coreDebugStub.calledWith(`Found pom.xml at: ${expectedPomPath}`));
  });

  it('should return null if no pom.xml found in the hierarchy', async () => {
    const filePath = 'project/sub-module/src/main/java/com/example/File.java';
    existsSyncStub.returns(false); // No pom.xml anywhere
    const moduleName = await getModuleFromFilePath(filePath);
    assert.strictEqual(moduleName, null);
    assert.ok(coreDebugStub.calledWith(`No pom.xml found for file: ${filePath}`));
  });
});

describe('determineModulesToBuild', () => {
  let getModuleFromFilePathStub: sinon.SinonStub;

  beforeEach(() => {
    getModuleFromFilePathStub = sinon.stub(testExports, 'getModuleFromFilePath');
    coreInfoStub = sinon.stub(core, 'info');
    coreDebugStub = sinon.stub(core, 'debug');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return an empty Set for an empty list of changed files', async () => {
    const modules = await determineModulesToBuild([]);
    assert.deepStrictEqual(modules, new Set());
    assert.ok(coreInfoStub.calledWith('Modules to build: '));
  });
  
  it('should process files and call core.debug for each', async () => {
    const changedFiles = ['file1.java', 'file2.ts'];
    getModuleFromFilePathStub.withArgs('file1.java').resolves('module-a');
    getModuleFromFilePathStub.withArgs('file2.ts').resolves(null);

    await determineModulesToBuild(changedFiles);
    assert.ok(coreDebugStub.calledWith('Processing changed file: file1.java'));
    assert.ok(coreDebugStub.calledWith('Processing changed file: file2.ts'));
  });

});

describe('getChangedFiles', () => {
  const defaultContext = {
    eventName: 'pull_request',
    repo: { owner: 'test-owner', repo: 'test-repo' },
    payload: { pull_request: { number: 123 } },
  };

  beforeEach(() => {
    coreGetInputStub = sinon.stub(core, 'getInput');
    coreInfoStub = sinon.stub(core, 'info');
    coreDebugStub = sinon.stub(core, 'debug');
    coreWarningStub = sinon.stub(core, 'warning');
    coreErrorStub = sinon.stub(core, 'error');

    // Mock github.getOctokit to return our mockOctokit
    listFilesStub = sinon.stub(mockOctokit.rest.pulls, 'listFiles');
    getOctokitStub = sinon.stub(github, 'getOctokit').returns(mockOctokit as any);
    
    // Stub github.context
    // Use Object.defineProperty to modify the readonly github.context
    Object.defineProperty(github, 'context', {
        value: defaultContext,
        configurable: true // Allow redefining/deleting later
    });

    coreGetInputStub.withArgs('github-token', { required: true }).returns('dummy-token');
  });

  afterEach(() => {
    sinon.restore();
    // Restore original github.context if it was modified by Object.defineProperty
    // This might require storing the original context if complex scenarios arise.
    // For now, simply deleting the defined property might revert to original if possible,
    // or reset to a basic object. Careful handling is needed if tests run in parallel or affect global state.
    // A safer way is to restore the original descriptor if saved.
    // For simplicity here, we assume sinon.restore() or a new Object.defineProperty in next beforeEach handles it.
  });

  it('should return list of changed files on successful API call (single page)', async () => {
    listFilesStub.resolves({
      data: [{ filename: 'file1.ts' }, { filename: 'file2.ts' }],
      status: 200, headers: {}, url: '' // satisfy OctokitResponse structure
    });

    const files = await getChangedFiles();
    assert.deepStrictEqual(files, ['file1.ts', 'file2.ts']);
    assert.ok(coreGetInputStub.calledOnceWith('github-token', { required: true }));
    assert.ok(getOctokitStub.calledOnceWith('dummy-token'));
    assert.ok(listFilesStub.calledOnceWith({
      owner: 'test-owner', repo: 'test-repo', pull_number: 123, per_page: 100, page: 1
    }));
    assert.ok(coreInfoStub.calledWith('Fetching changed files for PR #123 in test-owner/test-repo'));
    assert.ok(coreInfoStub.calledWith('Found a total of 2 changed files in the pull request.'));
  });

  it('should return empty list and warn if not a pull_request event', async () => {
    Object.defineProperty(github, 'context', {
        value: { ...defaultContext, eventName: 'push' },
        configurable: true
    });
    const files = await getChangedFiles();
    assert.deepStrictEqual(files, []);
    assert.ok(coreWarningStub.calledOnceWith('Not a pull request event or pull_request payload is missing. No files will be returned.'));
  });

  it('should handle pagination correctly', async () => {
    listFilesStub.onFirstCall().resolves({
      data: Array(100).fill(0).map((_, i) => ({ filename: `file_page1_${i}.ts` })),
      status: 200, headers: {}, url: ''
    });
    listFilesStub.onSecondCall().resolves({
      data: [{ filename: 'file_page2_0.ts' }],
      status: 200, headers: {}, url: ''
    });
     listFilesStub.onThirdCall().resolves({ // For the loop to terminate
      data: [],
      status: 200, headers: {}, url: ''
    });


    const files = await getChangedFiles();
    assert.strictEqual(files.length, 101);
    assert.strictEqual(files[100], 'file_page2_0.ts');
    assert.ok(listFilesStub.calledTwice); // Actually three times because of the empty page check
  });

  it('should throw error if listFiles API call fails', async () => {
    const apiError = new Error('GitHub API Error');
    listFilesStub.rejects(apiError);
    await assert.rejects(getChangedFiles(), apiError);
    assert.ok(coreErrorStub.calledOnceWith(`Error fetching changed files: ${apiError.message}`));
  });
});


describe('run', () => {
  let getChangedFilesStub: sinon.SinonStub;
  let determineModulesToBuildStub: sinon.SinonStub;

  beforeEach(() => {
    getChangedFilesStub = sinon.stub(testExports, 'getChangedFiles');
    determineModulesToBuildStub = sinon.stub(testExports, 'determineModulesToBuild');
    
    coreSetOutputStub = sinon.stub(core, 'setOutput');
    coreSetFailedStub = sinon.stub(core, 'setFailed');
    coreInfoStub = sinon.stub(core, 'info');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should succeed and set modulesParam for a single module', async () => {
    getChangedFilesStub.resolves(['file1.java']);
    determineModulesToBuildStub.resolves(new Set(['module-a']));

    await run();

    assert.ok(getChangedFilesStub.calledOnce);
    assert.ok(determineModulesToBuildStub.calledOnceWith(['file1.java']));
    assert.ok(coreSetOutputStub.calledOnceWith('modulesParam', 'module-a'));
    assert.ok(coreInfoStub.calledWith('Final modulesParam to be set as output: module-a'));
    assert.ok(coreInfoStub.calledWith('Build custom modules successfully.'));
    assert.ok(coreSetFailedStub.notCalled);
  });

  it('should fail if getChangedFiles throws an error', async () => {
    const error = new Error('Failed to get files');
    getChangedFilesStub.rejects(error);

    await run();

    assert.ok(getChangedFilesStub.calledOnce);
    assert.ok(determineModulesToBuildStub.notCalled);
    assert.ok(coreSetFailedStub.calledOnceWith(`Build custom modules failed: ${error.message}`));
  });

  it('should fail with string error message if getChangedFiles throws non-Error', async () => {
    const errorMsg = "A string error";
    getChangedFilesStub.rejects(errorMsg);

    await run();
    assert.ok(coreSetFailedStub.calledOnceWith(`Build custom modules failed: ${errorMsg}`));
});


  it('should fail if determineModulesToBuild throws an error', async () => {
    getChangedFilesStub.resolves(['file1.java']);
    const error = new Error('Failed to determine modules');
    determineModulesToBuildStub.rejects(error);

    await run();

    assert.ok(getChangedFilesStub.calledOnce);
    assert.ok(determineModulesToBuildStub.calledOnce);
    assert.ok(coreSetFailedStub.calledOnceWith(`Build custom modules failed: ${error.message}`));
  });
  
  it('should succeed with empty modulesParam if no modules determined', async () => {
    getChangedFilesStub.resolves(['file.txt']);
    determineModulesToBuildStub.resolves(new Set());

    await run();
    assert.ok(coreSetOutputStub.calledOnceWith('modulesParam', ''));
    assert.ok(coreInfoStub.calledWith('Final modulesParam to be set as output: '));
    assert.ok(coreSetFailedStub.notCalled);
  });
});
