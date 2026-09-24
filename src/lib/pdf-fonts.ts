import path from "path";
import { Font } from "@react-pdf/renderer";

export const PDF_FONT_FAMILY = "DM Sans";

let registered = false;

function fontSrc(fileName: string): string {
  if (typeof window === "undefined") {
    return path.join(process.cwd(), "public/fonts", fileName);
  }
  return `/fonts/${fileName}`;
}

export function registerPdfFonts(): void {
  if (registered) return;

  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: fontSrc("DMSans-Regular.woff"), fontWeight: 400 },
      { src: fontSrc("DMSans-Bold.woff"), fontWeight: 700 },
    ],
  });

  registered = true;
}
