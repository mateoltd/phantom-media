export type Locale = "en" | "es";

const english = {
  language: {
    label: "Language",
  },
  nav: {
    home: "Phantom home",
  },
  search: {
    defaultPlaceholder: "Paste a link or search",
    searchPlaceholder: "Search YouTube",
    paste: "Paste",
    working: "Working",
    findMedia: "Find media",
    looking: "Looking for matches",
    suggestions: "Suggestions",
  },
  home: {
    headlineTop: "Keep the",
    headlineBottom: "good stuff",
    promise: "Video and audio, straight to your browser.",
    desktopSteps: ["Paste a link", "Choose a format", "Save the file"],
    restrictedTitle: "Downloads are temporarily unavailable",
    restrictedBody:
      "Search still works while the media service is being restored.",
    resolvingTitle: "Finding your media",
    itemsFound: "items found",
    itemFound: "item found",
    batch: "Download all",
    accepts: {
      title: "What you can paste",
      items: [
        "youtube.com/watch?v=...",
        "youtu.be/...",
        "youtube.com/playlist?list=...",
        "An 11-character video ID",
        "Or just words, to search",
      ],
    },
    formats: {
      title: "What you get back",
      items: [
        { name: "MP4", copy: "Video and audio, merged" },
        { name: "WebM", copy: "Video and audio, merged" },
        { name: "MP3", copy: "Audio, extracted" },
        { name: "OGG", copy: "Audio, extracted" },
      ],
      note: "Up to the highest quality the source offers.",
    },
    delivery: {
      title: "How the file reaches you",
      lines: [
        "The file is built on our server, then handed to your browser's own download manager.",
        "It is deleted from the server the moment the transfer ends.",
        "No account, no extension, nothing to install.",
      ],
    },
    independent:
      "Phantom is independent and is not affiliated with YouTube or Google.",
    authorizedOnly: "Only save media you own or have permission to download.",
    disclaimer: "Legal disclaimer",
  },
  format: {
    close: "Close format chooser",
    unavailableTitle: "Downloads are temporarily unavailable",
    unavailableBody: "The media service is restricted. Please try again later.",
    loading: "Checking available formats",
    error: "Couldn't load formats",
    mediaType: "Media type",
    video: "Video",
    audio: "Audio",
    quality: "Quality",
    format: "Format",
    noFormats: "No formats available",
    source: "Source",
    converted: "Converted",
    merged: "Merged",
    original: "Original",
    cancel: "Cancel",
    prepare: "Download",
    done: "Done",
    tryAgain: "Try again",
    back: "Choose another format",
    stop: "Stop download",
  },
  batch: {
    selected: "selected",
    close: "Close batch download",
    fileFormat: "File format",
    videoQuality: "Video quality",
    selectAll: "Select all",
    deselectAll: "Deselect all",
    selectOne: "Select at least one video",
    cancel: "Cancel",
    add: "Start downloads",
    back: "Change selection",
    preparing: "Preparing files",
    running: "Downloads",
    done: "Done",
    highest: "Highest",
    lowest: "Lowest",
    upTo: "Up to",
    audio: "Audio",
  },
  queue: {
    keepOpen: "Keep this tab open while files transfer.",
    cancel: "Cancel download",
    restart: "Restart download",
    remove: "Remove download",
    audio: "Audio",
    saved: "Saved",
    failed: "Download failed",
    canceled: "Canceled",
    savedByBrowser: "Saved by browser",
    waitingToStart: "Waiting to start",
    resolving: "Finding media",
    downloading: "Downloading",
    converting: "Converting audio",
    muxing: "Combining video and audio",
    opening: "Opening browser download",
    transferring: "Sending file to browser",
    preparing: "Preparing download",
    queued: "Queued",
    complete: "Transfer complete",
    left: "left",
  },
  results: {
    searchFor: "Search",
    empty: "No results found",
    emptyHelp: "Try a different title, or paste a link.",
    views: "views",
  },
  watch: {
    loading: "Loading video",
    missing: "Add a video ID to the address, like /watch?v=VIDEO_ID",
    download: "Download",
    tryAgain: "Try again",
  },
  playlist: {
    loading: "Loading playlist",
    missing: "Add a playlist ID to the address, like /playlist?list=PLAYLIST_ID",
    downloadAll: "Download all",
  },
  footer: {
    independent: "Phantom is an independent, free web utility.",
    use: "Only download media you own or may legally save.",
    disclaimer: "Legal disclaimer",
  },
} as const;

type WidenStrings<T> = T extends string
  ? string
  : T extends readonly string[]
    ? readonly string[]
    : T extends readonly (infer Item)[]
    ? readonly WidenStrings<Item>[]
    : {
        [Key in keyof T]: WidenStrings<T[Key]>;
      };

export type Messages = WidenStrings<typeof english>;

