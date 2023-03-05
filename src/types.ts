export type XmlPlaylistEntry = {
  $: {
    filename: string;
    title: string;
    id: string;
    songs: string;
    seconds: string;
  };
};

export type ParsedXmlFile = {
  playlists: {
    $: { playlists: string };
    playlist: XmlPlaylistEntry[];
  };
};

export type PlaylistMeta = Map<string, XmlPlaylistEntry["$"]>;

export type ExcludedFile = {
  title: string;
  path: string;
  file: string;
};

export type ExcludedFiles = ExcludedFile[];
