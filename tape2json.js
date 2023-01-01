const fs = require("fs"),
  everpolate = require("everpolate");

const settings = require("./settings.json"),
  { rbg2hex } = require("./scripts/functions");

const readFile = (...files) =>
  files.map((path) => {
    try {
      return JSON.parse(
        fs.readFileSync(path).toString("utf-8").replace("\x00", "")
      );
    } catch (e) {
      console.log(`Failed to read ${path}\n`);
      console.log("--> Exiting in 5 seconds");
      setTimeout(() => process.exit(1), 5000);
    }
  });

const Song = { data: {}, moves0: [], moves1: [], moves2: [], moves3: [] };

const [dtape, ktape, musictrack, songdesc] = readFile(
  `./${settings.default.inputFolder}/dtape-input.json`,
  `./${settings.default.inputFolder}/ktape-input.json`,
  `./${settings.default.inputFolder}/musictrack-input.json`,
  `./${settings.default.inputFolder}/songdesc-input.json`
);

// --> Song main json
const songInfo = songdesc.COMPONENTS[0];

Song.data = {
  MapName: songInfo.MapName,
  JDVersion: songInfo.JDVersion,
  OriginalJDVersion: songInfo.OriginalJDVersion,
  Artist: songInfo.Artist,
  Title: songInfo.Title,
  Credits: songInfo.Credits,
  NumCoach: songInfo.NumCoach,
  CountInProgression: songInfo.CountInProgression,
  DancerName: songInfo.DancerName,
  LocaleID: songInfo.LocaleID,
  MojoValue: songInfo.MojoValue,
  Mode: songInfo.Mode,
  Status: songInfo.Status,
  LyricsType: songInfo.LyricsType,
  BackgroundType: songInfo.backgroundType,
  Difficulty: songInfo.Difficulty,
  DefaultColors: {
    lyrics: `0xFF${rbg2hex(songInfo.DefaultColors.lyrics)}`,
    theme: `0xFF${rbg2hex(songInfo.DefaultColors.theme)}`,
    songColor_1A: `0xFF${rbg2hex(songInfo.DefaultColors.songcolor_1a)}`,
    songColor_1B: `0xFF${rbg2hex(songInfo.DefaultColors.songcolor_1b)}`,
    songColor_2A: `0xFF${rbg2hex(songInfo.DefaultColors.songcolor_2a)}`,
    songColor_2B: `0xFF${rbg2hex(songInfo.DefaultColors.songcolor_2b)}`,
  },
  lyricsColor: `#${rbg2hex(songInfo.DefaultColors.lyrics)}`,
};

// --> Beats
const { startBeat, markers, endBeat, previewEntry, previewLoopStart } =
  musictrack.COMPONENTS[0].trackData.structure;

let beats = markers.map((a) => Math.round(a / 48)),
  beatsMap24 = beats.map((a, i) => i * 24);

const getTime = (time) =>
  Math.round(everpolate.linear(time, beatsMap24, beats));

Song.data["videoOffset"] =
  startBeat < 0 ? beats[startBeat * -1] : -beats[startBeat];

if (beats.length - 1 < endBeat) {
  let a = beats[beats.length - 1] - beats[beats.length - 2];

  for (let b = -1, c = 0; b < endBeat - (beats.length - 1); b++) {
    beats.push(beats[beats.length - 1] + a);
  }
} else if (beats.length - 1 > endBeat) beats = beats.slice(0, endBeat);

if (startBeat < 0) {
  Song.data["beats"] = [].concat(
    beats.slice(0, startBeat * -1),
    beats.map((a) => a + Song.data["videoOffset"])
  );

  Song.data.AudioPreview = {
    coverflow: { startBeat: previewEntry + startBeat * -1 },
    prelobby: { startBeat: previewLoopStart + startBeat * -1 },
  };
} else {
  Song.data["beats"] = beats
    .slice(startBeat, beats.length)
    .map((a) => a - Song.data["videoOffset"]);

  Song.data.AudioPreview = {
    coverflow: { startBeat: previewEntry - startBeat },
    prelobby: { startBeat: previewLoopStart - startBeat },
  };
}