const spanish: Messages = {
  language: {
    label: "Idioma",
  },
  nav: {
    home: "Inicio de Phantom",
  },
  search: {
    defaultPlaceholder: "Pega un enlace o busca",
    searchPlaceholder: "Busca en YouTube",
    paste: "Pegar",
    working: "Buscando",
    findMedia: "Buscar",
    looking: "Buscando coincidencias",
    suggestions: "Sugerencias",
  },
  home: {
    headlineTop: "Quédate con",
    headlineBottom: "lo bueno",
    promise: "Vídeo y audio, directo a tu navegador.",
    desktopSteps: ["Pega un enlace", "Elige un formato", "Guarda el archivo"],
    restrictedTitle: "Las descargas no están disponibles temporalmente",
    restrictedBody:
      "La búsqueda sigue funcionando mientras se restaura el servicio.",
    resolvingTitle: "Buscando el contenido",
    itemsFound: "elementos encontrados",
    itemFound: "elemento encontrado",
    batch: "Descargar todo",
    accepts: {
      title: "Qué puedes pegar",
      items: [
        "youtube.com/watch?v=...",
        "youtu.be/...",
        "youtube.com/playlist?list=...",
        "Un ID de vídeo de 11 caracteres",
        "O solo palabras, para buscar",
      ],
    },
    formats: {
      title: "Qué recibes",
      items: [
        { name: "MP4", copy: "Vídeo y audio, combinados" },
        { name: "WebM", copy: "Vídeo y audio, combinados" },
        { name: "MP3", copy: "Audio, extraído" },
        { name: "OGG", copy: "Audio, extraído" },
      ],
      note: "Hasta la máxima calidad que ofrezca la fuente.",
    },
    delivery: {
      title: "Cómo llega el archivo",
      lines: [
        "El archivo se prepara en nuestro servidor y pasa al gestor de descargas de tu navegador.",
        "Se borra del servidor en cuanto termina la transferencia.",
        "Sin cuenta, sin extensión, sin instalar nada.",
      ],
    },
    independent:
      "Phantom es independiente y no está afiliado con YouTube ni Google.",
    authorizedOnly:
      "Guarda únicamente contenido propio o que tengas permiso para descargar.",
    disclaimer: "Aviso legal",
  },
  format: {
    close: "Cerrar selector de formato",
    unavailableTitle: "Las descargas no están disponibles temporalmente",
    unavailableBody:
      "El servicio multimedia está restringido. Inténtalo de nuevo más tarde.",
    loading: "Comprobando formatos disponibles",
    error: "No se pudieron cargar los formatos",
    mediaType: "Tipo de archivo",
    video: "Vídeo",
    audio: "Audio",
    quality: "Calidad",
    format: "Formato",
    noFormats: "No hay formatos disponibles",
    source: "Original",
    converted: "Convertido",
    merged: "Combinado",
    original: "Original",
    cancel: "Cancelar",
    prepare: "Descargar",
    done: "Listo",
    tryAgain: "Reintentar",
    back: "Elegir otro formato",
    stop: "Detener descarga",
  },
  batch: {
    selected: "seleccionados",
    close: "Cerrar descarga por lotes",
    fileFormat: "Formato",
    videoQuality: "Calidad de vídeo",
    selectAll: "Seleccionar todo",
    deselectAll: "Deseleccionar todo",
    selectOne: "Selecciona al menos un vídeo",
    cancel: "Cancelar",
    add: "Empezar descargas",
    back: "Cambiar selección",
    preparing: "Preparando archivos",
    running: "Descargas",
    done: "Listo",
    highest: "Máxima",
    lowest: "Mínima",
    upTo: "Hasta",
    audio: "Audio",
  },
  queue: {
    keepOpen: "Mantén esta pestaña abierta mientras se transfieren los archivos.",
    cancel: "Cancelar descarga",
    restart: "Reiniciar descarga",
    remove: "Eliminar descarga",
    audio: "Audio",
    saved: "Guardadas",
    failed: "La descarga falló",
    canceled: "Cancelada",
    savedByBrowser: "Guardado por el navegador",
    waitingToStart: "Esperando para empezar",
    resolving: "Buscando el contenido",
    downloading: "Descargando",
    converting: "Convirtiendo el audio",
    muxing: "Combinando vídeo y audio",
    opening: "Abriendo la descarga",
    transferring: "Enviando el archivo al navegador",
    preparing: "Preparando la descarga",
    queued: "En cola",
    complete: "Transferencia completada",
    left: "restantes",
  },
  results: {
    searchFor: "Búsqueda",
    empty: "No se encontraron resultados",
    emptyHelp: "Prueba con otro título o pega un enlace.",
    views: "visualizaciones",
  },
  watch: {
    loading: "Cargando el vídeo",
    missing: "Añade un ID de vídeo a la dirección, como /watch?v=VIDEO_ID",
    download: "Descargar",
    tryAgain: "Volver a intentar",
  },
  playlist: {
    loading: "Cargando la lista",
    missing: "Añade un ID de lista a la dirección, como /playlist?list=PLAYLIST_ID",
    downloadAll: "Descargar todo",
  },
  footer: {
    independent: "Phantom es una utilidad web gratuita e independiente.",
    use: "Descarga únicamente contenido propio o que puedas guardar legalmente.",
    disclaimer: "Aviso legal",
  },
};

export const messages: Record<Locale, Messages> = {
  en: english,
  es: spanish,
};

export function localizeResultTitle(title: string, copy: Messages): string {
  const prefix = "Search: ";
  return title.startsWith(prefix)
    ? `${copy.results.searchFor}: ${title.slice(prefix.length)}`
    : title;
}

export function localePath(locale: Locale, path = "/") {
  if (locale === "en") return path;
  if (path === "/") return "/es";
  return `/es${path}`;
}
