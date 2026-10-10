"use client";

import { useContext } from "react";
import { DEFAULT_INKS, resolveInk } from "../inks/index.js";
import { InkContext, type InkContextValue } from "./context.js";

const FALLBACK: InkContextValue = {
  inks: DEFAULT_INKS,
  defaultInk: "black",
  preview: (name) => resolveInk(name, DEFAULT_INKS)?.preview ?? "#ff00ff",
};

/** Ink context, or a single black ink when no InkProvider is present. */
export function useInks(): InkContextValue {
  return useContext(InkContext) ?? FALLBACK;
}
