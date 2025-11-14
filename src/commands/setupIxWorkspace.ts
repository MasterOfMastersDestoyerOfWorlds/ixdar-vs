import * as fs from '@/utils/vscode/fs';

import * as vscode from "vscode";
import * as commandModule from '@/types/command/commandModule';
import * as commandRegistry from '@/utils/command/commandRegistry';
import * as CommandInputPlan from '@/types/command/CommandInputPlan';

import { CommandPipeline } from "@/types/command/commandModule";

/**
 * @ix-description setupIxWorkspace: Sets up the .ix workspace and installs/updates any dependencies to their latest versions
 */
const languages = undefined;
const repoName = undefined;

const pipeline: CommandPipeline = {
  input: () =>
    CommandInputPlan.createInputPlan()
    .build(),
    execute: async (_context, _inputs) => {
      const workspaceFolder = fs.getWorkspaceFolder();
      const ixFolder = await fs.makeIxFolder(workspaceFolder);
      await fs.installIxDependencies(ixFolder);
  },
  cleanup: async (context, _inputs, _result, error) => {
    if (error) {
      return;
    }
    context.addMessage("setupIxWorkspace completed.");
  },
};

const command: commandModule.CommandModule = new commandModule.CommandModuleImpl({
  repoName,
  ixModule: __ix_module,
  languages,
  pipeline,
});

@commandRegistry.RegisterCommand
class CommandExport {
  static default = command;
}

export default command;
