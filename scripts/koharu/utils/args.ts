import type { GenerateType } from '../constants/generate';
import type { CreatorType } from '../creators';

export interface ParsedArgs {
  command: string;
  full: boolean;
  latest: boolean;
  list: boolean;
  dryRun: boolean;
  force: boolean;
  help: boolean;
  keep: number | null;
  backupFile: string;
  // Generate command options
  generateType: GenerateType | 'all' | null;
  model: string | null;
  // Update command options
  check: boolean;
  skipBackup: boolean;
  tag: string | null;
  rebase: boolean;
  clean: boolean;
  // New command options
  newType: CreatorType | null;
}

/**
 * 解析命令行参数
 */
const GENERATE_TYPES = ['lqips', 'similarities', 'summaries', 'all'] as const;
const NEW_TYPES = ['post', 'friend'] as const;
const BOOLEAN_FLAGS = {
  '--full': 'full',
  '--latest': 'latest',
  '--list': 'list',
  '--dry-run': 'dryRun',
  '--force': 'force',
  '--help': 'help',
  '-h': 'help',
  '--check': 'check',
  '--skip-backup': 'skipBackup',
  '--rebase': 'rebase',
  '--clean': 'clean',
} as const satisfies Record<string, keyof ParsedArgs>;
const VALUE_FLAGS = {
  '--keep': (args: ParsedArgs, value: string) => {
    const keep = Number.parseInt(value, 10);
    if (!Number.isNaN(keep) && keep > 0) args.keep = keep;
  },
  '--model': (args: ParsedArgs, value: string) => {
    args.model = value;
  },
  '--tag': (args: ParsedArgs, value: string) => {
    args.tag = value;
  },
} as const;

function getOptionValue(argv: string[], index: number): string | null {
  const value = argv[index + 1];
  return value && !value.startsWith('-') ? value : null;
}

function assignPositionalArg(args: ParsedArgs, arg: string): void {
  if (!args.command) {
    args.command = arg;
    return;
  }

  if (args.command === 'generate' && !args.generateType) {
    if (GENERATE_TYPES.includes(arg as (typeof GENERATE_TYPES)[number])) {
      args.generateType = arg as GenerateType | 'all';
    }
    return;
  }

  if (args.command === 'new' && !args.newType) {
    if (NEW_TYPES.includes(arg as (typeof NEW_TYPES)[number])) {
      args.newType = arg as CreatorType;
    }
    return;
  }

  args.backupFile = arg;
}

function applyArg(args: ParsedArgs, argv: string[], index: number): number {
  const arg = argv[index];
  const booleanKey = BOOLEAN_FLAGS[arg as keyof typeof BOOLEAN_FLAGS];
  if (booleanKey) {
    args[booleanKey] = true;
    return 0;
  }

  const valueHandler = VALUE_FLAGS[arg as keyof typeof VALUE_FLAGS];
  if (valueHandler) {
    const value = getOptionValue(argv, index);
    if (value !== null) {
      valueHandler(args, value);
      return 1;
    }
    return 0;
  }

  if (!arg.startsWith('-')) assignPositionalArg(args, arg);
  return 0;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const args: ParsedArgs = {
    command: '',
    full: false,
    latest: false,
    list: false,
    dryRun: false,
    force: false,
    help: false,
    keep: null,
    backupFile: '',
    generateType: null,
    model: null,
    check: false,
    skipBackup: false,
    tag: null,
    rebase: false,
    clean: false,
    newType: null,
  };

  for (let i = 0; i < argv.length; i++) {
    i += applyArg(args, argv, i);
  }

  return args;
}
