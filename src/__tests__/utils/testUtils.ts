import * as fs from "fs";
import * as path from "path";

export const commandsDir = path.join(
  __dirname,
  "../../../build/webpack-debug/commands"
);
export const testsDir = path.join(__dirname, "../");

// Helper to get all command files
export function getCommandFiles(): string[] {
  if (!fs.existsSync(exports.commandsDir)) {
    return [];
  }
  return fs
    .readdirSync(exports.commandsDir)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => path.basename(file, ".ts"));
}

// Helper to get test folders for a command
export function getTestFolder(commandName: string): string | null {
  const testFolder = path.join(testsDir, commandName);
  if (fs.existsSync(testFolder)) {
    return testFolder;
  }
  return null;
}

// Helper to get test input files
export function getTestInputFiles(testFolder: string): string[] {
  const testInDir = path.join(testFolder, "test_in");
  if (!fs.existsSync(testInDir)) {
    return [];
  }
  return fs.readdirSync(testInDir);
}
