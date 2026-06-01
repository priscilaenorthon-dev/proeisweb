import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { resolverCaptcha } from './captcha';
import { log, clearLogs } from './logger';

export interface Servico {
  data: string;
  horario: string;
  local: string;
  valor: string;
  tipoVaga: string;
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
    log('info', 'Conectando ao Browserless.io...');
    return chromium.connectOverCDP(browselessUrl);
  }
  log('info', 'Abrindo Chromium local (headless)...');
  return chromium.launch({ headless: true });
}

async function criarPagina(browser: Browser): Promise<Page> {
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
    throw new Error('PROEIS_ID e PROEIS_SENHA não configuradas nas variáveis de ambiente');
  }

  log('info', `Acessando https://www.proeis.rj.gov.br/Default.aspx ...`);
  await page.goto('https://www.proeis.rj.gov.br/Default.aspx', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await delay(1500);
  log('success', 'Página de login carregada');

  // Selecionar tipo "ID Funcional"
  log('info', 'Selecionando tipo de acesso: ID Funcional...');
  const tipoSelect = page.locator('#ddlTipoAcesso');
  if ((await tipoSelect.count()) > 0) {
    await tipoSelect.selectOption('ID');
    log('success', 'Tipo "ID Funcional" selecionado');
  } else {
    log('warn', 'Select ddlTipoAcesso não encontrado, tentando radio button...');
    const radio = page.locator('input[type="radio"]').filter({ hasText: /ID\s*Funcional/i }).first();
    if ((await radio.count()) > 0) await radio.click();
  }

  await delay(1500);
  await page.waitForLoadState('networkidle', { timeout: 20000 });

  // Preencher ID funcional
  log('info', `Preenchendo ID funcional: ${PROEIS_ID}...`);
  const campoLogin = page.locator('#txtLogin, input[id*="Login"], input[name*="Login"]').first();
  await campoLogin.waitFor({ timeout: 10000 });
  await campoLogin.fill(PROEIS_ID);
  await delay(500);
  log('success', 'ID preenchido');

  // Preencher senha
  log('info', 'Preenchendo senha...');
  const campoSenha = page.locator('#txtSenha, input[type="password"], input[id*="Senha"]').first();
  if ((await campoSenha.count()) > 0) {
    await campoSenha.fill(PROEIS_SENHA);
    await delay(500);
    log('success', 'Senha preenchida');
  } else {
    log('warn', 'Campo de senha não encontrado nesta etapa');
  }

  // Loop de tentativas com CAPTCHA
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    log('info', `Tentativa ${tentativa}/3: resolvendo CAPTCHA...`);

    const captchaImg = page
      .locator('#imgCaptcha, img[id*="Captcha" i], img[src*="captcha" i]')
      .first();

    if ((await captchaImg.count()) > 0) {
      const buf = await captchaImg.screenshot({ type: 'png' });
      const base64 = Buffer.from(buf).toString('base64');
      log('info', 'Imagem do CAPTCHA capturada, enviando para Gemini...');
      const textoCaptcha = await resolverCaptcha(base64);
      log('success', `Gemini retornou: "${textoCaptcha}"`);

      const campoCaptcha = page
        .locator('#txtCaptcha, input[id*="Captcha" i], input[name*="captcha" i]')
        .first();
      if ((await campoCaptcha.count()) > 0) {
        await campoCaptcha.fill('');
        await campoCaptcha.fill(textoCaptcha);
        await delay(300);
      }
    } else {
      log('info', 'Nenhum CAPTCHA detectado nesta tentativa');
    }

    log('info', 'Clicando em Entrar...');
    const btnSubmit = page
      .locator('#btnEntrar, #btnLogin, input[type="submit"], button[type="submit"]')
      .first();
    if ((await btnSubmit.count()) === 0) throw new Error('Botão de login não encontrado na página');

    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 25000 }),
      btnSubmit.click(),
    ]);
    await delay(1500);

    const url = page.url();
    const html = await page.content();
    log('info', `Redirecionado para: ${url}`);

    // Verificar se login falhou
    const loginFalhou =
      url.toLowerCase().includes('default.aspx') &&
      /captcha|incorret|inv[áa]lid|senha.*errada/i.test(html);

    if (!loginFalhou) {
      // Extrair nome do usuário logado
      const nomeMatch = /([A-ZÁÉÍÓÚÃÕÂÊÔ]+ ){2,}[A-ZÁÉÍÓÚÃÕÂÊÔ]+/.exec(html);
      if (nomeMatch) {
        log('success', `Login realizado! Usuário: ${nomeMatch[0].trim()}`);
      } else {
        log('success', 'Login realizado com sucesso!');
      }
      return;
    }

    log('warn', `Tentativa ${tentativa} falhou (CAPTCHA incorreto ou credenciais inválidas)`);
    if (tentativa === 3) {
      throw new Error('Login falhou após 3 tentativas. Verifique credenciais e API do Gemini.');
    }
    await delay(2000);
  }
}

