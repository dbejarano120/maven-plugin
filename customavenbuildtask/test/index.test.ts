import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import { testExports } from '../index'; // Imports all exported functions including 'run'
import * as tl from 'azure-pipelines-task-lib/task';
import * as azdev from 'azure-devops-node-api';

// Destructure all functions from testExports for use in tests
const { parseModuleNameFromPom, getModuleFromFilePath, determineModulesToBuild, getChangedFiles, run } = testExports;

describe('parseModuleNameFromPom', () => {
  let readFileSyncStub: sinon.SinonStub;
  let consoleErrorStub: sinon.SinonStub;

  beforeEach(() => {
    readFileSyncStub = sinon.stub(fs, 'readFileSync');
    consoleErrorStub = sinon.stub(console, 'error');
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

  it('should return null when pom.xml is missing artifactId', async () => {
    const pomXml = '<project><parent><groupId>com.example</groupId></parent></project>';
    readFileSyncStub.returns(pomXml);
    const moduleName = await parseModuleNameFromPom('dummy/pom.xml');
    assert.strictEqual(moduleName, null);
  });

  it('should return null when pom.xml is malformed', async () => {
    const pomXml = '<project><artifactId>my-artifact</artifactBadTag>';
    readFileSyncStub.returns(pomXml);
    const moduleName = await parseModuleNameFromPom('dummy/pom.xml');
    assert.strictEqual(moduleName, null);
    assert.ok(consoleErrorStub.calledOnce);
  });

  it('should return null when pom.xml file does not exist', async () => {
    readFileSyncStub.throws(new Error('ENOENT: no such file or directory'));
    const moduleName = await parseModuleNameFromPom('nonexistent/pom.xml');
    assert.strictEqual(moduleName, null);
    assert.ok(consoleErrorStub.calledOnce);
  });

  it('should return artifactId even if parent groupID is empty string', async () => {
    const pomXml = '<project><parent><groupId></groupId></parent><artifactId>my-artifact</artifactId></project>';
    readFileSyncStub.returns(pomXml);
    const moduleName = await parseModuleNameFromPom('dummy/pom.xml');
    assert.strictEqual(moduleName, ':my-artifact');
  });

  it('should handle pom.xml with only parent and no artifactId gracefully', async () => {
    const pomXml = '<project><parent><groupId>com.example</groupId></parent></project>';
    readFileSyncStub.returns(pomXml);
    const moduleName = await parseModuleNameFromPom('dummy/pom.xml');
    assert.strictEqual(moduleName, null);
  });
});

describe('getModuleFromFilePath', () => {
  let existsSyncStub: sinon.SinonStub;
  let parseModuleNameFromPomStub: sinon.SinonStub;

  beforeEach(() => {
    existsSyncStub = sinon.stub(fs, 'existsSync');
    parseModuleNameFromPomStub = sinon.stub(testExports, 'parseModuleNameFromPom');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return module name if pom.xml found by traversing up', async () => {
    const filePath = 'moduleA/src/main/java/com/example/File.java';
    const targetPomDir = 'moduleA';
    const expectedPomPath = path.join('.', targetPomDir, 'pom.xml');
    existsSyncStub.callsFake((p: string) => path.normalize(p) === path.normalize(expectedPomPath));
    parseModuleNameFromPomStub.withArgs(expectedPomPath).resolves('moduleA-name');
    const moduleName = await getModuleFromFilePath(filePath);
    assert.strictEqual(moduleName, 'moduleA-name');
  });

  it('should return module name if pom.xml found in a parent directory', async () => {
    const filePath = 'project/sub-module/src/main/java/com/example/File.java';
    const parentPomDir = 'project/sub-module';
    const expectedParentPomPath = path.join('.', parentPomDir, 'pom.xml');
    existsSyncStub.callsFake((p: string) => path.normalize(p) === path.normalize(expectedParentPomPath));
    parseModuleNameFromPomStub.withArgs(expectedParentPomPath).resolves('module-in-parent-dir');
    const moduleName = await getModuleFromFilePath(filePath);
    assert.strictEqual(moduleName, 'module-in-parent-dir');
  });

  it('should return null if no pom.xml found in the hierarchy', async () => {
    const filePath = 'project/sub-module/src/main/java/com/example/File.java';
    existsSyncStub.returns(false);
    const moduleName = await getModuleFromFilePath(filePath);
    assert.strictEqual(moduleName, null);
  });

  it('should return null if pom.xml exists but parseModuleNameFromPom returns null', async () => {
    const filePath = 'moduleB/src/File.ts';
    const pomDir = 'moduleB';
    const expectedPomPath = path.join('.', pomDir, 'pom.xml');
    existsSyncStub.callsFake((p: string) => path.normalize(p) === path.normalize(expectedPomPath));
    parseModuleNameFromPomStub.withArgs(expectedPomPath).resolves(null);
    const moduleName = await getModuleFromFilePath(filePath);
    assert.strictEqual(moduleName, null);
  });
});

describe('determineModulesToBuild', () => {
  let getModuleFromFilePathStub: sinon.SinonStub;

  beforeEach(() => {
    getModuleFromFilePathStub = sinon.stub(testExports, 'getModuleFromFilePath');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return an empty Set for an empty list of changed files', async () => {
    const modules = await determineModulesToBuild([]);
    assert.deepStrictEqual(modules, new Set());
  });

  it('should return a Set with one module if a single file maps to a module', async () => {
    getModuleFromFilePathStub.withArgs('file1.java').resolves('module-a');
    const modules = await determineModulesToBuild(['file1.java']);
    assert.deepStrictEqual(modules, new Set(['module-a']));
  });

  it('should return a Set with multiple modules for multiple files mapping to different modules', async () => {
    getModuleFromFilePathStub.withArgs('file1.java').resolves('module-a');
    getModuleFromFilePathStub.withArgs('file2.java').resolves('module-b');
    const modules = await determineModulesToBuild(['file1.java', 'file2.java']);
    assert.deepStrictEqual(modules, new Set(['module-a', 'module-b']));
  });

  it('should return a Set with a single module if multiple files map to the same module (deduplication)', async () => {
    getModuleFromFilePathStub.withArgs('file1.java').resolves('module-a');
    getModuleFromFilePathStub.withArgs('file2.java').resolves('module-a');
    const modules = await determineModulesToBuild(['file1.java', 'file2.java']);
    assert.deepStrictEqual(modules, new Set(['module-a']));
  });

  it('should return an empty Set if a changed file does not map to any module', async () => {
    getModuleFromFilePathStub.withArgs('file1.java').resolves(null);
    const modules = await determineModulesToBuild(['file1.java']);
    assert.deepStrictEqual(modules, new Set());
  });

  it('should correctly identify modules in a mixed scenario (some found, some not)', async () => {
    getModuleFromFilePathStub.withArgs('file1.java').resolves('module-a');
    getModuleFromFilePathStub.withArgs('file2.java').resolves(null);
    getModuleFromFilePathStub.withArgs('file3.java').resolves('module-b');
    const modules = await determineModulesToBuild(['file1.java', 'file2.java', 'file3.java']);
    assert.deepStrictEqual(modules, new Set(['module-a', 'module-b']));
  });
});

describe('getChangedFiles', () => {
  let getVariableStub: sinon.SinonStub;
  let getPersonalAccessTokenHandlerStub: sinon.SinonStub;
  let webApiStub: sinon.SinonStub;
  let getGitApiStub: sinon.SinonStub;
  let getPullRequestIterationsStub: sinon.SinonStub;
  let getPullRequestIterationChangesStub: sinon.SinonStub;
  let consoleLogStub: sinon.SinonStub;

  const mockGitApi = {
    getPullRequestIterations: async () => {},
    getPullRequestIterationChanges: async () => {},
  };

  beforeEach(() => {
    getVariableStub = sinon.stub(tl, 'getVariable');
    getPersonalAccessTokenHandlerStub = sinon.stub(azdev, 'getPersonalAccessTokenHandler');
    getGitApiStub = sinon.stub().resolves(mockGitApi);
    webApiStub = sinon.stub(azdev, 'WebApi').returns({ getGitApi: getGitApiStub } as any);
    getPullRequestIterationsStub = sinon.stub(mockGitApi, 'getPullRequestIterations');
    getPullRequestIterationChangesStub = sinon.stub(mockGitApi, 'getPullRequestIterationChanges');
    consoleLogStub = sinon.stub(console, 'log');
  });

  afterEach(() => {
    sinon.restore();
  });

  const setValidPipelineVariables = () => {
    getVariableStub.withArgs('System.TeamFoundationCollectionUri').returns('mockOrgUrl');
    getVariableStub.withArgs('System.TeamProject').returns('mockProject');
    getVariableStub.withArgs('Build.Repository.ID').returns('mockRepoId');
    getVariableStub.withArgs('System.PullRequest.PullRequestId').returns('123');
    getVariableStub.withArgs('System.AccessToken').returns('mockToken');
  };

  it('should throw error if System.TeamFoundationCollectionUri is missing', async () => {
    setValidPipelineVariables();
    getVariableStub.withArgs('System.TeamFoundationCollectionUri').returns(undefined);
    await assert.rejects(testExports.getChangedFiles(), /Missing required environment variables/);
  });

  it('should throw error if System.AccessToken is missing', async () => {
    setValidPipelineVariables();
    getVariableStub.withArgs('System.AccessToken').returns(undefined);
    await assert.rejects(testExports.getChangedFiles(), /Access token is not available/);
  });

  it('should return list of changed files on successful API calls', async () => {
    setValidPipelineVariables();
    getPersonalAccessTokenHandlerStub.returns({});
    getPullRequestIterationsStub.resolves([{ id: 1 }, { id: 2 }] as any);
    getPullRequestIterationChangesStub.withArgs('mockRepoId', 123, 2, 'mockProject').resolves({
      changeEntries: [{ item: { path: '/file1.ts' } }, { item: { path: '/file2.ts' } }],
    } as any);
    const files = await testExports.getChangedFiles();
    assert.deepStrictEqual(files, ['/file1.ts', '/file2.ts']);
  });

  it('should return empty list if API returns no changes', async () => {
    setValidPipelineVariables();
    getPersonalAccessTokenHandlerStub.returns({});
    getPullRequestIterationsStub.resolves([{ id: 1 }] as any);
    getPullRequestIterationChangesStub.resolves({ changeEntries: [] } as any);
    const files = await testExports.getChangedFiles();
    assert.deepStrictEqual(files, []);
  });

  it('should filter out changes with no item or no path', async () => {
    setValidPipelineVariables();
    getPersonalAccessTokenHandlerStub.returns({});
    getPullRequestIterationsStub.resolves([{ id: 1 }] as any);
    getPullRequestIterationChangesStub.resolves({
      changeEntries: [ { item: { path: '/file1.ts' } }, { item: {} }, { item: { path: null } }, { item: { path: '/file3.ts' } }, {}],
    } as any);
    const files = await testExports.getChangedFiles();
    assert.deepStrictEqual(files, ['/file1.ts', '/file3.ts']);
  });

  it('should throw error if no iterations are found', async () => {
    setValidPipelineVariables();
    getPersonalAccessTokenHandlerStub.returns({});
    getPullRequestIterationsStub.resolves([] as any);
    await assert.rejects(testExports.getChangedFiles(), /Could not find any iterations for the pull request/);
  });

  it('should throw error if getPullRequestIterations API call fails', async () => {
    setValidPipelineVariables();
    getPersonalAccessTokenHandlerStub.returns({});
    const apiError = new Error('API Failure');
    getPullRequestIterationsStub.rejects(apiError);
    await assert.rejects(testExports.getChangedFiles(), apiError);
  });
});

describe('run', () => {
  let getChangedFilesStub: sinon.SinonStub;
  let determineModulesToBuildStub: sinon.SinonStub;
  let setResultStub: sinon.SinonStub;
  let consoleLogStub: sinon.SinonStub; // To check for ##vso command

  beforeEach(() => {
    // Stub dependencies used by run
    getChangedFilesStub = sinon.stub(testExports, 'getChangedFiles');
    determineModulesToBuildStub = sinon.stub(testExports, 'determineModulesToBuild');
    setResultStub = sinon.stub(tl, 'setResult');
    consoleLogStub = sinon.stub(console, 'log'); // Suppress and spy on console.log
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should succeed and set modulesParam for a single module', async () => {
    getChangedFilesStub.resolves(['file1.java']);
    determineModulesToBuildStub.resolves(new Set(['module-a']));

    await run(); // Call the actual run function from testExports

    assert.ok(getChangedFilesStub.calledOnce, 'getChangedFiles not called once');
    assert.ok(determineModulesToBuildStub.calledOnceWith(['file1.java']), 'determineModulesToBuild not called with correct args');
    assert.ok(consoleLogStub.calledWith('modulesParam: module-a'), 'modulesParam not logged correctly');
    assert.ok(consoleLogStub.calledWith('##vso[task.setvariable variable=modulesParam;isOutput=true]module-a'), 'VSO task variable not set correctly');
    assert.ok(setResultStub.calledOnceWith(tl.TaskResult.Succeeded, 'Build custom modules successfully.'), 'setResult not called with Succeeded');
  });

  it('should fail if getChangedFiles throws an error', async () => {
    const error = new Error('Failed to get files');
    getChangedFilesStub.rejects(error);

    await run();

    assert.ok(getChangedFilesStub.calledOnce, 'getChangedFiles not called once');
    assert.ok(determineModulesToBuildStub.notCalled, 'determineModulesToBuild was called');
    assert.ok(setResultStub.calledOnceWith(tl.TaskResult.Failed, `Build custom modules failed: ${error}`), 'setResult not called with Failed and correct error');
  });

  it('should fail if determineModulesToBuild throws an error', async () => {
    getChangedFilesStub.resolves(['file1.java']);
    const error = new Error('Failed to determine modules');
    determineModulesToBuildStub.rejects(error);

    await run();

    assert.ok(getChangedFilesStub.calledOnce, 'getChangedFiles not called once');
    assert.ok(determineModulesToBuildStub.calledOnce, 'determineModulesToBuild not called once');
    assert.ok(setResultStub.calledOnceWith(tl.TaskResult.Failed, `Build custom modules failed: ${error}`), 'setResult not called with Failed and correct error');
  });

  it('should succeed and set modulesParam for multiple modules', async () => {
    getChangedFilesStub.resolves(['file1.java', 'file2.java']);
    const modules = new Set(['module-a', 'module-b']);
    determineModulesToBuildStub.resolves(modules);

    await run();
    
    // Order of elements in a Set when converted to array might vary, so check both possibilities for the VSO command
    const possibleOutputs = ['module-a,module-b', 'module-b,module-a'];
    const vsoLog = consoleLogStub.getCalls().find(call => call.args[0].startsWith('##vso[task.setvariable'));
    assert.ok(vsoLog, 'VSO task variable log not found');
    const loggedModules = vsoLog.args[0].split(']')[1];
    assert.ok(possibleOutputs.includes(loggedModules), `VSO task variable for modules not set correctly. Got: ${loggedModules}`);
    
    assert.ok(setResultStub.calledOnceWith(tl.TaskResult.Succeeded, 'Build custom modules successfully.'), 'setResult not called with Succeeded');
  });

  it('should succeed and set empty modulesParam if no modules are determined', async () => {
    getChangedFilesStub.resolves(['file1.java']);
    determineModulesToBuildStub.resolves(new Set()); // Empty set

    await run();

    assert.ok(consoleLogStub.calledWith('modulesParam: '), 'modulesParam not logged correctly for empty set');
    assert.ok(consoleLogStub.calledWith('##vso[task.setvariable variable=modulesParam;isOutput=true]'), 'VSO task variable not set correctly for empty set');
    assert.ok(setResultStub.calledOnceWith(tl.TaskResult.Succeeded, 'Build custom modules successfully.'), 'setResult not called with Succeeded');
  });
});
