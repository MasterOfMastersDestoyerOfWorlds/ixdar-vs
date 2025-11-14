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
      
      try {
        commandModule = require(path.join(testUtils.commandsDir, command.fileName));
      } catch (error) {
        test(`should load command module`, () => {
          fail(`Failed to load command '${command.commandName}': ${error}`);
        });
        return;
      }

      const commandInstance = commandModule.default;

      if (!commandInstance || !commandInstance.pipeline) {
        test(`should export valid CommandModule`, () => {
          fail(
            `Command '${command.commandName}' does not export a valid CommandModule with pipeline.`
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

          // Create mock runtime context
          const mockContext = {
            mode: "vscode" as const,
            args: {},
            messages: [] as string[],
            warnings: [] as string[],
            errors: [] as string[],
            addMessage(message: string) {
              this.messages.push(message);
            },
            addWarning(message: string) {
              this.warnings.push(message);
            },
            addError(message: string) {
              this.errors.push(message);
            },
            async collectFile(path: string, label?: string) {
              // Mock implementation
            },
            async execute(args: Record<string, unknown>) {
              return { content: [], isError: false };
            },
          };

          // Execute the command pipeline
          await commandInstance.runPipeline(mockContext, {});

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
