/**
 * Jest setup file for mocking VS Code APIs
 */

// Mock VS Code module
const mockVscode = {
  window: {
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showInputBox: jest.fn(),
    showOpenDialog: jest.fn(),
    activeTextEditor: undefined as any,
    showTextDocument: jest.fn(),
  },
  workspace: {
    workspaceFolders: undefined as any,
    getConfiguration: jest.fn(),
    fs: {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      createDirectory: jest.fn(),
      stat: jest.fn(),
    },
    onDidChangeTextDocument: jest.fn(),
    onDidCloseTextDocument: jest.fn(),
  },
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(),
    getCommands: jest.fn(),
  },
  Uri: {
    file: jest.fn((path: string) => ({ fsPath: path, toString: () => path })),
    joinPath: jest.fn(),
  },
  Position: class Position {
    constructor(public line: number, public character: number) {}
  },
  Range: class Range {
    constructor(public start: any, public end: any) {}
  },
  TextDocument: jest.fn(),
  ExtensionContext: jest.fn(),
};

jest.mock('vscode', () => mockVscode, { virtual: true });

// Export mock for test usage
export { mockVscode };

