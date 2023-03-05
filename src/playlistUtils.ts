import fs from "node:fs";
import fsPath from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Matches first line that does not start with a '#'.
 */
const firstEntryRegex = /\n([^#].*)$/m;
export async function getFirstEntry(
  path: string,
  fileName: string
): Promise<string> {
  const filePath = fsPath.join(path, fileName);
  const fileStream = fs.createReadStream(filePath, { encoding: "utf-8" });
  let firstEntry = "";
  const writeStream = new Writable({
    write(chunk: Buffer, encoding, next): void {
      const match = chunk.toString("utf-8").match(firstEntryRegex);
      if (match?.[1]) {
        firstEntry = match?.[1];
        fileStream.destroy();
        return;
      }
      next();
    },
    autoDestroy: true
  });
  try {
    await pipeline(fileStream, writeStream);
  } catch {
    // We don't care about closing too early!
  }
  return firstEntry;
}

export function findLargestCommonPrefix(
  words: string[],
  excludeIndices: number[] = []
): { commonPrefix: string; excludeIndices: number[] } {
  // check border cases size 1 array and empty first word)
  if (!words[0] || words.length == 1)
    return { commonPrefix: words[0] || "", excludeIndices };
  let i = 0;
  // while all words have the same character at position i, increment i
  while (words[0][i] && words.every((w) => w[i] === words[0][i])) i++;

  if (i === 0) {
    const filteredWords: string[] = [];
    words.forEach((w, index) => {
      if (w[i] !== words[0][i]) {
        excludeIndices.push(index);
      } else {
        filteredWords.push(w);
      }
    });

    return findLargestCommonPrefix(filteredWords, excludeIndices);
  }

  // prefix is the substring from the beginning to the last successfully checked i
  const commonPrefix = words[0].substring(0, i);

  return { commonPrefix, excludeIndices };
}
