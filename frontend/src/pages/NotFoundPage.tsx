import { Header } from "../components/Header";
import { useLanguage } from "../lang/useLanguage";
import { TransitionLink } from "../navigation/TransitionLink";

/** 404: the paper page, the standard header, one sentence and a way back. */
export function NotFoundPage({ person = false }: { person?: boolean }) {
    const { t } = useLanguage();
    return (
        <div className="page is-paper">
            <Header />
            <main className="notice">
                <h1 className="notice-text">{person ? t.notFound.userMessage : t.notFound.message}</h1>
                <TransitionLink to="/" className="textlink">{t.notFound.backToFeed}</TransitionLink>
            </main>
        </div>
    );
}
