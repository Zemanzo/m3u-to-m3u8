import fs from "node:fs";
import fsPromises from "node:fs/promises";
import fsPath from "node:path";
import readlinePromises from "node:readline/promises";
import { OptionValues } from "commander";
import chalk from "chalk";
import sanitizeFileName from "sanitize-filename";
import cliProgress from "cli-progress";
import promptly from "promptly";
import xml2js from "xml2js";
import {
  ExcludedFiles,
  ParsedXmlFile,
  PlaylistMeta,
  XmlPlaylistEntry
} from "./types.js";
import Utils from "./utils.js";
import { getFirstEntry, findLargestCommonPrefix } from "./playlistUtils.js";

const PLAYLISTS_XML_FILE = "playlists.xml";
const xmlParser = new xml2js.Parser();

export class M3U8Tweaker {
  options: OptionValues;
  utils: Utils;

  constructor(options: OptionValues) {
    this.options = options;
    this.utils = new Utils(options);
  }

  async run(initialPath: unknown) {
    const path = await this.getPath(initialPath);
    const { playlistFiles, parsedXmlFile } = await this.getFiles(path);
    const playlistMetaLookup = this.getPlaylistMetaLookup(parsedXmlFile);
    this.purgeAndReport(playlistFiles, playlistMetaLookup, parsedXmlFile);
    const { oldRoot, excludeIndices } = await this.getOldRoot(
      path,
      playlistFiles,
      playlistMetaLookup
    );
    const replacementRoot = await this.getReplacementRoot();
    await this.checkConfig(
      path,
      playlistFiles,
      excludeIndices,
      oldRoot,
      replacementRoot
    );
    await this.transformFilesUsingConfiguration(
      path,
      playlistFiles,
      excludeIndices,
      oldRoot,
      replacementRoot,
      playlistMetaLookup
    );
  }

  /**
   * Prompts user for a new path if none is given, throws if path is invalid.
   */
  private async getPath(path: unknown): Promise<string> {
    if (!this.options.notInteractive) {
      if (!path || typeof path !== "string") {
        path = await promptly.prompt(
          chalk.blue(
            "Enter the path of the folder that contains your playlists"
          )
        );
      }
    }

    if (path === "" || typeof path !== "string") {
      return this.utils.throw("Missing `path` argument.");
    }

    if (!fs.existsSync(path)) {
      return this.utils.throw(
        `Given path "${chalk.gray(path)}" does not exist.`
      );
    }

    return path;
  }

