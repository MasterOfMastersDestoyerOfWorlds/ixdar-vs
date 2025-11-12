import {
  InputSchemaProperty,
  VscodeInputContext,
  McpInputContext,
  InputSchema,
} from "@/types/command/commandModule";
import type { InputStepFactory } from "@/utils/vscode/userInputs";

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

export class CommandInputBuilder<TInputs extends Record<string, any>> {
  private readonly steps: CommandInputStep<TInputs>[] = [];

  step<K extends keyof TInputs>(
    config: CommandInputStepConfig<TInputs, K> | InputStepFactory<TInputs[K]>
  ): CommandInputBuilder<TInputs> {
    if (this.steps.some((step) => step.key === config.key)) {
      throw new Error(`Input plan already defines key '${config.key}'.`);
    }

    this.steps.push({
      ...config,
      required: config.required ?? true,
    } as CommandInputStep<TInputs>);
    return this;
  }

  build(): CommandInputPlan<TInputs> {
    return new CommandInputPlan(this.steps);
  }
}

export function createInputPlan<TInputs extends Record<string, any>>(
  configure: (builder: CommandInputBuilder<TInputs>) => void
): CommandInputPlan<TInputs> {
  const builder = new CommandInputBuilder<TInputs>();
  configure(builder);
  return builder.build();
}
