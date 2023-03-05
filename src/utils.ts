/* eslint-disable no-console */
import chalk from "chalk";
import { OptionValues } from "commander";

export default class Utils {
  options: OptionValues;

  constructor(options: OptionValues) {
    this.options = options;
  }

  throw(error: string, extraInfo?: any): never {
    this.error(chalk.red(error));
    if (this.options.verbose) {
      this.error(extraInfo);
      this.error(console.trace());
    }
    process.exit(1);
  }

  filterInPlace<T extends any[]>(
    array: T,
    condition: (value: T[number], index?: number, array?: T) => boolean
  ): T {
    let i = 0,
      j = 0;

    while (i < array.length) {
      const val = array[i];
      if (condition(val, i, array)) array[j++] = val;
      i++;
    }

    array.length = j;
    return array;
  }

  log(...args: Parameters<typeof console.log>) {
    if (!this.options.silent) {
      console.log(...args);
    }
  }

  warn(...args: Parameters<typeof console.warn>) {
    if (!this.options.silent) {
      console.warn(...args);
    }
  }

  error(...args: Parameters<typeof console.error>) {
    if (!this.options.silent) {
      console.error(...args);
    }
  }

  table(...args: Parameters<typeof console.table>) {
    if (!this.options.silent) {
      console.table(...args);
    }
  }
}
