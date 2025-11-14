import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { createMockDocument } from "./mockDocument";
import { createMockEditor } from "./mockEditor";
import * as testUtils from "./utils/testUtils";

/**
 * Comprehensive test suite for all commands
 *
 * This test suite:
 * 1. Discovers all commands in src/commands/
 * 2. For each command, looks for test cases in src/__tests__/{commandName}/
 * 3. Runs each test_in file through the command and compares to test_out
 * 4. Generates failing tests for commands without test coverage
 */

describe("Command Tests", () => {

  // Get all commands
  const commandsFiles = testUtils.getCommandFiles();
  const commands = commandsFiles.map((file) => ({fileName: file, commandName: file.replace(".debug", "")}));

  if (commands.length === 0) {
    test("should find commands", () => {
      fail("No commands found in src/commands/");
    });
  }

  // Test each command
  commands.forEach((command) => {
    describe(`Command: ${command.commandName}`, () => {
      const testFolder = testUtils.getTestFolder(command.commandName);

      if (!testFolder) {
        test(`should have test coverage`, () => {
          fail(
            `No test folder found for command '${command.commandName}'. Expected folder at src/__tests__/${command.commandName}/`
          );
        });
        return;
      }

      const testInputFiles = testUtils.getTestInputFiles(testFolder);

      if (testInputFiles.length === 0) {
        test(`should have test cases`, () => {
          fail(
            `No test cases found for command '${command.commandName}'. Expected files in src/__tests__/${command.commandName}/test_in/`
          );
        });
        return;
      }

      // Load the command module
      let commandModule: any;
      let commandFunc: any;

      commandModule = require(path.join(testUtils.commandsDir, command.fileName));

      // Try to get the exported commandFunc first (preferred for testing)
      if (commandModule.commandFunc) {
        commandFunc = commandModule.commandFunc;
      } else if (commandModule.default) {
        // Fall back to extracting from default export
        const command = commandModule.default;
        commandFunc =
          (command as any).__testFunc || (command as any).commandFunc;
      }

      if (!commandFunc) {
        test(`should export testable command function`, () => {
          fail(
            `Command '${command.commandName}' does not export a testable commandFunc. See TESTING_COMMANDS.md for details.`
          );
        });
        return;
      }

      // Test each input file
      testInputFiles.forEach((inputFile) => {
        test(`should process ${inputFile} correctly`, async () => {
          const testInPath = path.join(testFolder, "test_in", inputFile);
          const testOutPath = path.join(testFolder, "test_out", inputFile);

          // Check if expected output exists
          if (!fs.existsSync(testOutPath)) {
            fail(`Expected output file not found: ${testOutPath}`);
            return;
          }

          // Read input and expected output
          const inputContent = fs.readFileSync(testInPath, "utf-8");
          const expectedOutput = fs.readFileSync(testOutPath, "utf-8");

          // Determine language from file extension
          const ext = path.extname(inputFile);
          const languageMap: { [key: string]: string } = {
            ".js": "javascript",
            ".ts": "typescript",
            ".jsx": "javascriptreact",
            ".tsx": "typescriptreact",
            ".py": "python",
            ".java": "java",
            ".cs": "csharp",
            ".cpp": "cpp",
            ".c": "c",
          };
          const languageId = languageMap[ext] || "plaintext";

          // Create mock document and editor
          const document = createMockDocument(
            inputContent,
            languageId,
            inputFile
          );
          const editor = createMockEditor(document);

          // Set active editor
          (vscode.window as any).activeTextEditor = editor;

          // Execute the command
          // We need to extract the actual command function
          // This is tricky because it's wrapped in the CommandModuleImpl
          // For now, we'll try to execute through the registered command

          // Alternative: directly access commandFunc if exposed
          // This requires modifying command structure or using reflection

          // For testing purposes, let's assume we can call the function directly
          // We'll need to modify this based on actual command structure
          // Execute the command function
          await commandFunc();

          // Get the result from the editor
          const actualOutput = document.getText();

          // Compare output
          expect(actualOutput).toBe(expectedOutput);
        });
      });
    });
  });

  // Summary test
  test("test coverage summary", () => {
    const commandsWithTests = commands.filter(
      (cmd) => testUtils.getTestFolder(cmd.commandName) !== null
    );
    const commandsWithoutTests = commands.filter(
      (cmd) => testUtils.getTestFolder(cmd.commandName) === null
    );

    console.log(`\n=== Test Coverage Summary ===`);
    console.log(`Total commands: ${commands.length}`);
    console.log(`Commands with tests: ${commandsWithTests.length}`);
    console.log(`Commands without tests: ${commandsWithoutTests.length}`);

    if (commandsWithoutTests.length > 0) {
      console.log(`\nCommands missing tests:`);
      commandsWithoutTests.forEach((cmd) => console.log(`  - ${cmd.commandName}`));
    }

    expect(commandsWithoutTests.length).toBe(0);
  });
});
