"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testExports = void 0;
var core = require("@actions/core");
var github = require("@actions/github");
var path = require("path");
var fs = require("fs");
var xml2js_1 = require("xml2js");
function run() {
    return __awaiter(this, void 0, void 0, function () {
        var changedFiles, modulesToBuild, modulesParam, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, getChangedFiles()];
                case 1:
                    changedFiles = _a.sent();
                    return [4 /*yield*/, determineModulesToBuild(changedFiles)];
                case 2:
                    modulesToBuild = _a.sent();
                    modulesParam = Array.from(modulesToBuild).join(',');
                    // Log the modulesParam for debugging
                    core.info("Final modulesParam to be set as output: ".concat(modulesParam));
                    // Set modulesParam as an output variable for GitHub Actions
                    core.setOutput('modulesParam', modulesParam);
                    core.info('Build custom modules successfully.'); // Explicit success message
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    if (error_1 instanceof Error) {
                        core.setFailed("Build custom modules failed: ".concat(error_1.message));
                    }
                    else {
                        core.setFailed("Build custom modules failed: ".concat(String(error_1)));
                    }
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Rewritten getChangedFiles function using GitHub Actions toolkit
function getChangedFiles() {
    return __awaiter(this, void 0, void 0, function () {
        var token, octokit, context, owner, repo, pull_number, files, per_page, page, response, newFiles, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    token = core.getInput('github-token', { required: true });
                    octokit = github.getOctokit(token);
                    context = github.context;
                    if (context.eventName !== 'pull_request' || !context.payload.pull_request) {
                        core.warning('Not a pull request event or pull_request payload is missing. No files will be returned.');
                        return [2 /*return*/, []];
                    }
                    owner = context.repo.owner;
                    repo = context.repo.repo;
                    pull_number = context.payload.pull_request.number;
                    core.info("Fetching changed files for PR #".concat(pull_number, " in ").concat(owner, "/").concat(repo));
                    files = [];
                    per_page = 100;
                    page = 1;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 6, , 7]);
                    _a.label = 2;
                case 2: return [4 /*yield*/, octokit.rest.pulls.listFiles({
                        owner: owner,
                        repo: repo,
                        pull_number: pull_number,
                        per_page: per_page,
                        page: page,
                    })];
                case 3:
                    response = _a.sent();
                    if (response.data.length > 0) {
                        newFiles = response.data.map(function (file) { return file.filename; });
                        core.debug("Found ".concat(newFiles.length, " files on page ").concat(page, ": ").concat(newFiles.join(', ')));
                        files = files.concat(newFiles);
                    }
                    else {
                        core.debug("No files found on page ".concat(page, "."));
                    }
                    page++;
                    _a.label = 4;
                case 4:
                    if (response.data.length === per_page) return [3 /*break*/, 2];
                    _a.label = 5;
                case 5:
                    core.info("Found a total of ".concat(files.length, " changed files in the pull request."));
                    core.debug("Changed files list: ".concat(files.join(', ')));
                    return [2 /*return*/, files];
                case 6:
                    error_2 = _a.sent();
                    core.error("Error fetching changed files: ".concat(error_2.message));
                    throw error_2; // Re-throw to be caught by the main run function's try/catch
                case 7: return [2 /*return*/];
            }
        });
    });
}
// Function to determine modules to build based on changed files
function determineModulesToBuild(changedFiles) {
    return __awaiter(this, void 0, void 0, function () {
        var modulesToBuild, _i, changedFiles_1, file, modulePath;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    modulesToBuild = new Set();
                    _i = 0, changedFiles_1 = changedFiles;
                    _a.label = 1;
                case 1:
                    if (!(_i < changedFiles_1.length)) return [3 /*break*/, 4];
                    file = changedFiles_1[_i];
                    core.debug("Processing changed file: ".concat(file));
                    return [4 /*yield*/, getModuleFromFilePath(file)];
                case 2:
                    modulePath = _a.sent();
                    if (modulePath) {
                        modulesToBuild.add(modulePath);
                    }
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    core.info("Modules to build: ".concat(Array.from(modulesToBuild).join(', ')));
                    return [2 /*return*/, modulesToBuild];
            }
        });
    });
}
// Improved function to get module name from file path
function getModuleFromFilePath(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var currentDir, pomPath, moduleName, parentDir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    currentDir = path.dirname(filePath);
                    core.debug("Starting module search for file: ".concat(filePath, " in directory: ").concat(currentDir));
                    _a.label = 1;
                case 1:
                    if (!(currentDir !== path.parse(currentDir).root && currentDir !== '.')) return [3 /*break*/, 4];
                    pomPath = path.join(currentDir, 'pom.xml');
                    core.debug("Checking POM at: ".concat(pomPath));
                    if (!fs.existsSync(pomPath)) return [3 /*break*/, 3];
                    core.debug("Found pom.xml at: ".concat(pomPath));
                    return [4 /*yield*/, parseModuleNameFromPom(pomPath)];
                case 2:
                    moduleName = _a.sent();
                    if (moduleName) {
                        return [2 /*return*/, moduleName];
                    }
                    _a.label = 3;
                case 3:
                    parentDir = path.dirname(currentDir);
                    if (parentDir === currentDir) { // Check to prevent infinite loop if dirname stops changing (e.g., at root)
                        core.debug("Reached root or stalled at ".concat(currentDir, ", stopping search."));
                        return [3 /*break*/, 4];
                    }
                    currentDir = parentDir;
                    core.debug("Moving up to: ".concat(currentDir));
                    return [3 /*break*/, 1];
                case 4:
                    core.debug("No pom.xml found for file: ".concat(filePath));
                    return [2 /*return*/, null];
            }
        });
    });
}
// Helper function to parse the module name from a pom.xml file
function parseModuleNameFromPom(pomPath) {
    return __awaiter(this, void 0, void 0, function () {
        var pomXml, result, currentArtifactId, moduleName, parent_1, parentGroupId, error_3, errorMessage;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 2, , 3]);
                    pomXml = fs.readFileSync(pomPath, 'utf-8');
                    return [4 /*yield*/, (0, xml2js_1.parseStringPromise)(pomXml)];
                case 1:
                    result = _d.sent();
                    currentArtifactId = (_a = result.project.artifactId) === null || _a === void 0 ? void 0 : _a[0];
                    if (!currentArtifactId) {
                        core.warning("No artifactId found in ".concat(pomPath));
                        return [2 /*return*/, null];
                    }
                    // Check for parent groupId
                    core.debug("Current artifactId: ".concat(currentArtifactId, " in ").concat(pomPath));
                    moduleName = currentArtifactId;
                    parent_1 = (_b = result.project.parent) === null || _b === void 0 ? void 0 : _b[0];
                    if (parent_1) {
                        parentGroupId = (_c = parent_1.groupId) === null || _c === void 0 ? void 0 : _c[0];
                        if (parentGroupId) {
                            moduleName = parentGroupId + ':' + moduleName;
                        }
                    }
                    core.debug("Module name: ".concat(moduleName, " from ").concat(pomPath));
                    return [2 /*return*/, moduleName];
                case 2:
                    error_3 = _d.sent();
                    errorMessage = error_3 instanceof Error ? error_3.message : String(error_3);
                    core.error("Error parsing ".concat(pomPath, ": ").concat(errorMessage));
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/, null];
            }
        });
    });
}
// run(); // Commented out to prevent auto-execution during tests
exports.testExports = { parseModuleNameFromPom: parseModuleNameFromPom, getModuleFromFilePath: getModuleFromFilePath, determineModulesToBuild: determineModulesToBuild, getChangedFiles: getChangedFiles, run: run };
