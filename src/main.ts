import chalk from "chalk";
import { program } from "commander";
import { M3U8Tweaker } from "./program.js";

program
  .option(
    "-o, --oldRoot <path>",
    "The original root that is used for tracks in the playlists. When no value is given, it will automatically detect a common root file path."
  )
  .option(
    "-n, --newRoot <path>",
    "The new root that is used as a replacement for all tracks.",
    ""
  )
  .option(
    "-ni, --notInteractive",
    "Whether questions should be asked to get missing data. \nFor example, when --newRoot is missing, a prompt will appear asking you to type the new root path.\nUseful for automated systems.",
    false
  )
  .option("-px, --purgeXml", "Purge playlists that are not in the XML.", true)
  .option(
    "-pm, --purgeMismatch",
    "Purge playlists that have tracks that do not match the original root. http streams are always ignored and will be kept.",
    true
  )
  .option(
    "-r, --rename",
    "Rename playlists to the name found in the XML.",
    true
  )
  .option("-v, --verbose", "Show additional info and error logging.", false)
  .option(
    "-s, --silent",
    "Do not log anything. Takes precedence over --verbose.",
    false
  );

program
  .name(chalk.bgBlue("m3u8tweaks"))
  .usage(chalk.blue("[options] folderPath"));
program.description(
  chalk.italic(
    `Convert Winamp playlists so they work with Music Player Daemon.`
  )
);

let path: unknown;
const lastArgument = process.argv[process.argv.length - 1];
if (!lastArgument.startsWith("-") && process.argv.length > 2) {
  path = process.argv.pop();
}
program.parse(process.argv);

const options = program.opts();

const tweaker = new M3U8Tweaker(options);
tweaker.run(path);

// async function run(path: unknown): Promise<void> {
//   if (options.interactive) {
//     if (!path || typeof path !== "string") {
//       path = await promptly.prompt(
//         chalk.blue("Enter the path of the folder that contains your playlists")
//       );
//     }
//   }

//   if (path === "" || typeof path !== "string") {
//     return throwError("Missing `path` argument.");
//   }

//   if (!fs.existsSync(path)) {
//     return throwError(`Given path "${chalk.gray(path)}" does not exist.`);
//   }

//   console.log("Checking ", chalk.gray(path));

//   let files: string[] | undefined;
//   try {
//     files = await fsPromises.readdir(path, { encoding: "utf-8" });
//   } catch (err) {
//     return throwError(
//       `Could not read directory ${path}, are you sure this is a directory?`,
//       err
//     );
//   }

//   const playlistFiles: string[] = [];
//   let hasXmlFile = false;
//   for (const file of files) {
//     if (file.endsWith(".m3u8")) {
//       playlistFiles.push(file);
//     }
//     if (file === PLAYLISTS_XML_FILE) {
//       hasXmlFile = true;
//     }
//   }

//   if (!hasXmlFile) {
//     return throwError(`Playlists XML file not found.`);
//   }

//   let parsedXmlFile: ParsedXmlFile;
//   try {
//     const xmlFile = await fsPromises.readFile(
//       fsPath.join(path, PLAYLISTS_XML_FILE),
//       {
//         encoding: "utf16le"
//       }
//     );
//     parsedXmlFile = await xmlParser.parseStringPromise(xmlFile);
//   } catch (err) {
//     console.error(err);
//     return throwError(`Could not parse playlists XML file.`);
//   }

//   if (playlistFiles.length === 0) {
//     return throwError(`No playlist files found.`);
//   }

//   const playlistMetaLookup = parsedXmlFile.playlists.playlist.reduce<
//     Record<string, XmlPlaylistEntry["$"]>
//   >((acc, playlist) => {
//     acc[playlist.$.filename] = playlist.$;
//     return acc;
//   }, {});

//   if (options.purgeXml) {
//     const lengthBeforePurge = playlistFiles.length;
//     filterInPlace(
//       playlistFiles,
//       (val) => playlistMetaLookup[val] !== undefined
//     );

//     console.log(
//       `Ignoring ${chalk.red(
//         lengthBeforePurge - playlistFiles.length
//       )} playlists that are not in the XML.`
//     );
//   }

//   const plural = playlistFiles.length === 1 ? "" : "s";

//   console.log(
//     `Found ${chalk.green(
//       playlistFiles.length.toString()
//     )} playlist${plural}, XML references ${chalk.green(
//       parsedXmlFile.playlists.$.playlists
//     )} playlists.`
//   );

//   await configureLibraryBase(path, playlistFiles, playlistMetaLookup);
// }

// async function configureLibraryBase(
//   path: string,
//   playlistFiles: string[],
//   parsedXmlFile: Record<string, XmlPlaylistEntry["$"]>
// ): Promise<void> {
// const pathsPromises: Array<Promise<string>> = new Array(playlistFiles.length);
// for (let i = 0; i < playlistFiles.length; i++) {
//   pathsPromises[i] = getFirstEntry(path, playlistFiles[i]);
// }
// const resolvedPaths = await Promise.all(pathsPromises);
// const httpStreamPathIndices = resolvedPaths.reduce<number[]>(
//   (httpPaths, filePath, i) => {
//     if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
//       httpPaths.push(i);
//     }
//     return httpPaths;
//   },
//   []
// );

