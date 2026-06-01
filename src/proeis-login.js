export const PROEIS_LOGIN_URL = "https://www.proeis.rj.gov.br/Default.aspx";

export function normalizeFunctionalId(input) {
  const value = input.replace(/\D/g, "");

  if (value.length !== 8) {
    return {
      ok: false,
      error: "Informe um ID funcional com 8 digitos."
    };
  }

  return { ok: true, value };
}

export function buildProeisLoginBookmarklet(input) {
  const id = normalizeFunctionalId(input);

  if (!id.ok) {
    throw new Error(id.error);
  }

  const script = `(function(){var id='${id.value}';var tipo=document.getElementById('ddlTipoAcesso');if(tipo&&tipo.value!=='ID'){tipo.value='ID';if(typeof __doPostBack==='function'){__doPostBack('ddlTipoAcesso','');return;}tipo.dispatchEvent(new Event('change',{bubbles:true}));}var login=document.getElementById('txtLogin');if(login){login.value=id;login.dispatchEvent(new Event('input',{bubbles:true}));login.focus();}})();`;

  return `javascript:${encodeURIComponent(script)}`;
}