  /**
   * Gets playlist files & XML file.
   */
  private async getFiles(path: string) {
    this.utils.log("Checking ", chalk.gray(path));

    let files: string[] | undefined;
    try {
      files = await fsPromises.readdir(path, { encoding: "utf-8" });
    } catch (err) {
      return this.utils.throw(
        `Could not read directory ${path}, are you sure this is a directory?`,
        err
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

    if (playlistFiles.length === 0) {
      return this.utils.throw(`No playlist files found.`);
    }

    if (!hasXmlFile) {
      return this.utils.throw(`Playlists XML file not found.`);
    }

    const parsedXmlFile = await this.getParsedXmlFile(path);

    return { playlistFiles, parsedXmlFile };
  }

  /**
   * Gets XML file and parses it to a readable format.
   */
  private async getParsedXmlFile(path: string) {
    let parsedXmlFile: ParsedXmlFile;
    try {
      const xmlFile = await fsPromises.readFile(
        fsPath.join(path, PLAYLISTS_XML_FILE),
        {
          encoding: "utf16le"
        }
      );
      parsedXmlFile = await xmlParser.parseStringPromise(xmlFile);
    } catch (err) {
      this.utils.error(err);
      return this.utils.throw(`Could not parse playlists XML file.`);
    }
    return parsedXmlFile;
  }

  /**
   * Creates an easily accessible Map of playlist files.
   */
  private getPlaylistMetaLookup(parsedXmlFile: ParsedXmlFile) {
    return parsedXmlFile.playlists.playlist.reduce<PlaylistMeta>(
      (lookupMap, playlist) => {
        lookupMap.set(playlist.$.filename, playlist.$);
        return lookupMap;
      },
      new Map<string, XmlPlaylistEntry["$"]>()
    );
  }

  /**
   * Filter out playlists that are not in the XML, and inform the user about
   * the results.
   */
  private purgeAndReport(
    playlistFiles: string[],
    playlistMetaLookup: PlaylistMeta,
    parsedXmlFile: ParsedXmlFile
  ) {
    if (this.options.purgeXml) {
      const lengthBeforePurge = playlistFiles.length;
      this.utils.filterInPlace(
        playlistFiles,
        (val) => playlistMetaLookup.get(val) !== undefined
      );

      this.utils.log(
        `Ignoring ${chalk.red(
          lengthBeforePurge - playlistFiles.length
        )} playlists that are not in the XML.`
      );
    }

    const plural = playlistFiles.length === 1 ? "" : "s";

    this.utils.log(
      `Found ${chalk.green(
        playlistFiles.length.toString()
      )} playlist${plural}, XML references ${chalk.green(
        parsedXmlFile.playlists.$.playlists
      )} playlists.`
    );
  }

  private async getOldRoot(
    path: string,
    playlistFiles: string[],
    playlistMetaLookup: PlaylistMeta
  ) {
    if (this.options.oldRoot) {
      return this.determineExcludedFiles(path, playlistFiles);
    } else {
      return this.determineCommonRootAndExcludedFiles(
        path,
        playlistFiles,
        playlistMetaLookup
      );
    }
  }

  /**
   * Gets the file path of the first track in every playlist. Also creates a
   * list of all http-stream tracks, which can be skipped.
   */
  private async getFirstTrackFilePaths(path: string, playlistFiles: string[]) {
    const pathsPromises: Array<Promise<string>> = new Array(
      playlistFiles.length
    );
    for (let i = 0; i < playlistFiles.length; i++) {
      pathsPromises[i] = getFirstEntry(path, playlistFiles[i]);
    }
    const resolvedPaths = await Promise.all(pathsPromises);
    const httpStreamPathIndices = resolvedPaths.reduce<number[]>(
      (httpPaths, filePath, i) => {
        if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
          httpPaths.push(i);
        }
        return httpPaths;
      },
      []
    );

    if (httpStreamPathIndices.length > 0) {
      this.utils.log(
        `Found ${chalk.green(
          httpStreamPathIndices.length
        )} playlists with an http stream entry, ignorning these for common prefix.`
      );
    }

    return { resolvedPaths, httpStreamPathIndices };
  }

  /**
   * Uses the passed root to check which files need to be exluded.
   */
  private async determineExcludedFiles(path: string, playlistFiles: string[]) {
    const { resolvedPaths, httpStreamPathIndices } =
      await this.getFirstTrackFilePaths(path, playlistFiles);

    const excludeIndices: number[] = [];
    for (let i = 0; i < resolvedPaths.length; i++) {
      const path = resolvedPaths[i];
      if (
        path.startsWith(this.options.oldRoot) &&
        !httpStreamPathIndices.includes(i)
      ) {
        excludeIndices.push(i);
      }
    }

    if (
      excludeIndices.length + httpStreamPathIndices.length ===
      resolvedPaths.length
    ) {
      return this.utils.throw(
        `Common prefix '${this.options.oldRoot}' is not available`,
        resolvedPaths
      );
    }

    return { oldRoot: this.options.oldRoot, excludeIndices };
  }

  /**
   * Automatically gets the common root, and excludes files based on the root
   * found.
   */
  private async determineCommonRootAndExcludedFiles(
    path: string,
    playlistFiles: string[],
    playlistMetaLookup: PlaylistMeta
  ) {
    const { resolvedPaths, httpStreamPathIndices } =
      await this.getFirstTrackFilePaths(path, playlistFiles);

    this.utils.log(
      "Using first entry of first playlist as baseline for checking others: ",
      chalk.gray(resolvedPaths[0])
    );
    const { commonPrefix, excludeIndices } = findLargestCommonPrefix(
      resolvedPaths.filter(
        (val, index) => !httpStreamPathIndices.includes(index)
      )
    );

    if (commonPrefix === "") {
      return this.utils.throw("Could not find a common prefix!", resolvedPaths);
    }

    let excludedFiles: ExcludedFiles = [];
    if (excludeIndices) {
      excludedFiles = excludeIndices.reduce<ExcludedFiles>((acc, i) => {
        if (!httpStreamPathIndices.includes(i)) {
          acc.push({
            title: playlistMetaLookup.get(playlistFiles[i])?.title ?? "-",
            path: fsPath.join(path, playlistFiles[i]),
            file: playlistFiles[i]
          });
        }
        return acc;
      }, []);
      this.utils.log(
        chalk.red(
          "↓ Not all files have a common prefix, will skip these files ↓"
        )
      );
      this.utils.table(excludedFiles, ["title", "path"]);
      this.utils.log(
        chalk.red(
          "↑ Not all files have a common prefix, will skip these files ↑"
        )
      );
    }

    return { oldRoot: commonPrefix, excludeIndices };
  }

  private getReplacementRoot() {
    if (typeof this.options.newRoot === "string") {
      return this.options.newRoot;
    } else if (!this.options.notInteractive) {
      return promptly.prompt(
        chalk.blue("Enter the new root that is used as a replacement: "),
        { default: "" }
      );
    } else {
      this.utils.throw(chalk.red("No replacement path given"));
    }
  }

  /**
   * Shows configuration and prompts for correctness when interactive.
   */
  private async checkConfig(
    path: string,
    playlistFiles: string[],
    excludeIndices: number[],
    oldRoot: string,
    replacementRoot: string
  ) {
    this.utils.log("\n");
    this.utils.log(chalk.bold("FINAL CONFIGURATION:"));
    this.utils.log(
      "Folder: " +
        chalk.gray(path) +
        ` (${playlistFiles.length} playlists, ${excludeIndices.length} skipped)`
    );
    this.utils.log("Current root: " + chalk.gray(oldRoot));
    this.utils.log("Replacement root: " + chalk.gray(replacementRoot));
    this.utils.log("\n");

    if (!this.options.notInteractive) {
      const proceed = await promptly.confirm(
        "Are these settings correct & do you wish to proceed? " +
          chalk.gray(" y / n ")
      );
      if (!proceed) {
        this.utils.throw("Aborted -- incorrect configuration.");
      }
    }
  }

  /**
   * The actual transformation: It uses the configuration to read and transform
   * the playlist files into somewhat different playlist files.
   */
  // FIXME: Split this up further?
  private async transformFilesUsingConfiguration(
    path: string,
    playlistFiles: string[],
    excludeIndices: number[],
    oldRoot: string,
    replacementRoot: string,
    playlistMetaLookup: PlaylistMeta
  ) {
    const targetPath = fsPath.join(path, `m3u8tweaked`);
    if (!fs.existsSync(targetPath)) {
      await fsPromises.mkdir(targetPath);
    }

    const progressBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );

    // start the progress bar with a total value of 200 and start value of 0
    progressBar.start(playlistFiles.length - excludeIndices.length, 0);

    let i = -1;
    const sanitizedNames: string[] = [];
    for (const file of playlistMetaLookup.values()) {
      i++;
      if (excludeIndices.includes(i)) {
        continue;
      }

      const filePath = fsPath.join(path, file.filename);
      const fileStream = fs.createReadStream(filePath, {
        encoding: "utf-8",
        autoClose: true
      });
      let sanitizedName = sanitizeFileName(file.title);
      if (sanitizedNames.includes(sanitizedName)) {
        sanitizedName += " 2";
        // throwError("Santized filename causes conflict", targetFile);
      }
      sanitizedNames.push(sanitizedName);
      const targetFile = fsPath.join(targetPath, sanitizedName + ".m3u");
      const writeStream = fs.createWriteStream(targetFile, {
        encoding: "utf-8",
        autoClose: true
      });

      const lineReader = readlinePromises.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      lineReader.on("error", (err) => this.utils.throw(err));
      writeStream.on("error", (err) =>
        this.utils.throw("error in writestream", err)
      );
      fileStream.on("error", (err) =>
        this.utils.throw("error in readstream", err)
      );

      for await (const line of lineReader) {
        // Remove first line of file
        if (line.includes("#EXTM3U")) {
          continue;
        }
        // Copy over data directly if they do not start with the given root.
        if (!line.startsWith(oldRoot)) {
          writeStream.write(line + "\n");
          continue;
        }
        // Change the root
        writeStream.write(
          line.replace(oldRoot, replacementRoot).replaceAll("\\", "/") + "\n"
        );
      }

      progressBar.increment();
    }

    progressBar.stop();

    this.utils.log(
      chalk.green(`Successfully tweaked all playlists. Happy listening!`)
    );
  }
}
