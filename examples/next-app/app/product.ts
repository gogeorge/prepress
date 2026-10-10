import type { DeclarationItem } from "@crasi/prepress";

export const locales = ["en", "de"] as const;
export type Locale = (typeof locales)[number];

export const inks = {
  black: { cmyk: [0, 0, 0, 100], preview: "#000000" },
  brand: { cmyk: [0, 90, 80, 5], preview: "#d42a2a" },
} as const;

const ingredients: DeclarationItem[] = [
  { name: { en: "Sugar", de: "Zucker" } },
  { name: { en: "Hazelnuts", de: "Haselnüsse" }, highlight: true, percent: 13 },
  { name: { en: "Palm oil", de: "Palmöl" } },
  { name: { en: "Skimmed milk powder", de: "Magermilchpulver" }, highlight: { en: "milk", de: "milch" }, percent: 8.7 },
  { name: { en: "Fat-reduced cocoa", de: "Fettarmer Kakao" }, percent: 7.4 },
  {
    name: { en: "Milk chocolate", de: "Vollmilchschokolade" },
    highlight: { en: "Milk", de: "milch" },
    percent: 5,
    children: [
      { name: { en: "Sugar", de: "Zucker" } },
      { name: { en: "Cocoa butter", de: "Kakaobutter" } },
      { name: { en: "Whole milk powder", de: "Vollmilchpulver" }, highlight: { en: "milk", de: "milch" } },
      { name: { en: "Cocoa mass", de: "Kakaomasse" } },
      { name: { en: "Emulsifier: lecithins (soya)", de: "Emulgator: Lecithine (Soja)" }, highlight: { en: "soya", de: "Soja" } },
      { name: { en: "Natural vanilla flavouring", de: "Natürliches Vanillearoma" } },
    ],
  },
  { name: { en: "Whey powder", de: "Süßmolkenpulver" }, highlight: { en: "Whey", de: "molken" } },
  { name: { en: "Emulsifier: lecithins (soya)", de: "Emulgator: Lecithine (Soja)" }, highlight: { en: "soya", de: "Soja" } },
  { name: { en: "Vanillin", de: "Vanillin" } },
];

export const product = {
  gtin: "4006381333931",
  name: { en: "Hazelnut Cocoa Spread", de: "Nuss-Nougat-Creme" },
  netQuantity: { en: "400 g", de: "400 g" },
  storage: {
    en: "Store in a cool, dry place. Best before: see lid.",
    de: "Kühl und trocken lagern. Mindestens haltbar bis: siehe Deckel.",
  },
  ingredients,
};
