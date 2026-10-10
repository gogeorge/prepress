/**
 * Default list headings per preset and language. Review these against the
 * regulation that applies to your product; pass `heading` to override.
 */
export const HEADINGS: Record<"ingredients" | "composition", Record<string, string>> = {
  // Food (EU 1169/2011) and cosmetics (EC 1223/2009) ingredient lists.
  ingredients: {
    bg: "Съставки", cs: "Složení", da: "Ingredienser", de: "Zutaten", el: "Συστατικά", en: "Ingredients",
    es: "Ingredientes", et: "Koostisosad", fi: "Ainesosat", fr: "Ingrédients", ga: "Comhábhair", hr: "Sastojci",
    hu: "Összetevők", it: "Ingredienti", lt: "Sudedamosios dalys", lv: "Sastāvdaļas", mt: "Ingredjenti",
    nl: "Ingrediënten", pl: "Składniki", pt: "Ingredientes", ro: "Ingrediente", sk: "Zloženie", sl: "Sestavine",
    sv: "Ingredienser",
  },
  // Textile fibre composition (EU 1007/2011), detergents and similar.
  composition: {
    bg: "Състав", cs: "Složení", da: "Sammensætning", de: "Zusammensetzung", el: "Σύνθεση", en: "Composition",
    es: "Composición", et: "Koostis", fi: "Koostumus", fr: "Composition", ga: "Comhdhéanamh", hr: "Sastav",
    hu: "Összetétel", it: "Composizione", lt: "Sudėtis", lv: "Sastāvs", mt: "Kompożizzjoni", nl: "Samenstelling",
    pl: "Skład", pt: "Composição", ro: "Compoziție", sk: "Zloženie", sl: "Sestava", sv: "Sammansättning",
  },
};
