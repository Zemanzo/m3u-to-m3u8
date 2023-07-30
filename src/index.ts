import chalk from "chalk";
import { program } from "commander";
import { M3U8Tweaker } from "./main.js";

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
    "-t, --targetFolder <path>",
    "Location where the converted playlists will be stored. If left empty, it will be placed in a folder 'm3u8tweaked' next to the input files. Does NOT support relative paths.",
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
