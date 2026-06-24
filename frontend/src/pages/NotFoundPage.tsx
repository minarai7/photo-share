import { Link } from "react-router";
import { useLanguage } from "../lang/LanguageContext";

export function NotFoundPage() {
  const { t } = useLanguage();

  return (
    <main>
      <h1>{t.notFound.title}</h1>
      <p>{t.notFound.message}</p>

      <Link to="/">{t.notFound.backToFeed}</Link>
    </main>
  );
}