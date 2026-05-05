import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const change = (lng: "en" | "sv") => {
    i18n.changeLanguage(lng);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("common.language")}>
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => change("en")}
          className={i18n.language?.startsWith("en") ? "font-semibold" : ""}
        >
          🇬🇧 {t("language.english")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => change("sv")}
          className={i18n.language?.startsWith("sv") ? "font-semibold" : ""}
        >
          🇸🇪 {t("language.swedish")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
