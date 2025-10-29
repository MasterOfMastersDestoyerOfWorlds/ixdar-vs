import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

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
  const commandsDir = path.join(__dirname, "../commands");
  const testsDir = __dirname;

  // Helper to get all command files
  function getCommandFiles(): string[] {
    if (!fs.existsSync(commandsDir)) {
      return [];
    }
    return fs
      .readdirSync(commandsDir)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => path.basename(file, ".ts"));
  }

  // Helper to get test folders for a command
  function getTestFolder(commandName: string): string | null {
    const testFolder = path.join(testsDir, commandName);
    if (fs.existsSync(testFolder)) {
      return testFolder;
    }
    return null;
  }

  // Helper to get test input files
  function getTestInputFiles(testFolder: string): string[] {
    const testInDir = path.join(testFolder, "test_in");
    if (!fs.existsSync(testInDir)) {
      return [];
    }
    return fs.readdirSync(testInDir);
  }

  // Helper to create a mock document from file content
  function createMockDocument(
    content: string,
    languageId: string = "javascript",
    uri: string = "test.js"
  ): vscode.TextDocument {
    let currentText = content;
    const lines = content.split("\n");

    return {
      uri: vscode.Uri.file(uri),
      fileName: uri,
      isUntitled: false,
      languageId,
      version: 1,
      isDirty: false,
      isClosed: false,
      save: jest.fn(),
      eol: 1,
      lineCount: lines.length,
      getText: jest.fn((range?: any) => {
        if (range) {
          // Handle range-based getText
          return currentText;
        }
        return currentText;
      }),
      lineAt: jest.fn((line: number) => {
        const lineText = lines[line] || "";
        return {
          lineNumber: line,
          text: lineText,
          range: {
            start: { line, character: 0 },
            end: { line, character: lineText.length },
          },
          rangeIncludingLineBreak: {
            start: { line, character: 0 },
            end: { line: line + 1, character: 0 },
          },
          firstNonWhitespaceCharacterIndex: lineText.search(/\S/),
          isEmptyOrWhitespace: lineText.trim().length === 0,
        };
      }),
      offsetAt: jest.fn((position: any) => {
        let offset = 0;
        for (let i = 0; i < position.row || position.line || 0; i++) {
          offset += (lines[i]?.length || 0) + 1; // +1 for newline
        }
        offset += position.column || position.character || 0;
        return offset;
      }),
      positionAt: jest.fn((offset: number) => {
        let line = 0;
        let character = 0;
        let currentOffset = 0;

        for (let i = 0; i < lines.length; i++) {
          const lineLength = lines[i].length + 1; // +1 for newline
          if (currentOffset + lineLength > offset) {
            line = i;
            character = offset - currentOffset;
            break;
          }
          currentOffset += lineLength;
        }

        return { line, character };
      }),
      getWordRangeAtPosition: jest.fn(),
      validateRange: jest.fn((range) => range),
      validatePosition: jest.fn((position) => position),
    } as any;
  }

  // Helper to create a mock editor
  function createMockEditor(document: vscode.TextDocument): vscode.TextEditor {
    let editCallback: any = null;

    return {
      document,
      selection: {
        active: { line: 0, character: 0 },
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
        isEmpty: true,
        isReversed: false,
        isSingleLine: true,
        anchor: { line: 0, character: 0 },
      },
      selections: [],
      visibleRanges: [],
      options: {},
      viewColumn: 1,
      edit: jest.fn(async (callback: any) => {
        const editBuilder = {
          replace: jest.fn((range: any, text: string) => {
            // Update the document's text
            const doc = document as any;
            doc.getText = jest.fn(() => text);
            // Update lines array for lineAt
            const newLines = text.split("\n");
            doc.lineAt = jest.fn((line: number) => {
              const lineText = newLines[line] || "";
              return {
                lineNumber: line,
                text: lineText,
                range: {
                  start: { line, character: 0 },
                  end: { line, character: lineText.length },
                },
                rangeIncludingLineBreak: {
                  start: { line, character: 0 },
                  end: { line: line + 1, character: 0 },
                },
                firstNonWhitespaceCharacterIndex: lineText.search(/\S/),
                isEmptyOrWhitespace: lineText.trim().length === 0,
              };
            });
          }),
          insert: jest.fn(),
          delete: jest.fn(),
        };
        await callback(editBuilder);
        return true;
      }),
      insertSnippet: jest.fn(),
      setDecorations: jest.fn(),
      revealRange: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
    } as any;
  }

  // Get all commands
  const commands = getCommandFiles();

  if (commands.length === 0) {
    test("should find commands", () => {
      fail("No commands found in src/commands/");
    });
  }

  // Test each command
  commands.forEach((commandName) => {
    describe(`Command: ${commandName}`, () => {
      const testFolder = getTestFolder(commandName);

      if (!testFolder) {
        test(`should have test coverage`, () => {
          fail(
            `No test folder found for command '${commandName}'. Expected folder at src/__tests__/${commandName}/`
          );
        });
        return;
      }

      const testInputFiles = getTestInputFiles(testFolder);

      if (testInputFiles.length === 0) {
        test(`should have test cases`, () => {
          fail(
            `No test cases found for command '${commandName}'. Expected files in src/__tests__/${commandName}/test_in/`
          );
        });
        return;
      }

      // Load the command module
      let commandModule: any;
      let commandFunc: any;

      try {
        commandModule = require(path.join(commandsDir, commandName));

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
              `Command '${commandName}' does not export a testable commandFunc. See TESTING_COMMANDS.md for details.`
            );
          });
          return;
        }
      } catch (error) {
        test(`should load command module`, () => {
          fail(`Failed to load command module '${commandName}': ${error}`);
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
      (cmd) => getTestFolder(cmd) !== null
    );
    const commandsWithoutTests = commands.filter(
      (cmd) => getTestFolder(cmd) === null
    );

    console.log(`\n=== Test Coverage Summary ===`);
    console.log(`Total commands: ${commands.length}`);
    console.log(`Commands with tests: ${commandsWithTests.length}`);
    console.log(`Commands without tests: ${commandsWithoutTests.length}`);

    if (commandsWithoutTests.length > 0) {
      console.log(`\nCommands missing tests:`);
      commandsWithoutTests.forEach((cmd) => console.log(`  - ${cmd}`));
    }

    expect(commandsWithoutTests.length).toBe(0);
  });
});
