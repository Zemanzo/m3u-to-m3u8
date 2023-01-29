import { createReadStream, existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import fsPath from "node:path";
import chalk from "chalk";
import promptly from "promptly";
import xml2js from "xml2js";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

type XmlPlaylistEntry = {
  $: {
    filename: string;
    title: string;
    id: string;
    songs: string;
    seconds: string;
  };
};

type ParsedXmlFile = {
  playlists: {
    $: { playlists: string };
    playlist: XmlPlaylistEntry[];
  };
};

const PLAYLISTS_XML_FILE = "playlists.xml";
const xmlParser = new xml2js.Parser();

run(process.argv[2]);

async function run(path: unknown): Promise<void> {
  if (!path || typeof path !== "string") {
    path = await promptly.prompt(chalk.blue("Folder path "));
  }

  if (path === "" || typeof path !== "string") {
    throw new Error("Missing `path` argument.");
  }

  if (!existsSync(path)) {
    throw new Error(`Given path "${path}" does not exist.`);
  }

  console.log("Checking ", chalk.blackBright(path));

  let files: string[] | undefined;
  try {
    files = await readdir(path, { encoding: "utf-8" });
  } catch (err) {
    console.error(err);
    throw new Error(
      `Could not read directory ${path}, are you sure this is a directory?`
    );
  }

  const playlistFiles: string[] = [];
  let hasXmlFile = false;
  for (const file of files) {
    if (file.endsWith(".m3u8")) {
      playlistFiles.push(file);
    }
    if (file === PLAYLISTS_XML_FILE) {
      hasXmlFile = true;
    }
  }

  if (!hasXmlFile) {
    throw new Error(`Playlists XML file not found.`);
  }

  let parsedXmlFile: ParsedXmlFile;
  try {
    const xmlFile = await readFile(fsPath.join(path, PLAYLISTS_XML_FILE), {
      encoding: "utf16le"
    });
    parsedXmlFile = await xmlParser.parseStringPromise(xmlFile);
  } catch (err) {
    console.error(err);
    throw new Error(`Could not parse playlists XML file.`);
  }

  if (playlistFiles.length === 0) {
    throw new Error(`No playlist files found.`);
  }

  const plural = playlistFiles.length === 1 ? "" : "s";

  console.log(
    `Found ${chalk.green(
      playlistFiles.length.toString()
    )} playlist${plural}, XML references ${chalk.green(
      parsedXmlFile.playlists.$.playlists
    )} playlists.`
  );

  const playlistMetaLookup = parsedXmlFile.playlists.playlist.reduce<
    Record<string, XmlPlaylistEntry["$"]>
  >((acc, playlist) => {
    acc[playlist.$.filename] = playlist.$;
    return acc;
  }, {});

  await configureLibraryBase(path, playlistFiles, playlistMetaLookup);
}

async function configureLibraryBase(
  path: string,
  playlistFiles: string[],
  parsedXmlFile: Record<string, XmlPlaylistEntry["$"]>
): Promise<void> {
  const pathsPromises = new Array(playlistFiles.length);
  for (let i = 0; i < playlistFiles.length; i++) {
    pathsPromises[i] = getFirstEntry(path, getRandomFromArray(playlistFiles));
  }
  const resolvedPaths = await Promise.all(pathsPromises);
  const { commonPrefix, excludeIndices } =
    findLargestCommonPrefix(resolvedPaths);

  if (commonPrefix === "") {
    console.error(pathsPromises);
    throw new Error("Could not find a common prefix");
  }

  if (excludeIndices) {
    console.log(
      chalk.red("↓ Not all files have a common prefix, will skip these files ↓")
    );
    console.table(
      excludeIndices.map((i) => ({
        title: parsedXmlFile[playlistFiles[i]]?.title ?? "-",
        path: fsPath.join(path, playlistFiles[i])
      }))
    );
    console.log(
      chalk.red("↑ Not all files have a common prefix, will skip these files ↑")
    );
  }

  const correctRoot = await promptly.confirm(
    "Root appears to be " + chalk.green(commonPrefix) + ", is this correct?"
  );

  let root: string | undefined;
  if (correctRoot) {
    root = commonPrefix;
  } else {
    root = await promptly.prompt(chalk.blue("Enter the correct root: "));
  }

  const replacementRoot = await promptly.prompt(
    chalk.blue("Enter the replacement root: ")
  );

  console.log("\n");
  console.log("\n");
  console.log("\n");
  console.log(
    "Folder: " +
      chalk.blackBright(path) +
      ` (${playlistFiles.length} playlists)`
  );
  console.log("Current root: " + chalk.blackBright(root));
  console.log("Replacement root: " + chalk.blackBright(replacementRoot));

  const proceed = await promptly.confirm(
    "Are these settings correct & do you wish to proceed? "
  );
  if (!proceed) {
    await configureLibraryBase(path, playlistFiles, parsedXmlFile);
  }
}

/**
 * Matches first line that does not start with a '#'.
 */
const firstEntryRegex = /\n([^#].*)$/m;
async function getFirstEntry(path: string, fileName: string): Promise<string> {
  const filePath = fsPath.join(path, fileName);
  const fileStream = createReadStream(filePath, { encoding: "utf-8" });
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

function getRandomFromArray<T>(arr: T[]): T {
  const random = Math.floor(Math.random() * arr.length);
  return arr[random];
}

function findLargestCommonPrefix(
  words: string[],
  excludeIndices: number[] = []
): { commonPrefix: string; excludeIndices: number[] } {
  console.log(
    "Using first entry of first playlist as baseline for checking others: ",
    chalk.blackBright(words[0])
  );
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
