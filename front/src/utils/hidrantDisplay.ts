import type { HidrantUiFields } from "@territoriadf/contracts/hidrants";

const POSITION_MAP: Record<string, string> = {
  lane: "Calçada",
  sidewalk: "Vorera",
  green: "Verd",
};

const TYPE_MAP: Record<string, string> = {
  underground: "Subterrani",
  pillar: "Columna",
};

export function getHidrantDisplayData(uiFields: HidrantUiFields) {
  if (!uiFields) {
    return [];
  }

  return [
    { label: "Data de revisió", value: uiFields.surveyDate || "Desconeguda" },
    { label: "Estat", value: uiFields.estat },
    {
      label: "Tipus",
      value: TYPE_MAP[uiFields.type] || uiFields.type || "Desconegut",
    },
    {
      label: "Posició",
      value: POSITION_MAP[uiFields.position] || uiFields.position || "Desconeguda",
    },
    { label: "Acoblaments", value: uiFields.couplings || "Desconegut" },
    {
      label: "Diàmetres",
      value: uiFields.diameters ? uiFields.diameters.split(";").join(", ") + " mm" : "Desconegut",
    },
    {
      label: "Pressió",
      // A OSM la pressió pot ser un número (bar) o un valor textual ("yes", "low"...)
      value: uiFields.pressure
        ? /^-?\d+(\.\d+)?$/.test(uiFields.pressure)
          ? `${uiFields.pressure} bar`
          : uiFields.pressure
        : "Desconeguda",
    },
    {
      label: "Adreça",
      value:
        `${uiFields.street ?? ""} ${uiFields.num ?? ""} ${
          uiFields.barri ? "(" + uiFields.barri + ")" : ""
        }`.trim() || "No disponible",
    },
  ];
}

export interface HidrantImage {
  url: string;
  thumbnail: string;
  type: "image" | "panoramax";
}

// UUID estricte (v1–v5): qualsevol altre valor no genera URL de Panoramax.
// Sense aquesta validació, un tag `panoramax=../../altre` d'OSM (editable per
// tothom) podria apuntar l'<img> i l'enllaç a una ruta arbitrària.
const PANORAMAX_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Hosts permesos per a `image=*` d'OSM: només https i allotjaments coneguts
// (Wikimedia = l'habitual a OSM, més els dominis que la CSP de prod ja permet).
// OSM l'edita tothom: sense allowlist, un pull sync podria colar un enllaç de
// phishing o contingut extern tant a l'<img> com a l'<a href> (la CSP no limita href).
const IMAGE_HOST_EXACT = new Set([
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "openstreetmap.org",
  "opentopomap.org",
  "api.panoramax.xyz",
  "panoramax.mapcomplete.org",
]);
const IMAGE_HOST_SUFFIXES = [".openstreetmap.org", ".opentopomap.org"];

function isAllowedImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") {
    return false;
  }
  if (url.username || url.password) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (IMAGE_HOST_EXACT.has(host)) {
    return true;
  }
  return IMAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function getHidrantImages(osmTags: Record<string, string>): HidrantImage[] {
  if (!osmTags) {
    return [];
  }
  const images: HidrantImage[] = [];

  Object.keys(osmTags).forEach((key) => {
    const rawValue = osmTags[key];
    if (!rawValue) {
      return;
    }
    const value = rawValue.trim();
    if (!value) {
      return;
    }

    if (key === "image" || /^image:\d+$/.exec(key)) {
      if (isAllowedImageUrl(value)) {
        images.push({
          url: value,
          thumbnail: value,
          type: "image",
        });
      }
    } else if (key === "panoramax" || /^panoramax:\d+$/.exec(key)) {
      // UUID canònic → URLs construïdes per nosaltres (host fix de confiança)
      if (PANORAMAX_UUID_RE.test(value)) {
        const uuid = value.toLowerCase();
        images.push({
          url: `https://api.panoramax.xyz/api/pictures/${uuid}/hd.jpg`,
          thumbnail: `https://api.panoramax.xyz/api/pictures/${uuid}/sd.jpg`,
          type: "panoramax",
        });
      } else if (isAllowedImageUrl(value)) {
        // Si ja és una URL permesa, la tractem com a image
        images.push({
          url: value,
          thumbnail: value,
          type: "image",
        });
      }
    }
  });

  return images;
}
