const tl = require('azure-pipelines-task-lib/task');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

async function run() {
  try {
    // Get the list of changed files in the PR
    const prFiles = tl.getVariable('System.PullRequest.SourceBranch');
    if (!prFiles) {
      tl.setResult(tl.TaskResult.Failed, 'No PR files found.');
      return;
    }

    // Custom validation logic for files
    const allowedExtensions = ['.java', '.xml'];
    const changedFiles = prFiles.split('\n').filter(file =>
      allowedExtensions.some(ext => file.endsWith(ext))
    );

    if (changedFiles.length === 0) {
      tl.setResult(tl.TaskResult.Failed, 'No valid files to process.');
      return;
    }

    // Retrieve the main POM path from the task input
    const mainPomPath = tl.getInput('mainPomPath', true);
    const rootModule = path.dirname(mainPomPath);

    if (!fs.existsSync(mainPomPath)) {
      tl.setResult(tl.TaskResult.Failed, `Main POM file not found at ${mainPomPath}`);
      return;
    }

    // Find all unique Maven modules (folders containing a pom.xml) that changed
    const mavenModules = new Set();
    changedFiles.forEach(file => {
      let dir = path.dirname(file);

      // Traverse up the directory tree to find the nearest pom.xml
      while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'pom.xml'))) {
          mavenModules.add(dir);
          break;
        }
        dir = path.dirname(dir);
      }
    });

    // If no Maven modules are found, fail the task
    if (mavenModules.size === 0) {
      tl.setResult(tl.TaskResult.Failed, 'No Maven modules found for changed files.');
      return;
    }

    // Always include the root module (main module)
    mavenModules.add(rootModule);

    // Build the list of Maven modules to pass to the Maven command
    const moduleList = Array.from(mavenModules)
      .map(module => path.relative(rootModule, module)) // Relative path from root
      .join(',');

    if (!moduleList) {
      tl.setResult(tl.TaskResult.Failed, 'No valid Maven modules found.');
      return;
    }

    // Run Maven command with the main module and the changed submodules
    const mavenGoal = tl.getInput('mavenGoal', true);
    const mavenCommand = `mvn ${mavenGoal} -pl ${moduleList} -am -f ${mainPomPath}`;

    console.log(`Executing: ${mavenCommand}`);

    exec(mavenCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Maven build failed: ${stderr}`);
        tl.setResult(tl.TaskResult.Failed, `Maven build failed: ${stderr}`);
        return;
      }
      console.log(`Maven build succeeded: ${stdout}`);
      tl.setResult(tl.TaskResult.Succeeded, 'Maven build succeeded for main and changed modules.');
    });

  } catch (err) {
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

run();