// --> DTape
Song.data["pictos"] = [];
Song.data["goldMoves"] = [];

dtape.Clips.forEach((clip) => {
  const { __class } = clip;

  switch (__class) {
    case "PictogramClip": {
      const { StartTime, Duration, PictoPath } = clip;

      Song.data["pictos"].push({
        time: getTime(StartTime) + Song.data["videoOffset"],
        duration: getTime(StartTime + Duration) - getTime(StartTime),
        name: PictoPath.split("/").pop().split(".")[0],
      });

      break;
    }

    case "GoldEffectClip": {
      const { StartTime, Duration, EffectType } = clip;

      Song.data["goldMoves"].push({
        time: getTime(StartTime) + Song.data["videoOffset"],
        duration: getTime(StartTime + Duration) - getTime(StartTime),
        effectType: EffectType,
      });

      break;
    }

    case "MotionClip": {
      const { StartTime, Duration, ClassifierPath, GoldMove, CoachId } = clip;

      Song[`moves${CoachId}`].push({
        time: getTime(StartTime) + Song.data["videoOffset"],
        duration: getTime(StartTime + Duration) - getTime(StartTime),
        name: ClassifierPath.split("/").pop().split(".")[0],
        goldMove: GoldMove,
      });

      break;
    }
  }
});

// --> KTape
Song.data["lyrics"] = [];

ktape.Clips.forEach((clip) => {
  const { __class } = clip;

  switch (__class) {
    case "KaraokeClip": {
      const { StartTime, Duration, Lyrics, IsEndOfLine } = clip;

      Song.data["lyrics"].push({
        time: getTime(StartTime) + Song.data["videoOffset"],
        duration: getTime(StartTime + Duration) - getTime(StartTime),
        text: Lyrics,
        isLineEnding: IsEndOfLine,
      });

      break;
    }
  }
});

// --> Sort Lyrics, Pictos, Moves
Song.data["lyrics"] = Song.data["lyrics"].sort((a, b) => {
  if (a.time < b.time) {
    return -1;
  }
});
Song.data["pictos"] = Song.data["pictos"].sort((a, b) => {
  if (a.time < b.time) {
    return -1;
  }
});
for (let coach = 0; coach < songInfo.NumCoach; coach++) {
  Song[`moves${coach}`] = Song[`moves${coach}`].sort((a, b) => {
    if (a.time < b.time) {
      return -1;
    }
  });
}


// --> Write files
if (!fs.existsSync(`./${settings.default.outputFolder}/${songInfo.MapName}`))
  fs.mkdirSync(`./${settings.default.outputFolder}/${songInfo.MapName}`, {
    recursive: true,
  });

fs.writeFileSync(
  `./${settings.default.outputFolder}/${songInfo.MapName}/${songInfo.MapName}.json`,
  settings.default.jsonp
    ? `${songInfo.MapName}(${JSON.stringify(Song.data, null, 2)})`
    : JSON.stringify(Song.data, null, 2)
);

for (let coach = 0; coach < songInfo.NumCoach; coach++)
  fs.writeFileSync(
    `./${settings.default.outputFolder}/${songInfo.MapName}/${songInfo.MapName}_moves${coach}.json`,
    settings.default.jsonp
      ? `${songInfo.MapName}${coach}(${JSON.stringify(
        Song[`moves${coach}`],
        null,
        2
      )})`
      : JSON.stringify(Song[`moves${coach}`], null, 2)
  );

// --> Output log
console.log(
  `MapName: ${songInfo.MapName}\nArtist: ${songInfo.Artist}\nTitle: ${songInfo.Title}\n`
);
console.log("--> Exiting in 5 seconds");
setTimeout(() => process.exit(1), 5000);
