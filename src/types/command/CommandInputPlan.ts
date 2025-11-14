import {
  InputSchemaProperty,
  VscodeInputContext,
  McpInputContext,
  InputSchema,
} from "@/types/command/commandModule";
import type { InputStepFactory } from "@/utils/vscode/userInputs";

/**
 * @ix-module-description Builder system for defining command input collection. Use CommandInputBuilder 
 * to define steps for gathering user inputs in VSCode or resolving them from MCP arguments.
 */

/**
 * Step configuration for building an input plan.
 */

export interface CommandInputStepConfig<
  TInputs extends Record<string, any>,
  K extends keyof TInputs = keyof TInputs,
> {
  key: K & string;
  schema: InputSchemaProperty;
  required?: boolean;
  prompt: (
    context: VscodeInputContext,
    currentValues: Partial<TInputs>
  ) => Promise<TInputs[K]>;
  resolveFromArgs?: (
    context: McpInputContext,
    currentValues: Partial<TInputs>
  ) => Promise<TInputs[K]>;
  defaultValue?: TInputs[K];
}

export interface CommandInputStep<
  TInputs extends Record<string, any>,
  K extends keyof TInputs = keyof TInputs,
> extends CommandInputStepConfig<TInputs, K> {
  required: boolean;
}

export class CommandInputPlan<TInputs extends Record<string, any>> {
  constructor(private readonly steps: CommandInputStep<TInputs>[]) {}

  get allSteps(): CommandInputStep<TInputs>[] {
    return [...this.steps];
  }

  get schema(): InputSchema {
    const properties: Record<string, InputSchemaProperty> = {};
    const required: string[] = [];

    for (const step of this.steps) {
      properties[step.key] = step.schema;
      if (step.required) {
        required.push(step.key);
      }
    }

    return {
      type: "object",
      properties,
      required,
    };
  }
}

export class CommandInputBuilder<TInputs extends Record<string, any> = {}> {
  private readonly steps: CommandInputStep<any>[] = [];

  step<K extends string, V>(
    config: InputStepFactory<K, V>
  ): CommandInputBuilder<TInputs & Record<K, V>> {
    if (this.steps.some((step) => step.key === config.key)) {
      throw new Error(`Input plan already defines key '${config.key}'.`);
    }

    this.steps.push({
      ...config,
      required: config.required ?? true,
    } as CommandInputStep<any>);
    return this as any as CommandInputBuilder<TInputs & Record<K, V>>;
  }

  build(): CommandInputPlan<TInputs> {
    return new CommandInputPlan(this.steps);
  }
}

export function createInputPlan(): CommandInputBuilder<{}> {
  return new CommandInputBuilder<{}>();
}
