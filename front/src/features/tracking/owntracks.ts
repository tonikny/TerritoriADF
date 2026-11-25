// Integració amb l'app OwnTracks: només hi ha transformacions de text i dues
// accions de navegador (llançar una URL d'esquema propi i baixar el .otrc).

/** Base64 (UTF-8) que espera el paràmetre `inline` de l'esquema owntracks://. */
export function toBase64(value: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * URL d'importació de configuració (l'única ruta owntracks:// que Chrome pot obrir).
 * El base64 s'ha de percent-encodar: OwnTracks fa URLDecoder.decode de la query i
 * un `+` cru es converteix en espai, cosa que trenca el base64.
 */
export function owntracksConfigHref(otrc: Record<string, unknown> | null): string {
  if (!otrc) {
    return "owntracks:///config";
  }
  return `owntracks:///config?inline=${encodeURIComponent(toBase64(JSON.stringify(otrc)))}`;
}

/** Llança una URL d'esquema propi des d'un gest de l'usuari. */
export function launchUrl(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.click();
}

/** Descarrega el fitxer `.otrc` amb les credencials personals de l'usuari. */
export function downloadOtrc(config: Record<string, unknown>, username: string): void {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${username.replace(/\//g, "_")}.otrc`;
  a.click();
  URL.revokeObjectURL(url);
}