async function capturarEventosDaSemana(page: Page): Promise<Servico[]> {
  // Tenta extrair eventos já visíveis na tela inicial (FrmMenuVoluntario.aspx)
  log('info', 'Verificando "Eventos da Semana" na tela inicial...');
  const servicos: Servico[] = [];

  // O PROEIS mostra eventos em uma textarea ou div na tela do menu
  const eventoBox = page.locator('textarea, .eventos, [id*="evento" i], [id*="Evento"]').first();
  if ((await eventoBox.count()) > 0) {
    const textoEventos = (await eventoBox.textContent()) ?? '';
    log('info', `Eventos encontrados na tela inicial:\n${textoEventos.trim()}`);

    // Parsear eventos do texto (cada evento é separado por padrões)
    const blocos = textoEventos.split(/Convênio:|Evento:/i).filter((b) => b.trim().length > 5);
    for (const bloco of blocos) {
      const data = /Data\/Hora:\s*([^\n]+)/.exec(bloco)?.[1]?.trim() ?? '';
      const local = /Ponto Encontro:\s*([^\n]+)/.exec(bloco)?.[1]?.trim() ?? '';
      const tipo = /Tipo de Vaga:\s*([^\n]+)/.exec(bloco)?.[1]?.trim() ?? '';
      const nomeEvento = bloco.split('\n')[0]?.trim() ?? '';

      if (data || local) {
        servicos.push({
          data,
          horario: data.includes(' ') ? data.split(' ')[1] ?? '' : '',
          local,
          valor: '',
          tipoVaga: tipo,
          status: 'inscrito', // Se aparece em "Eventos da Semana", já está inscrito
          inscritoEm: null,
        });
        log('success', `Evento encontrado: ${nomeEvento} | ${data} | ${local} | ${tipo}`);
      }
    }
  }

  return servicos;
}

