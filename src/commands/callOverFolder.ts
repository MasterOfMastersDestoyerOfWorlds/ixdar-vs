
import * as vscode from "vscode";
import { CommandModuleImpl, type CommandModule, type McpResult } from "@/types/command";
import * as strings from "@/utils/templating/strings";
import * as mcp from "@/utils/ai/mcp";
import { RegisterCommand } from "@/utils/command/commandRegistry";

/**
 * callOverFolder: Call any ix command or vscode command over all files and sub folders of a given folder
 */
const commandName = "callOverFolder";
const languages = undefined;
const repoName = undefined;
const commandFunc = async () => {

};

const mcpFunc = mcp.executeCommand(commandName, (args: any) => "Command callOverFolder executed");

const description = "Call any ix command or vscode command over all files and sub folders of a given folder";
const inputSchema = {
  type: "object",
  properties: {},
};

const command: CommandModule = new CommandModuleImpl(
  repoName,
  commandName,
  languages,
  commandFunc,
  description,
  inputSchema,
  mcpFunc
);

@RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
