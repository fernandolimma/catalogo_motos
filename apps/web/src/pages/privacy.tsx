import { Link } from "@tanstack/react-router";

export function PrivacyPage() {
  return <article className="page-wrap max-w-3xl py-16">
    <Link to="/" className="text-sm font-bold text-pine underline">Voltar ao catálogo</Link>
    <h1 className="mt-8 font-display text-4xl font-black">Aviso de Privacidade</h1>
    <p className="mt-6 text-sm leading-7 text-muted">Ao enviar seus dados por este site, a Independência Motos os utiliza para responder à solicitação de informações comerciais que você iniciou. São solicitados apenas os dados necessários para esse contato.</p>
    <p className="mt-4 text-sm leading-7 text-muted">O acesso aos dados é restrito à equipe autorizada. Os dados não são usados para campanhas futuras sem a base legal e a autorização aplicáveis. Você pode solicitar informações, correção ou exclusão dos seus dados por meio dos canais oficiais da loja.</p>
    <p className="mt-4 text-sm leading-7 text-muted">As informações do encarregado, os prazos de retenção e o canal formal para solicitações de titulares devem ser completados pela administração antes da publicação deste aviso.</p>
  </article>;
}
