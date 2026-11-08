import { Panel } from "../components/Panel";
import { questionsAide, texte } from "../lib/textes";

const numeroAssistance = import.meta.env.VITE_ASSISTANCE_WHATSAPP as string | undefined;

export function AidePage() {
  const numero = numeroAssistance?.replace(/\D/g, "");
  return (
    <main className="page-content help-page">
      <header className="simple-page-heading"><h1>{texte("aideTitre")}</h1></header>
      <section className="help-list" aria-label="Questions fréquentes">
        {questionsAide.map((item) => (
          <Panel className="help-item" key={item.question}>
            <span className="help-icon" aria-hidden="true">{item.icone}</span>
            <div>
              <h2>{texte(item.question)}</h2>
              <p>{texte(item.reponse)}</p>
            </div>
          </Panel>
        ))}
      </section>
      {numero ? (
        <a
          className="primary-button help-contact-button"
          href={`https://wa.me/${numero}?text=${encodeURIComponent("Bonjour, j’ai besoin d’aide avec Gym4You.")}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {texte("aideWhatsApp")}
        </a>
      ) : (
        <p className="help-contact-note">{texte("assistanceNonConfiguree")}</p>
      )}
    </main>
  );
}
