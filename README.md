# Maven Custom Modules Extension

This Azure DevOps extension is designed to help streamline Maven builds by cheking and identifying the modules affected by changes in a pull request. The extension scans modified files, determines the relevant modules, and sets these modules in a variable called `modulesParam`. This variable can be used as an input for a Maven build task to limit the scope of the build to only include the necessary modules, **optimizing build times and resources**.

#### Before

![image before](https://raw.githubusercontent.com/dbejarano120/maven-plugin/refs/heads/main/images/before-command.png)

#### After

![image command](https://raw.githubusercontent.com/dbejarano120/maven-plugin/refs/heads/main/images/command-after.png)


![image info](https://raw.githubusercontent.com/dbejarano120/maven-plugin/refs/heads/main/images/result-after.png)


## Features

- **Automated Module Detection**: The extension automatically scans files changed in a pull request, identifies the affected modules, and sets these modules in a variable.
- **Customizable Maven Options**: The `modulesParam` variable is used to specify the relevant modules for Maven, enabling you to build only the required modules rather than the entire project.
- **Integration with Maven Build**: The generated `modulesParam` variable can be used as an input for a Maven task, which then sets specific Maven options to build only the identified modules.

## Getting Started

### Prerequisites

- Azure DevOps account
- Basic knowledge of Azure Pipelines and Maven

### Installation

1. Go to the [Azure DevOps Marketplace](https://marketplace.visualstudio.com/items?itemName=dbejarano120.custom-maven-build-task) and install the **Maven Custom Modules Build Extension** for your organization.
2. Configure the extension in your Azure DevOps pipeline.

### Usage

#### Step 1: Add the Maven Build Validator Task to Your Pipeline

Add the custom `customMavenBuildTask` to your pipeline YAML file. This task will scan the changed files and identify the modules that need to be built.

```yaml
- task: customMavenBuildTask@1
  name: GenerateModulesParam
```
####  Step 2: Set Maven Options with modulesParam
After the customMavenBuildTask runs, it sets the modulesParam variable. You can then use this variable in a Maven task to control the scope of the build.

```yaml
variables:
  mavenOptions: ''  # Set mavenOptions to an empty string by default   

- script: |
    if [ -n "$(GenerateModulesParam.modulesParam)" ]; then
      echo "##vso[task.setvariable variable=mavenOptions]-pl $(GenerateModulesParam.modulesParam) -am"
    fi 
  displayName: 'Set Maven Options' # Set the mavenOptions variable only if modulesParam has a value

- task: Maven@4
  inputs:
    mavenPomFile: './mysite/pom.xml'
    publishJUnitResults: true
    testResultsFiles: '**/surefire-reports/TEST-*.xml'
    javaHomeOption: 'JDKVersion'
    mavenVersionOption: 'Default'
    mavenAuthenticateFeed: false
    effectivePomSkip: false
    sonarQubeRunAnalysis: false
    options: $(mavenOptions)
```
### How It Works

**File Scan:** The `customMavenBuildTask` scans files changed and identifies the corresponding Maven modules.

**Variable Setting:** It then sets the `modulesParam` variable with the names of the relevant modules, which can be referenced as input for other tasks. The modules follow the format `groupId:artifactId`

**Maven Task Configuration:** By using the `modulesParam` in a Maven task’s options field, you limit the build to only the modified modules, reducing build times and resource usage.  Maven has an option `-pl` to include or exclude modules. So, the variable `mavenOptions` at the end will be `-pl $(GenerateModulesParam.modulesParam) -am`

### Example YAML Pipeline
Below is an example Azure Pipeline that uses the Maven Build Validator Extension:

```yaml
trigger:
- master

pr:
  branches:
    include:
    - "*"

pool:
  vmImage: ubuntu-latest

variables:
  mavenOptions: ''  # Set mavenOptions to an empty string by default   

steps:
- script: echo Hello, world!
  displayName: 'Run a one-line script'

- task: customMavenBuildTask@1
  name: GenerateModulesParam

# Set the mavenOptions variable only if modulesParam has a value
- script: |
    if [ -n "$(GenerateModulesParam.modulesParam)" ]; then
      echo "##vso[task.setvariable variable=mavenOptions]-pl $(GenerateModulesParam.modulesParam) -am"
    fi
  displayName: 'Set Maven Options'

- task: Maven@4
  inputs:
    mavenPomFile: './mysite/pom.xml'
    publishJUnitResults: true
    testResultsFiles: '**/surefire-reports/TEST-*.xml'
    javaHomeOption: 'JDKVersion'
    mavenVersionOption: 'Default'
    mavenAuthenticateFeed: false
    effectivePomSkip: false
    sonarQubeRunAnalysis: false
    options: $(mavenOptions)

- script: |
    echo Add other tasks to build, test, and deploy your project.
    echo See https://aka.ms/yaml
  displayName: 'Run a multi-line script'
```

### Support

For questions or feedback, please reach out through the Azure DevOps Marketplace

### Build the project for customization

**Go to customavenbuildtask and then run**
`npx tsc`

**Go to the root folder and the run**
`tfx extension create --manifest-globs vss-extension.json`

### License
This project is licensed under the MIT License. See the [LICENSE](https://github.com/dbejarano120/maven-plugin/blob/main/LICENSE.txt) file for details.