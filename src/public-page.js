// Página simples do link público do personal (/p/CÓDIGO).
function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function brl(c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function page(p) {
  const foto = p.foto && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(p.foto) ? p.foto : '';
  const preco = p.fee_cents > 0 ? brl(p.fee_cents) : '';
  const bloqueio = !p.active ? 'A assinatura deste personal está inativa.' : p.full ? 'Este personal atingiu o limite de alunos do plano. Peça para ele liberar uma vaga.' : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Treinar com ${esc(p.nome)}</title>
<style>
body{margin:0;background:#f6f1e4;color:#1a1a1a;font:16px/1.45 system-ui,sans-serif}
main{max-width:420px;margin:0 auto;padding:28px 18px 40px}
.card{background:#fff;border:1px solid #e6d7a8;border-radius:16px;padding:18px;box-shadow:0 8px 24px #0001}
img.foto{width:96px;height:96px;object-fit:cover;border-radius:50%;display:block;margin:0 auto 10px;border:3px solid #e6d7a8}
h1{font-size:1.35rem;margin:0 0 6px;text-align:center}
.bio{color:#444;text-align:center;margin:0 0 12px}
.preco{text-align:center;font-weight:700;color:#6b4e00;margin:0 0 14px}
button,input{font:inherit}input{width:100%;box-sizing:border-box;padding:10px;margin:0 0 8px;border:1px solid #e6d7a8;border-radius:10px}
button{width:100%;background:#111;color:#f4e2a8;border:0;border-radius:12px;padding:12px;font-weight:700;cursor:pointer}
.sec{background:#fff;color:#111;border:1px solid #d9c27a;margin-top:8px}
.erro{background:#fde8e8;color:#9f1239;border-radius:10px;padding:8px;margin:8px 0}
.hide{display:none}
</style></head><body><main><div class="card">
${foto ? `<img class="foto" alt="" src="${foto}">` : ''}
<h1>${esc(p.nome)}</h1>
${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : '<p class="bio">Personal no Shape de Qualidade</p>'}
${preco ? `<p class="preco">Mensalidade ${esc(preco)}</p>` : '<p class="preco">Mensalidade a combinar</p>'}
${bloqueio ? `<div class="erro">${esc(bloqueio)}</div>` : `<button id="quero" type="button">Quero ser aluno</button>
<form id="form" class="hide">
<input id="nome" placeholder="Seu nome completo" autocomplete="name">
<input id="user" placeholder="Usuário (ex.: joao.silva)" autocapitalize="none" autocomplete="username">
<input id="pw" type="password" placeholder="Senha (mínimo 6)" autocomplete="new-password">
<input id="pw2" type="password" placeholder="Confirme a senha" autocomplete="new-password">
<div id="erro"></div>
<button type="submit">Criar conta</button>
<button type="button" class="sec" id="voltar">Voltar</button>
</form>`}
</div></main>
<script>
const code=${JSON.stringify(p.code)};
const quero=document.getElementById('quero'), form=document.getElementById('form');
if(quero){quero.onclick=()=>{quero.classList.add('hide');form.classList.remove('hide')};document.getElementById('voltar').onclick=()=>{form.classList.add('hide');quero.classList.remove('hide')};
form.onsubmit=async ev=>{ev.preventDefault();const er=document.getElementById('erro');er.innerHTML='';
if(document.getElementById('pw').value!==document.getElementById('pw2').value){er.innerHTML='<div class="erro">As senhas não conferem.</div>';return}
try{const r=await fetch('/api/student/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:document.getElementById('nome').value.trim(),usuario:document.getElementById('user').value.trim(),senha:document.getElementById('pw').value,convite:code,origem:'publico'})});
const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Não foi possível criar a conta.');location.href=j.pix?'/?pos=pix':'/'}catch(e){er.innerHTML='<div class="erro">'+e.message.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</div>'}};}
</script><script src="/baixar.js"></script></body></html>`;
}
module.exports = { page };
