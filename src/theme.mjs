export function resolveTheme(preference, systemDark) {
  return preference === "dark" || (preference === "system" && systemDark)
    ? "dark"
    : "light";
}

export function watchTheme(preference, { root, media, onChange = (theme) => {} }) {
  const apply = () => {
    const theme = resolveTheme(preference, media.matches);
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    onChange(theme);
  };
  apply();
  if (preference === "system") media.addEventListener("change", apply);
  return () => {
    if (preference === "system") media.removeEventListener("change", apply);
  };
}