async function capturarEscala(page: Page): Promise<Servico[]> {
  log('info', 'Navegando para "Escala"...');

  // Clicar no link Escala do menu
  const linkEscala = page.locator('a, button, input[type="button"]').filter({ hasText: /^Escala$/i }).first();

  if ((await linkEscala.count()) > 0) {
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 15000 }),
      linkEscala.click(),
    ]);
    await delay(1500);
    log('success', `Página Escala carregada: ${page.url()}`);
  } else {
    log('warn', 'Link "Escala" não encontrado no menu, tentando URL direta...');
    await page.goto('https://www.proeis.rj.gov.br/FrmEscala.aspx', {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await delay(1500);
    log('info', `URL atual: ${page.url()}`);
  }

  const html = await page.content();
  log('info', `Analisando página de escala (${html.length} chars)...`);

  const servicos: Servico[] = [];

  // Tentar extrair linhas da tabela de escala
  const linhas = page.locator('table tbody tr, tbody tr, tr');
  const total = await linhas.count();
  log('info', `Linhas encontradas na tabela: ${total}`);

  for (let i = 0; i < total; i++) {
    const linha = linhas.nth(i);
    const celulas = linha.locator('td');
    const numCelulas = await celulas.count();
    if (numCelulas < 2) continue;

    const textos = await Promise.all(
      Array.from({ length: numCelulas }, (_, j) =>
        celulas.nth(j).textContent().then((t) => (t ?? '').trim()),
      ),
    );

    const textoCompleto = textos.join(' | ');
    if (!textoCompleto.trim()) continue;

    let status: Servico['status'] = 'disponivel';
    if (/inscrit|cadastrad|confirmad|selecionad/i.test(textoCompleto)) status = 'inscrito';
    else if (/expir|encerrad|indispon/i.test(textoCompleto)) status = 'expirado';

    // Verificar se tem botão de inscrição
    const temBotao = (await linha.locator('input[type="submit"], button, a[href]').count()) > 0;

    log('info', `Linha ${i}: ${textoCompleto.slice(0, 80)}... | status: ${status} | botão: ${temBotao}`);

    servicos.push({
      data: textos[0] ?? '',
      horario: textos[1] ?? '',
      local: textos[2] ?? '',
      valor: textos[3] ?? '',
      tipoVaga: textos[4] ?? '',
      status,
      inscritoEm: null,
    });
  }

  if (servicos.length === 0) {
    log('warn', 'Nenhuma linha extraída da tabela. Salvando HTML para debug...');
    // Logar parte do HTML para diagnóstico
    const trecho = html.slice(0, 2000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    log('info', `HTML (início): ${trecho}`);
  }

  return servicos;
}

async function inscreverServicos(page: Page, servicos: Servico[]): Promise<number> {
  const disponiveis = servicos.filter((s) => s.status === 'disponivel');
  log('info', `Tentando inscrição em ${disponiveis.length} serviço(s) disponível(is)...`);

  let totalInscritos = 0;
  const linhas = page.locator('table tbody tr, tbody tr, tr');

  for (let i = 0; i < servicos.length; i++) {
    if (servicos[i].status !== 'disponivel') continue;

    try {
      const linha = linhas.nth(i);
      const btnInscricao = linha
        .locator('input[type="submit"], button, a[href]')
        .filter({ hasText: /inscri|cadastr|selecion|incluir|solicitar|reserv/i })
        .first();

      if ((await btnInscricao.count()) === 0) {
        log('warn', `Linha ${i}: botão de inscrição não encontrado`);
        continue;
      }

      const txtBtn = (await btnInscricao.textContent()) ?? '';
      log('info', `Clicando em "${txtBtn.trim()}" na linha ${i}...`);
      await btnInscricao.click();
      await delay(1500);

      // Confirmar modal se aparecer
      const btnConfirmar = page
        .locator('button, input[type="button"], input[type="submit"]')
        .filter({ hasText: /confirmar|ok|sim/i })
        .first();
      if ((await btnConfirmar.count()) > 0) {
        log('info', 'Modal de confirmação detectado, confirmando...');
        await btnConfirmar.click();
        await delay(1000);
      }

      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      servicos[i].status = 'inscrito';
      servicos[i].inscritoEm = new Date().toISOString();
      totalInscritos++;
      log('success', `Inscrição ${totalInscritos} realizada com sucesso!`);
      await delay(1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log('error', `Erro na inscrição da linha ${i}: ${msg}`);
    }
  }

  return totalInscritos;
}

export async function loginECapturarServicos(): Promise<ResultadoScraper> {
  clearLogs();
  log('info', '═══════════════════════════════════');
  log('info', 'Iniciando PROEIS Bot...');
  log('info', `Hora: ${new Date().toLocaleString('pt-BR')}`);
  log('info', '═══════════════════════════════════');

  let browser: Browser | null = null;

  try {
    browser = await abrirNavegador();
    const page = await criarPagina(browser);
    page.setDefaultTimeout(30000);

    // ETAPA 1: Login
    await logarNoPROEIS(page);

    // ETAPA 2: Capturar eventos já visíveis na tela inicial
    const eventosIniciais = await capturarEventosDaSemana(page);

    // ETAPA 3: Navegar para Escala e capturar serviços disponíveis
    const servicosEscala = await capturarEscala(page);

    // Combinar (eventos da semana são registros, escala são os disponíveis)
    const todosServicos = [...eventosIniciais, ...servicosEscala];
    log('info', `Total de serviços encontrados: ${todosServicos.length}`);

    // ETAPA 4: Inscrição automática
    const totalInscritos = await inscreverServicos(page, todosServicos);

    const resultado: ResultadoScraper = {
      ultimaAtualizacao: new Date().toISOString(),
      totalEncontrados: todosServicos.length,
      totalInscritos,
      servicos: todosServicos,
    };

    salvarServicos(resultado);
    log('success', `═══════════════════════════════════`);
    log('success', `Concluído! ${todosServicos.length} encontrados, ${totalInscritos} inscrições.`);
    log('success', `═══════════════════════════════════`);

    return resultado;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', `ERRO FATAL: ${msg}`);
    throw err;
  } finally {
    await browser?.close();
    log('info', 'Navegador fechado.');
  }
}
