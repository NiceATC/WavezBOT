"use client";

import { AuthProvider } from "../lib/auth";
import { I18nProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/theme";

export default function Providers({ children }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>{children}</AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