// if (httpStreamPathIndices.length > 0) {
//   console.log(
//     `Found ${chalk.green(
//       httpStreamPathIndices.length
//     )} playlists with an http stream entry, ignorning these for common prefix.`
//   );
// }

// console.log(
//   "Using first entry of first playlist as baseline for checking others: ",
//   chalk.gray(resolvedPaths[0])
// );
// const { commonPrefix, excludeIndices } = findLargestCommonPrefix(
//   resolvedPaths.filter((val, index) => !httpStreamPathIndices.includes(index))
// );

// if (commonPrefix === "") {
//   return throwError("Could not find a common prefix!", pathsPromises);
// }

// let excludedFiles = [];
// if (excludeIndices) {
//   excludedFiles = excludeIndices.reduce<
//     Array<{ title: string; path: string; file: string }>
//   >((acc, i) => {
//     if (!httpStreamPathIndices.includes(i)) {
//       acc.push({
//         title: parsedXmlFile[playlistFiles[i]]?.title ?? "-",
//         path: fsPath.join(path, playlistFiles[i]),
//         file: playlistFiles[i]
//       });
//     }
//     return acc;
//   }, []);
//   console.log(
//     chalk.red("↓ Not all files have a common prefix, will skip these files ↓")
//   );
//   console.table(excludedFiles, ["title", "path"]);
//   console.log(
//     chalk.red("↑ Not all files have a common prefix, will skip these files ↑")
//   );
// }

//   const correctRoot = await promptly.confirm(
//     chalk.blue("Root appears to be ") +
//       chalk.green(commonPrefix) +
//       chalk.blue(", is this correct?") +
//       chalk.gray(" Y / n "),
//     { default: "Y" }
//   );

//   let root: string | undefined;
//   if (correctRoot) {
//     root = commonPrefix;
//   } else {
//     // FIXME: This does not change `excludeIndices`.
//     root = await promptly.prompt(chalk.blue("Enter the correct root: "));
//   }

//   const replacementRoot = await promptly.prompt(
//     chalk.blue("Enter the new root that is used as a replacement: "),
//     { default: "" }
//   );

//   console.log("\n");
//   console.log(chalk.bold("FINAL CONFIGURATION:"));
//   console.log(
//     "Folder: " +
//       chalk.gray(path) +
//       ` (${playlistFiles.length} playlists, ${excludedFiles.length} skipped)`
//   );
//   console.log("Current root: " + chalk.gray(root));
//   console.log("Replacement root: " + chalk.gray(replacementRoot));

//   const proceed = await promptly.confirm(
//     "Are these settings correct & do you wish to proceed? " +
//       chalk.gray(" y / n ")
//   );
//   if (!proceed) {
//     await configureLibraryBase(path, playlistFiles, parsedXmlFile);
//   }

//   const targetPath = fsPath.join(path, `m3u8tweaked`);
//   if (!fs.existsSync(targetPath)) {
//     await fsPromises.mkdir(targetPath);
//   }

//   const progressBar = new cliProgress.SingleBar(
//     {},
//     cliProgress.Presets.shades_classic
//   );

//   // start the progress bar with a total value of 200 and start value of 0
//   progressBar.start(playlistFiles.length - excludedFiles.length, 0);

//   let i = -1;
//   const sanitizedNames: string[] = [];
//   for (const key in parsedXmlFile) {
//     i++;
//     const file = parsedXmlFile[key];
//     if (excludeIndices.includes(i)) {
//       continue;
//     }

//     const filePath = fsPath.join(path, file.filename);
//     const fileStream = fs.createReadStream(filePath, {
//       encoding: "utf-8",
//       autoClose: true
//     });
//     let sanitizedName = sanitizeFileName(file.title);
//     if (sanitizedNames.includes(sanitizedName)) {
//       sanitizedName += " 2";
//       // throwError("Santized filename causes conflict", targetFile);
//     }
//     sanitizedNames.push(sanitizedName);
//     const targetFile = fsPath.join(targetPath, sanitizedName + ".m3u");
//     const writeStream = fs.createWriteStream(targetFile, {
//       encoding: "utf-8",
//       autoClose: true
//     });

//     const lineReader = readlinePromises.createInterface({
//       input: fileStream,
//       crlfDelay: Infinity
//     });
//     lineReader.on("error", (err) => throwError(err));
//     writeStream.on("error", (err) => throwError("error in writestream", err));
//     fileStream.on("error", (err) => throwError("error in readstream", err));

//     for await (const line of lineReader) {
//       // Remove first line of file
//       if (line.includes("#EXTM3U")) {
//         continue;
//       }
//       // Copy over data directly if they do not start with the given root.
//       if (!line.startsWith(root)) {
//         writeStream.write(line + "\n");
//         continue;
//       }
//       // Change the root
//       writeStream.write(
//         line.replace(root, replacementRoot).replaceAll("\\", "/") + "\n"
//       );
//     }

//     progressBar.increment();
//   }

//   progressBar.stop();

//   console.log(
//     chalk.green(`Successfully tweaked all playlists. Happy listening!`)
//   );
// }
// function failIfNotInteractive(option: string) {
//   if (!options.interactive) {
//     throwError(
//       `Interactive mode is disabled, but missing value for option '${option}'.`
//     );
//   }
// }
