import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { resolverCaptcha } from './captcha';

export interface Servico {
  data: string;
  horario: string;
  local: string;
  valor: string;
  status: 'disponivel' | 'inscrito' | 'expirado';
  inscritoEm: string | null;
}

export interface ResultadoScraper {
  ultimaAtualizacao: string;
  totalEncontrados: number;
  totalInscritos: number;
  servicos: Servico[];
}

function getDataPath(): string {
  // Vercel: /tmp é gravável; local: persiste em data/
  if (process.env.VERCEL) return '/tmp/servicos.json';
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'servicos.json');
}

function salvarServicos(resultado: ResultadoScraper): void {
  fs.writeFileSync(getDataPath(), JSON.stringify(resultado, null, 2), 'utf-8');
}

async function abrirNavegador(): Promise<Browser> {
  const browselessUrl = process.env.BROWSERLESS_URL;
  if (browselessUrl) {
    return chromium.connectOverCDP(browselessUrl);
  }
  return chromium.launch({ headless: true });
}

async function criarPagina(browser: Browser): Promise<Page> {
  // CDP (Browserless) já tem um contexto padrão; local cria um novo
  if (process.env.BROWSERLESS_URL) {
    const contextos = browser.contexts();
    const ctx = contextos[0] ?? (await browser.newContext());
    return ctx.newPage();
  }
  return browser.newPage();
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function logarNoPROEIS(page: Page): Promise<void> {
  const { PROEIS_ID, PROEIS_SENHA } = process.env;
  if (!PROEIS_ID || !PROEIS_SENHA) {
    throw new Error('PROEIS_ID e PROEIS_SENHA não configuradas');
  }

  await page.goto('https://www.proeis.rj.gov.br/Default.aspx', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await delay(1500);

  // Selecionar tipo "ID Funcional"
  const tipoSelect = page.locator('#ddlTipoAcesso');
  if ((await tipoSelect.count()) > 0) {
    await tipoSelect.selectOption('ID');
  } else {
    const radio = page
      .locator('input[type="radio"]')
      .filter({ hasText: /ID\s*Funcional/i })
      .first();
    if ((await radio.count()) > 0) await radio.click();
  }

  await delay(1500);
  await page.waitForLoadState('networkidle', { timeout: 20000 });

  // Preencher ID funcional
  const campoLogin = page
    .locator('#txtLogin, input[id*="Login"], input[name*="Login"]')
    .first();
  await campoLogin.waitFor({ timeout: 10000 });
  await campoLogin.fill(PROEIS_ID);
  await delay(500);

  // Preencher senha
  const campoSenha = page
    .locator('#txtSenha, input[type="password"], input[id*="Senha"]')
    .first();
  if ((await campoSenha.count()) > 0) {
    await campoSenha.fill(PROEIS_SENHA);
    await delay(500);
  }

  // Até 3 tentativas de CAPTCHA
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const captchaImg = page
      .locator('#imgCaptcha, img[id*="Captcha" i], img[src*="captcha" i]')
      .first();

    if ((await captchaImg.count()) > 0) {
      const buf = await captchaImg.screenshot({ type: 'png' });
      const base64 = Buffer.from(buf).toString('base64');
      const textoCaptcha = await resolverCaptcha(base64);

      const campoCaptcha = page
        .locator('#txtCaptcha, input[id*="Captcha" i], input[name*="captcha" i]')
        .first();
      if ((await campoCaptcha.count()) > 0) {
        await campoCaptcha.fill('');
        await campoCaptcha.fill(textoCaptcha);
        await delay(300);
      }
    }

    const btnSubmit = page
      .locator('#btnEntrar, #btnLogin, input[type="submit"], button[type="submit"]')
      .first();
    if ((await btnSubmit.count()) === 0) throw new Error('Botão de login não encontrado');

    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 25000 }),
      btnSubmit.click(),
    ]);
    await delay(1500);

    const url = page.url();
    const html = await page.content();
    const loginFalhou =
      url.toLowerCase().includes('default.aspx') &&
      /captcha|incorret|inv[áa]lid|senha.*errada/i.test(html);

    if (!loginFalhou) return;
    if (tentativa === 3) {
      throw new Error('Login falhou após 3 tentativas. Verifique credenciais e CAPTCHA.');
    }
    await delay(2000);
  }
}

async function capturarServicos(page: Page): Promise<Servico[]> {
  // Navegar para seção de serviços/escalas no menu
  const linkServicos = page
    .locator('a, [role="menuitem"]')
    .filter({ hasText: /servi[çc]o|escala|disponív/i })
    .first();

  if ((await linkServicos.count()) > 0) {
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 15000 }),
      linkServicos.click(),
    ]);
    await delay(1500);
  }

  const servicos: Servico[] = [];
  const linhas = page.locator('table tbody tr, tbody tr');
  const total = await linhas.count();

  for (let i = 0; i < total; i++) {
    const linha = linhas.nth(i);
    const celulas = linha.locator('td');
    const numCelulas = await celulas.count();
    if (numCelulas < 3) continue;

    const textos = await Promise.all(
      Array.from({ length: numCelulas }, (_, j) =>
        celulas
          .nth(j)
          .textContent()
          .then((t) => (t ?? '').trim()),
      ),
    );

    const textoCompleto = textos.join(' ').toLowerCase();
    let status: Servico['status'] = 'disponivel';
    if (/inscrit|cadastrad|confirmad/i.test(textoCompleto)) status = 'inscrito';
    else if (/expir|encerrad|indispon/i.test(textoCompleto)) status = 'expirado';

    servicos.push({
      data: textos[0] ?? '',
      horario: textos[1] ?? '',
      local: textos[2] ?? '',
      valor: textos[3] ?? '',
      status,
      inscritoEm: null,
    });
  }

  return servicos;
}

async function inscreverServicos(page: Page, servicos: Servico[]): Promise<number> {
  let totalInscritos = 0;
  const linhas = page.locator('table tbody tr, tbody tr');

  for (let i = 0; i < servicos.length; i++) {
    if (servicos[i].status !== 'disponivel') continue;

    try {
      const linha = linhas.nth(i);
      const btnInscricao = linha
        .locator('input[type="submit"], button, a[href]')
        .filter({ hasText: /inscri|cadastr|selecion|incluir|solicitar/i })
        .first();

      if ((await btnInscricao.count()) === 0) continue;

      await btnInscricao.click();
      await delay(1500);

      // Confirmar modal se aparecer
      const btnConfirmar = page
        .locator('button, input[type="button"], input[type="submit"]')
        .filter({ hasText: /confirmar|ok/i })
        .first();
      if ((await btnConfirmar.count()) > 0) {
        await btnConfirmar.click();
        await delay(1000);
      }

      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
        /* ignora timeout */
      });

      servicos[i].status = 'inscrito';
      servicos[i].inscritoEm = new Date().toISOString();
      totalInscritos++;
      await delay(1000);
    } catch {
      // Continua para o próximo se um falhar
    }
  }

  return totalInscritos;
}

export async function loginECapturarServicos(): Promise<ResultadoScraper> {
  let browser: Browser | null = null;

  try {
    browser = await abrirNavegador();
    const page = await criarPagina(browser);
    page.setDefaultTimeout(30000);

    await logarNoPROEIS(page);
    const servicos = await capturarServicos(page);
    const totalInscritos = await inscreverServicos(page, servicos);

    const resultado: ResultadoScraper = {
      ultimaAtualizacao: new Date().toISOString(),
      totalEncontrados: servicos.length,
      totalInscritos,
      servicos,
    };

    salvarServicos(resultado);
    return resultado;
  } finally {
    await browser?.close();
  }
}
