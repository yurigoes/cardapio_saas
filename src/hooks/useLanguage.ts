"use client";

import { useState } from "react";

export function useLanguage() {
  const [lang, setLang] = useState<"pt" | "en">("pt");

  function toggle() {
    setLang((l) => (l === "pt" ? "en" : "pt"));
  }

  return { lang, toggle };
}
