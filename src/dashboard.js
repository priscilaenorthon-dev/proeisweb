const btnBuscar = document.getElementById('btn-buscar');
const btnCadastrar = document.getElementById('btn-cadastrar');
const statusEl = document.getElementById('status-msg');
const vagasListEl = document.getElementById('vagas-list');

function mostrarStatus(msg, tipo = 'info') {
  statusEl.hidden = false;
  statusEl.className = `status-msg status-${tipo}`;
  statusEl.textContent = msg;
}

function esconderStatus() {
  statusEl.hidden = true;
}

function renderVagas(vagas) {
  if (!vagas || vagas.length === 0) {
    vagasListEl.hidden = false;
    vagasListEl.innerHTML = '<p class="sem-vagas">Nenhuma vaga encontrada no momento.</p>';
    return;
  }

  const vagasComInscricao = vagas.filter(v => v.podeInscrever);
  const total = vagas.length;
  const disponiveis = vagasComInscricao.length;

  vagasListEl.hidden = false;
  vagasListEl.innerHTML = `
    <div class="vagas-header">
      <span>${total} vaga${total !== 1 ? 's' : ''} encontrada${total !== 1 ? 's' : ''}</span>
      ${disponiveis > 0 ? `<span class="badge-disponivel">${disponiveis} disponíve${disponiveis !== 1 ? 'is' : 'l'}</span>` : ''}
    </div>
    <ul class="vagas-ul">
      ${vagas.map(v => `
        <li class="vaga-item ${v.podeInscrever ? 'disponivel' : 'indisponivel'}">
          <span class="vaga-status-dot"></span>
          <span class="vaga-texto">${Object.entries(v)
            .filter(([k]) => k.startsWith('col') && v[k])
            .map(([, val]) => val)
            .join(' · ')}</span>
          ${v.podeInscrever ? '<span class="tag-disponivel">Disponível</span>' : ''}
        </li>
      `).join('')}
    </ul>
  `;
}

function renderCadastros(cadastros) {
  if (!cadastros || cadastros.length === 0) return;

  const ok = cadastros.filter(c => c.sucesso).length;
  const err = cadastros.filter(c => c.erro).length;

  const resumo = document.createElement('div');
  resumo.className = 'cadastros-resumo';
  resumo.innerHTML = `
    <strong>Resultado dos cadastros:</strong>
    ${ok > 0 ? `<span class="badge-ok">${ok} cadastrado${ok !== 1 ? 's' : ''} com sucesso</span>` : ''}
    ${err > 0 ? `<span class="badge-erro">${err} erro${err !== 1 ? 's' : ''}</span>` : ''}
  `;
  vagasListEl.appendChild(resumo);
}

async function buscarVagas() {
  btnBuscar.disabled = true;
  btnCadastrar.disabled = true;
  mostrarStatus('Fazendo login e buscando vagas...', 'info');
  vagasListEl.hidden = true;

  try {
    const res = await fetch('/api/vagas');
    const data = await res.json();
    if (!res.ok) throw new Error(data.erro || 'Erro desconhecido');
    esconderStatus();
    renderVagas(data.vagas);
  } catch (err) {
    mostrarStatus(`Erro: ${err.message}`, 'erro');
  } finally {
    btnBuscar.disabled = false;
    btnCadastrar.disabled = false;
  }
}

async function cadastrarVagas() {
  btnBuscar.disabled = true;
  btnCadastrar.disabled = true;
  mostrarStatus('Fazendo login, buscando e cadastrando vagas disponíveis...', 'info');
  vagasListEl.hidden = true;

  try {
    const res = await fetch('/api/vagas', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.erro || 'Erro desconhecido');
    esconderStatus();
    renderVagas(data.vagas);
    renderCadastros(data.cadastros);
  } catch (err) {
    mostrarStatus(`Erro: ${err.message}`, 'erro');
  } finally {
    btnBuscar.disabled = false;
    btnCadastrar.disabled = false;
  }
}

btnBuscar.addEventListener('click', buscarVagas);
btnCadastrar.addEventListener('click', cadastrarVagas);
