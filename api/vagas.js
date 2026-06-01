async function abrirNavegador() {
  if (process.env.VERCEL) {
    const chromiumPkg = (await import('@sparticuz/chromium')).default;
    const { chromium } = await import('playwright-core');
    chromiumPkg.setGraphicsMode = false;
    return chromium.launch({
      args: chromiumPkg.args,
      executablePath: await chromiumPkg.executablePath(),
      headless: true,
    });
  }
  // Desenvolvimento local: usa playwright com browser embutido
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { FUNCTIONAL_ID, PASSWORD, GEMINI_API_KEY } = process.env;
  if (!FUNCTIONAL_ID || !PASSWORD) {
    return res.status(500).json({
      erro: 'Configure as variáveis de ambiente FUNCTIONAL_ID e PASSWORD no Vercel.',
    });
  }

  const autoCadastrar = req.method === 'POST';
  let browser;

  try {
    const { loginProeis, listarVagas, cadastrarVagas } = await import('../src/proeis-scraper.js');
    browser = await abrirNavegador();
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    await loginProeis(page, {
      functionalId: FUNCTIONAL_ID,
      password: PASSWORD,
      geminiApiKey: GEMINI_API_KEY,
    });

    const { vagas, url } = await listarVagas(page);

    let cadastros = [];
    if (autoCadastrar) {
      cadastros = await cadastrarVagas(page, vagas);
    }

    return res.status(200).json({ vagas, cadastros, url });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  } finally {
    await browser?.close();
  }
}
