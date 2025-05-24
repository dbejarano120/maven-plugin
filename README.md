# Custom Maven Build GitHub Action

This GitHub Action analyzes the files changed in a pull request to determine the Maven modules affected by these changes. It then outputs a comma-separated list of these modules, which can be used to selectively build only the necessary parts of your project, optimizing build times and resources.

## How it Works

When a pull request is opened or updated, this action:
1.  Retrieves the list of files changed in the pull request using the GitHub API.
2.  For each changed file, it traverses up the directory structure to find the nearest `pom.xml`.
3.  It parses the `pom.xml` to extract the module identifier (usually `groupId:artifactId` or just `artifactId` if no parent `groupId` is specified).
4.  A unique list of these module identifiers is compiled.
5.  This list is then made available as an output variable.

## Inputs

### `github-token`
-   **Description**: The GitHub token used to authenticate with the GitHub API for fetching pull request files.
-   **Required**: `false`
-   **Default**: `${{ github.token }}`
-   **Details**: In most cases, the default token provided by GitHub Actions is sufficient. You do not need to set this input explicitly unless you have specific permission requirements that the default token does not cover.

## Outputs

### `modulesParam`
-   **Description**: A comma-separated string of Maven module identifiers (e.g., `com.example:module-a,com.example:module-b,another-artifact`) that are affected by the changes in the pull request. If no modules are affected or no `pom.xml` files are found for the changed files, this output will be an empty string.

## Example Usage

Here's an example of how to use this action in your GitHub Actions workflow:

```yaml
name: CI Build

on:
  pull_request:
    branches: [ main ] # Or your default/target branch

jobs:
  determine-modules:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4 # It's good practice to use the latest major version

      - name: Determine Modules to Build
        id: custom-maven-build # Give an ID to the step to access its outputs
        uses: ./customavenbuildtask # Assumes action.yml is in the 'customavenbuildtask' directory
                                   # relative to the root of your repository.
        # If you were to publish this to the GitHub Marketplace, it would be:
        # uses: your-username/your-repo-name@v1

      - name: Echo Modules
        if: steps.custom-maven-build.outputs.modulesParam != ''
        run: echo "Modules to build are: ${{ steps.custom-maven-build.outputs.modulesParam }}"

      - name: Notify if no modules to build
        if: steps.custom-maven-build.outputs.modulesParam == ''
        run: echo "No specific modules identified for targeted build."

      # Example of using the output in a subsequent Maven build step
      - name: Build Specific Maven Modules
        if: steps.custom-maven-build.outputs.modulesParam != ''
        run: |
          echo "Attempting to build modules: ${{ steps.custom-maven-build.outputs.modulesParam }}"
          # Ensure your Maven setup (settings.xml, etc.) is correct
          # The -am flag means "also make" which builds projects required by the specified modules
          mvn package -DskipTests -pl ${{ steps.custom-maven-build.outputs.modulesParam }} -am
        # working-directory: ./mysite # Optional: if your main pom.xml is not in the root
```

**Note on `uses: ./customavenbuildtask`**: This path assumes your workflow file (e.g., in `.github/workflows/`) and the `customavenbuildtask` directory (containing the `action.yml` for this action) are in the same repository. The path is relative to the root of your repository.

## Development

The action is written in TypeScript. To prepare it for use, you need to compile the TypeScript code into JavaScript.

### Building the Action

1.  Ensure you have Node.js and npm installed.
2.  Install dependencies (from the root of the `customavenbuildtask` directory):
    ```bash
    npm install --prefix customavenbuildtask
    ```
3.  Run the build script (from the root of the `customavenbuildtask` directory):
    ```bash
    npm run build --prefix customavenbuildtask
    ```
    This will compile `index.ts` to `index.js` and place it in the `customavenbuildtask` directory, as specified in `tsconfig.json` and the build script in `package.json`.

Make sure to commit the generated `index.js` file (and `index.js.map` if generated and desired) along with the `action.yml` and other source files, as GitHub Actions will run the code from your repository, including the compiled JavaScript.

## License
This project is licensed under the MIT License.