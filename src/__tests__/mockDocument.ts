import * as vscode from "vscode";
// Helper to create a mock document from file content
export function createMockDocument(
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
      for (let i = 0; i < position.line; i++) {
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
