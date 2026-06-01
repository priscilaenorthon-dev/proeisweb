import { GoogleGenerativeAI } from '@google/generative-ai';

const PROEIS_URL = 'https://www.proeis.rj.gov.br/Default.aspx';

async function resolverCaptcha(imgBuffer, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const resultado = await model.generateContent([
    { inlineData: { mimeType: 'image/png', data: imgBuffer.toString('base64') } },
    'Leia o texto desta imagem CAPTCHA. Retorne apenas os caracteres exatos, sem espaços extras ou explicações.',
  ]);
  return resultado.response.text().trim();
}

async function achar(page, seletores) {
  for (const sel of seletores) {
    try {
      const el = await page.$(sel);
      if (el) return el;
    } catch { /* tenta próximo */ }
  }
  return null;
}

export async function loginProeis(page, { functionalId, password, geminiApiKey }) {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    await page.goto(PROEIS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Selecionar tipo "ID Funcional" e disparar postback ASP.NET
    await page.evaluate(() => {
      const sel = document.getElementById('ddlTipoAcesso');
      if (!sel) return;
      sel.value = 'ID';
      if (typeof __doPostBack === 'function') {
        __doPostBack('ddlTipoAcesso', '');
      } else {
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await page.waitForTimeout(1000);

    // Preencher ID funcional
    const campoLogin = await achar(page, [
      '#txtLogin',
      '#ctl00_ContentPlaceHolder1_txtLogin',
      'input[id*="Login"]',
      'input[name*="Login"]',
    ]);
    if (!campoLogin) throw new Error('Campo de login não encontrado na página');
    await campoLogin.fill(functionalId);

    // Preencher senha
    const campoSenha = await achar(page, [
      '#txtSenha',
      '#ctl00_ContentPlaceHolder1_txtSenha',
      'input[type="password"]',
      'input[id*="Senha"]',
      'input[name*="Senha"]',
    ]);
    if (campoSenha) await campoSenha.fill(password);

    // Resolver CAPTCHA com Gemini
    const captchaImg = await achar(page, [
      '#imgCaptcha',
      '#ctl00_ContentPlaceHolder1_imgCaptcha',
      'img[id*="Captcha"]',
      'img[id*="captcha"]',
      'img[src*="captcha" i]',
      'img[src*="Captcha"]',
    ]);
    if (captchaImg) {
      if (!geminiApiKey) throw new Error('GEMINI_API_KEY não configurada para resolver CAPTCHA');
      const buf = await captchaImg.screenshot();
      const textoCaptcha = await resolverCaptcha(buf, geminiApiKey);
      const campoCaptcha = await achar(page, [
        '#txtCaptcha',
        '#ctl00_ContentPlaceHolder1_txtCaptcha',
        'input[id*="Captcha"]',
        'input[id*="captcha"]',
        'input[name*="captcha" i]',
      ]);
      if (campoCaptcha) await campoCaptcha.fill(textoCaptcha);
    }

    // Submeter formulário
    const btnSubmit = await achar(page, [
      '#btnEntrar',
      '#ctl00_ContentPlaceHolder1_btnEntrar',
      '#btnLogin',
      'input[type="submit"]',
      'button[type="submit"]',
    ]);
    if (!btnSubmit) throw new Error('Botão de login não encontrado');

    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 25000 }),
      btnSubmit.click(),
    ]);

    // Verificar se login foi bem-sucedido
    const html = await page.content();
    const url = page.url();
    const erroLogin = /incorret|inv[áa]lid|n[ãa]o encontrad|captcha errad|senha errada/i.test(html);
    const aindaNaTelaDeLogi = url.toLowerCase().includes('default.aspx');

    if (!erroLogin || !aindaNaTelaDeLogi) return; // Logado com sucesso
    if (tentativa === 3) throw new Error('Login falhou após 3 tentativas. Verifique as credenciais.');
    await page.waitForTimeout(2000);
  }
}

export async function listarVagas(page) {
  // Navegar até a seção de vagas pelo menu
  const links = await page.$$('a, [role="menuitem"]');
  for (const link of links) {
    const texto = ((await link.textContent()) || '').toLowerCase();
    const href = (await link.getAttribute('href')) || '';
    if (/vaga|escala|servi[çc]o extra|planilha/i.test(texto) || /vaga|escala/i.test(href)) {
      await Promise.all([
        page.waitForLoadState('networkidle', { timeout: 15000 }),
        link.click(),
      ]);
      break;
    }
  }

  const vagas = [];
  const linhas = await page.$$('table tbody tr, tbody tr');

  for (let i = 0; i < linhas.length; i++) {
    const celulas = await linhas[i].$$('td');
    if (celulas.length < 2) continue;

    const dados = {};
    for (let j = 0; j < celulas.length; j++) {
      dados[`col${j}`] = ((await celulas[j].textContent()) || '').trim();
    }

    const btn = await linhas[i].$('input[type="submit"], button, a[href]');
    if (btn) {
      const txtBtn = (await btn.textContent() || await btn.getAttribute('value') || '').toLowerCase();
      dados.podeInscrever = /inscri|cadastr|selecion|incluir|solicitar/i.test(txtBtn);
    }

    if (Object.values(dados).some(v => typeof v === 'string' && v.length > 0)) {
      vagas.push({ ...dados, indice: i });
    }
  }

  return { vagas, url: page.url() };
}

export async function cadastrarVagas(page, vagas) {
  const resultados = [];

  for (const vaga of vagas.filter(v => v.podeInscrever)) {
    try {
      const linhas = await page.$$('table tbody tr, tbody tr');
      const linha = linhas[vaga.indice];
      if (!linha) { resultados.push({ vaga, erro: 'Linha não encontrada' }); continue; }

      const btn = await linha.$('input[type="submit"], button, a[href]');
      if (!btn) { resultados.push({ vaga, erro: 'Botão de inscrição não encontrado' }); continue; }

      await Promise.all([
        page.waitForLoadState('networkidle', { timeout: 15000 }),
        btn.click(),
      ]);

      resultados.push({ vaga, sucesso: true });
    } catch (err) {
      resultados.push({ vaga, erro: err.message });
    }
  }

  return resultados;
}
