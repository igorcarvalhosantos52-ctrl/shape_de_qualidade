
"use strict";
const $=s=>document.querySelector(s);
const KEY="coachvoz_v1";
const AKEY="sq_alunos",SESS="sq_sessao";let curUser=localStorage.getItem(SESS)||null,viewing=null,CK=null;
const EQUIP=["Halteres","Barra livre","Banco","Leg press","Cadeira extensora","Mesa flexora","Polia/Crossover","Máquina de supino","Puxador (pulley)","Smith","Esteira","Bicicleta ergométrica","Elásticos","Kettlebell","Colchonete","Máquinas articuladas","Barra fixa/Paralelas","Cadeira abdutora/adutora","Voador (peck deck)","Hack/Agachamento máquina","Banco romano","Cadeira flexora","Bola suíça","Elíptico","Remo ergômetro","Escada (simulador)","Corda de pular"];
// Dicionário de gírias / regionalismos -> termo normalizado
const SLANG=[
 [/\b(joei|joelio|juelho|jueio)\b/g,"joelho"],[/\b(ombrinho|omb)\b/g,"ombro"],[/\b(lombar|cacunda|costa baixa|espinhela|coluna)\b/g,"lombar"],
 [/\b(tch[eê]|oxe|oxente|uai|bah|vixe|eita|mano|v[eé]i|v[eé]io|meu rei|cara|trem|bora|partiu)\b/g," "],
 [/\b(malhar|puxar ferro|treinar pesado|pegar peso)\b/g,"musculacao"],
 [/\b(ficar grande|ficar monstro|monstro|crescer|ganhar massa|bombar|shape|hipertrofi\w*|massa muscular)\b/g,"hipertrofia"],
 [/\b(secar|emagrec\w*|perder peso|perder barriga|queimar gordura|definir|tirar a pochete|pochete)\b/g,"emagrecimento"],
 [/\b(frango|novato|nunca treinei|come[cç]ando|iniciante|nunca malhei)\b/g,"iniciante"],
 [/\b(rato de academia|marombeiro|maromba|avancado|anos de treino)\b/g,"avancado"],
 [/\b(treinar perna|dia de perna)\b/g,"perna"],
 [/\b(f[oô]lego|cardio|resist[eê]ncia|condicionamento|correr)\b/g,"condicionamento"],
 [/\b(sa[uú]de|qualidade de vida|bem estar|bem-estar)\b/g,"saude"],
 [/\b(sim|s|aham|uhum|claro|tenho|j[aá]|isso|positivo|com certeza|sinto|tomo)\b/g,"sim"],
 [/\b(n[aã]o|nao|nunca|nada|negativo|nem|jamais|n)\b/g,"nao"],
 [/\b(press[aã]o alta|hipertens\w*)\b/g,"hipertensao"],[/\b(a[cç][uú]car no sangue|diab\w*|glicose alta)\b/g,"diabetes"],
 [/\bdois\b/g,"2"],[/\btr[eê]s\b/g,"3"],[/\bquatro\b/g,"4"],[/\bcinco\b/g,"5"],[/\bseis\b/g,"6"],[/\bsete\b/g,"7"],[/\boito\b/g,"8"],[/\bnove\b/g,"9"],[/\bdez\b/g,"10"],[/\bzero\b/g,"0"],[/\bum\b/g,"1"]
];
function norm(t){let s=(" "+t.toLowerCase()+" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"");s=s.replace(/[.,!?;]/g," ");for(const[r,v]of SLANG){const rr=new RegExp(r.source.normalize("NFD").replace(/[\u0300-\u036f]/g,""),"g");s=s.replace(rr,v)}return s.replace(/\s+/g," ").trim()}
const yes=t=>{const n=norm(t);return /\bsim\b/.test(n)&&!/^nao\b/.test(n)};
const num=t=>{const m=norm(t).match(/\d+/);return m?parseInt(m[0]):null};
const BODY=["joelho","ombro","lombar","punho","cotovelo","quadril","tornozelo","pescoco"];
const bodyIn=t=>BODY.filter(b=>norm(t).includes(b));

function fresh(){return{step:0,queue:null,chat:[],a:{nome:"",idade:null,objetivo:"",objetivos:[],objTxt:"",objOutro:"",resultados:"",prioridade:"",prioGs:[],prazo:"",progresso:"",nivel:"",dias:3,diasSemana:[],tempo:60,dores:{},med:"",medInfo:null,cond:{},meds:"",obs:[]},equip:EQUIP.slice(),plan:null,status:"none",aprov:null,adj:[]}}
const fkey=u=>KEY+"_"+u;
let S=fresh();
function accounts(){try{const a=JSON.parse(localStorage.getItem(AKEY));return a&&typeof a==="object"&&!Array.isArray(a)?a:{}}catch(e){return{}}}
function fixF(F){const D=fresh();if(!F||typeof F!=="object"||Array.isArray(F))return D;const o=Object.assign({},D,F);o.a=Object.assign({},D.a,F.a&&typeof F.a==="object"?F.a:{});
 ["dores","cond"].forEach(k=>{if(!o.a[k]||typeof o.a[k]!=="object")o.a[k]={}});if(!Array.isArray(o.a.obs))o.a.obs=[];if(!Array.isArray(o.a.objetivos))o.a.objetivos=[];if(!Array.isArray(o.a.prioGs))o.a.prioGs=[];if(!Array.isArray(o.a.diasSemana))o.a.diasSemana=[];if(!Array.isArray(o.chat))o.chat=[];if(!Array.isArray(o.equip))o.equip=D.equip;if(!Array.isArray(o.adj))o.adj=[];
 const okPlan=o.plan&&Array.isArray(o.plan.treinos)&&o.plan.treinos.length&&o.plan.treinos.every(t=>t&&Array.isArray(t.blocos)&&t.blocos.every(b=>b&&Array.isArray(b.ex)));
 if(o.plan&&!okPlan){o.plan=null;o.aprov=null;o.adj=[];o.status=o.queue?"none":"none";o.queue=null;o.step=0;o.chat=[]}
 if(o.queue&&(!Array.isArray(o.queue)||o.queue.some(q=>!q||typeof q.id!=="string"))){o.queue=null;o.step=0;o.chat=[];o.status=o.plan?o.status:"none"}
 if(!["none","equip","pendente","aprovado","bloqueado"].includes(o.status))o.status=o.plan?"pendente":"none";if(typeof o.step!=="number")o.step=0;return o}
function loadF(u){try{return fixF(JSON.parse(localStorage.getItem(fkey(u))))}catch(e){return fresh()}}
function load(){if(!curUser||!accounts()[curUser]){curUser=null;return fresh()}CK=fkey(curUser);return loadF(curUser)}
function save(){if(CK)localStorage.setItem(CK,JSON.stringify(S))}

/* ---------- Fluxo adaptativo de perguntas ---------- */
function baseQueue(){
 const q=[];if(!(curUser&&accounts()[curUser]))q.push({id:"nome",q:"Oi! Eu sou o coach do Shape de Qualidade. Qual é o seu nome?"});
 q.push({id:"idade",q:"Quantos anos você tem?"},
 {id:"objetivo",q:"Qual o seu principal objetivo? Por exemplo: Hipertrofia, Emagrecimento ou Saúde e qualidade de vida."},
 {id:"prioridade",q:"Existe alguma região do corpo ou alguma capacidade que você deseja priorizar? Se não tiver, é só dizer que não."},
 {id:"prazo",q:"Em quanto tempo você espera perceber resultados?"},
 {id:"nivel",q:"Você já treina? Se sim, há quanto tempo?"},
 {id:"dias",q:"Quantos dias por semana você consegue treinar?"},
 {id:"diasSem",q:"Quais dias da semana você pode treinar?"},
 {id:"tempo",q:"Quanto tempo você tem por treino?"},
 {id:"dor",q:"Sente alguma dor ou tem alguma lesão?"},
 {id:"med",q:"Você tem alguma orientação médica?"},
 {id:"peso",q:"Qual o seu peso?"},
 {id:"altura",q:"Qual a sua altura?"});
 q.push({id:"fim",q:""});return q}
function ask(){const it=S.queue[S.step];if(!it)return;if(it.id==="fim"){finishAnam();return}say(it.q)}
function insertNext(items){S.queue.splice(S.step+1,0,...items)}
/* ---------- Correções durante a conversa ---------- */
const GOAL_ORDER=["forca","hipertrofia","emagrecimento","condicionamento","mobilidade","saude","outro"];
const GOAL_LAB={saude:"Saúde/qualidade de vida",hipertrofia:"Hipertrofia",emagrecimento:"Emagrecimento",forca:"Força",condicionamento:"Condicionamento cardiovascular",mobilidade:"Mobilidade/flexibilidade",outro:"Outro"};
function goalsOf(n){const g=[];const add=(id,re)=>{if(re.test(n)&&!g.includes(id))g.push(id)};
 add("mobilidade",/mobilidade|flexibil|alongamento/);
 add("forca",/\bforca\b|mais forte|ficar forte|fortalecer/);
 add("hipertrofia",/hipertrofia/);
 add("emagrecimento",/emagrecimento/);
 add("condicionamento",/condicionamento|cardiovascular/);
 add("saude",/\bsaude\b/);
 return g}
function dominant(gs){return GOAL_ORDER.find(x=>gs.includes(x))||gs[0]||""}
function objOf(n){return dominant(goalsOf(n))}
function goalSet(A){A=A||S.a;if(Array.isArray(A.objetivos)&&A.objetivos.length)return A.objetivos;return A.objetivo?[A.objetivo]:[]}
function stripCorr(t){return String(t||"").replace(/^.*?\b(errei|na verdade|corrigindo|quis dizer|me enganei|falei errado)[,:]?\s*/i,"")}
function cleanSay(t){let x=String(t||"").trim().replace(/[.!?;]+$/,"").replace(/^(ah|eh|bom|entao|então|olha|tipo)[,\s]+/i,"").trim();return x?x.charAt(0).toUpperCase()+x.slice(1):""}
function prioGroups(t){const n=norm(t);if(/^(nao|nenhum|nenhuma|nada|tanto faz)\b/.test(n)&&!/peito|costa|ombro|biceps|triceps|glute|perna|abdomen|pantur|posterior|cardio|mobil|condicionamento/.test(n))return[];
 const specs=[["gluteo",/gluteo|bumbum|nadega/],["abdomen",/abdomen|abdominal|\bcore\b|\bbarriga\b/],["peito",/peito|peitoral/],["costas",/\bcostas\b|dorsal/],["ombro",/ombro/],["biceps",/biceps/],["triceps",/triceps/],["post",/posterior/],["quad",/quadriceps|\bperna\b|\bpernas\b|\bcoxa\b/],["pant",/panturrilha|gemeo/],["cardio",/\bcardio\b|\bfolego\b|condicionamento/],["mobilidade",/mobilidade|flexibil/]];
 const out=[];specs.forEach(([id,re])=>{if(re.test(n)&&!out.includes(id))out.push(id)});return out}
function applyPrio(ans){const raw=stripCorr(ans),gs=prioGroups(raw),n=norm(raw);S.a.prioGs=gs;
 if(!gs.length&&/^(nao|nenhum|nenhuma|nada|tanto faz)\b/.test(n))S.a.prioridade="Nenhuma";else S.a.prioridade=cleanSay(raw)}
function applyGoals(ans){const n=norm(ans),gs=goalsOf(n);if(/\boutro\b/.test(n)&&!gs.includes("outro"))gs.push("outro");
 const outro=cleanObj(stripCorr(ans).replace(/^.*?outro[:\s-]*/i,""));S.a.objetivos=gs;S.a.objetivo=dominant(gs)||(gs.includes("outro")?"outro":"");S.a.objTxt=cleanObj(stripCorr(ans))||cleanObj(ans);if(gs.includes("outro"))S.a.objOutro=outro||S.a.objTxt;return gs}
function prazoNote(t){const n=norm(t||"");let months=null;const m=n.match(/(\d+)\s*(mes|meses)/);if(m)months=+m[1];else if(/semana/.test(n))months=(num(t)||1)/4;else if(/\bano/.test(n))months=(num(t)||1)*12;else if(/\bdia/.test(n))months=(num(t)||1)/30;
 if(months===null)return "Um prazo realista: disposição em 2 a 4 semanas, força em 4 a 8 semanas, e mudança visível no corpo em geral entre 8 e 12 semanas, com treino, sono e alimentação.";
 if(months<1.5)return "Esse prazo é curto para mudar o corpo. É realista sentir o hábito e a técnica em 2 a 4 semanas; a força costuma aparecer em 4 a 8 semanas, e a mudança visível entre 8 e 12 semanas.";
 if(months<2)return "Em cerca de um mês dá para sentir mais disposição e um pouco de força. A mudança visível costuma pedir de 8 a 12 semanas. É um começo realista, não o resultado final.";
 if(months<=4)return "Esse prazo é realista para notar mais força e alguma mudança no espelho, se o treino, o sono e a alimentação forem constantes.";
 return "Esse prazo está alinhado com um resultado consistente. A força aparece antes da mudança visível, e o progresso segue enquanto o treino continuar."}
const WHERE_Q="Sem problema! Em qual pergunta você errou?";
const WHERE_RETRY="Não entendi. Foi no nome, idade, objetivo, prioridade, prazo, progresso, tempo de treino, dias por semana, tempo por treino, dor ou lesão, ou orientação médica?";
const STEP_NAMES={nome:"nome",idade:"idade",objetivo:"objetivo",resultados:"resultados",prioridade:"prioridade",prazo:"prazo",progresso:"como medir o progresso",nivel:"tempo de treino",dias:"dias por semana",diasSem:"dias da semana",tempo:"tempo por treino",dor:"dor ou lesão",med:"orientação médica",peso:"peso",altura:"altura"};
function placeOf(n){
 if(/\b(comeco|inicio|tudo|do zero|primeira pergunta)\b/.test(n))return"nome";
 if(/\bnome\b|me chamo|chamar/.test(n))return"nome";
 if(/\bprioridad|\bprioriz|\bprioritar|regiao do corpo|capacidade/.test(n))return"prioridade";
 if(/\bidade\b|\banos?\b(?! de treino)/.test(n)&&!/treino|treinando|treina|tempo/.test(n))return"idade";
 if(/\bprazo\b|em quanto tempo|perceber resultado/.test(n))return"prazo";
 if(/progred|como saber|como medir/.test(n))return"progresso";
 if(/objetivo|meta|foco|\bquero\b(?!.*(refazer|corrigir))/.test(n))return"objetivo";
 if(/orientacao|medic|doenca|saude|remedio/.test(n))return"med";
 if(/\bdor(es)?\b|lesao|lesoes|machucad/.test(n))return"dor";
 if(/\bpeso\b|\bquilos?\b/.test(n))return"peso";
 if(/\baltura\b|\bmetros?\b/.test(n))return"altura";
 if(/quais dias|dias da semana|dia da semana/.test(n))return"diasSem";
 if(/dias|vezes|frequencia|semana/.test(n))return"dias";
 if(/ja treino|ja treina|quanto tempo (eu )?(treino|treina)|tempo de treino|tempo que treino|experiencia|nivel|treina ha|treino ha|se ja treino/.test(n))return"nivel";
 if(/tempo (por|de cada|do|disponivel)|minutos|duracao|quanto tempo (tenho|eu tenho|por)|horas?/.test(n))return"tempo";
 if(/\btempo\b/.test(n))return"nivel";
 return"";}
function isBare(n){return/\b(errei|erro meu|me enganei|falei errado|quero refazer|refazer|quero corrigir|corrigir|corrige|voltar|volta|ops|opa)\b/.test(n)}
function firstId(){return baseQueue()[0].id}
function primeiroNome(nome){return String(nome||"").trim().split(/\s+/)[0]||""}
function greet(){const full=S.a.nome||(curUser&&accounts()[curUser]?accounts()[curUser].nome:"");const nm=primeiroNome(full);return nm?"Olá, "+nm+"! Eu sou o coach do Shape de Qualidade.":""}
function rewind(id){const q=baseQueue();let idx=q.findIndex(x=>x.id===id);if(idx<0&&id==="nome"){q.unshift({id:"nome",q:"Qual é o seu nome?"});idx=0}if(idx<0)return;
 const A=S.a,F=fresh().a,wasApr=S.status==="aprovado",hadPlan=!!S.plan;
 q.slice(idx).forEach(x=>{if(x.id==="nome")A.nome="";else if(x.id==="idade")A.idade=null;else if(x.id==="objetivo"){A.objetivo="";A.objetivos=[];A.objTxt="";A.objOutro="";S.objTry=0}else if(x.id==="resultados")A.resultados="";else if(x.id==="prioridade"){A.prioridade="";A.prioGs=[]}else if(x.id==="prazo")A.prazo="";else if(x.id==="progresso")A.progresso="";else if(x.id==="nivel"){A.nivel="";delete A.retorno}else if(x.id==="dias"){A.dias=F.dias;A.diasSemana=[]}else if(x.id==="diasSem")A.diasSemana=[];else if(x.id==="tempo")A.tempo=F.tempo;else if(x.id==="dor"){A.dores={};A.obs=[]}else if(x.id==="med"){A.med="";A.medInfo=null;A.cond={};A.meds=""}else if(x.id==="peso")delete A.peso;else if(x.id==="altura")delete A.altura});
 S.askWhere=false;S.queue=q;S.step=idx;
 if(hadPlan&&S.status!=="none"){S.mudancas=(S.mudancas||[]).concat(["aluno refez a anamnese a partir de: "+STEP_NAMES[id]+(wasApr?" — treino aprovado voltou para pendente":"")+" ("+new Date().toLocaleString("pt-BR")+")"]);S.aprov=null;S.adj=[];S.plan=null;}
 S.status="none";target="anam";hdr();save();render();
 say((idx===0&&id===firstId()?"Beleza, vamos começar do começo.":"Beleza, vamos refazer a partir de "+STEP_NAMES[id]+".")+" "+q[idx].q)}
function correction(t){const n=norm(t);
 if(/\b(voltar|volta|comecar|recomecar) (do|pro|ao) (comeco|inicio)\b|refazer tudo|refaz tudo|comecar de novo|recomecar/.test(n)){rewind(firstId());return true}
 if(S.askWhere){const pl=placeOf(n);if(pl){rewind(pl);return true}say(isBare(n)?WHERE_Q:WHERE_RETRY);return true}
 const trig=/\b(errei|erro meu|na verdade|corrigindo|corrige|corrigir|correcao|quis dizer|queria dizer|me enganei|falei errado|retificando|ops|opa|refazer)\b/.test(n)||/^nao (sao|e|eh|era|foi|tenho|posso|quero)\b/.test(n);
 if(!trig)return false;const A=S.a,ch=[];let field="";let m;
 if((m=n.match(/(\d+)\s*(dias|dia|vezes|vez|x)\b/))){const d=Math.min(6,Math.max(2,+m[1]));A.dias=d;ch.push(d+" dias por semana");field="dias"}
 if((m=n.match(/(\d+)\s*(min|minuto|minutos)\b/))||/hora/.test(n)&&!/\d+\s*(dias|vezes)/.test(n)){let v=m?+m[1]:null;if(/meia hora/.test(n)&&!/e meia/.test(n))v=30;else if(/hora/.test(n)&&!m)v=((num(n.replace(/\d+\s*(dias|vezes|x)\b/g,""))||1)*60)+(/e meia/.test(n)?30:0);if(v){A.tempo=v;ch.push(v+" minutos por treino");field=field||"tempo"}}
 if(/meu nome|me chamo|pode me chamar|me chama de/.test(n)){const nm=parseName(t.replace(/.*?(meu nome|me chamo|pode me chamar|me chama de)/i,"$1"));if(nm){A.nome=nm;ch.push("nome "+nm);field=field||"nome"}}
 if(/\bprioridad|\bprioriz|\bprioritar/.test(n)&&!ch.length){applyPrio(t);ch.push("prioridade “"+A.prioridade+"”");field="prioridade"}
 if(/(\bprazo\b|em quanto tempo|perceber resultado)/.test(n)&&!ch.length){A.prazo=cleanSay(stripCorr(t));if(A.prazo){ch.push("prazo “"+A.prazo+"”");field="prazo"}}
 if(/(progred|como saber)/.test(n)&&!ch.length){A.progresso=cleanSay(stripCorr(t));if(A.progresso){ch.push("progresso “"+A.progresso+"”");field="progresso"}}
 if(/objetivo|quero|meu foco/.test(n)&&!ch.length){const gs=applyGoals(t);if(gs.length){ch.push("objetivo “"+A.objTxt+"”");field="objetivo"}}
 if(/orientacao|medic|liberad|pressao|hipertens|diabet|cirurgi|coracao|gravid|hernia|impacto/.test(n)&&!ch.length){A.med=t.replace(/^.*?(errei|na verdade|corrigindo|quis dizer|me enganei)[,:]?\s*/i,"");A.medInfo=parseMed(A.med);ch.push("orientação médica “"+A.med+"”");field="med"}
 if((m=n.match(/(\d+)\s*anos de idade|tenho (\d+) anos\b/))&&!/treino|treinando/.test(n)){A.idade=+(m[1]||m[2]);ch.push(A.idade+" anos");field=field||"idade"}
 if(!ch.length){const pl=placeOf(n.replace(/\b(errei|erro meu|me enganei|falei errado|quero|refazer|corrigir|corrige|na verdade|corrigindo|eu)\b/g," "));if(pl){rewind(pl);return true}S.askWhere=true;save();say(WHERE_Q);return true}
 S.mudancas=(S.mudancas||[]).concat(ch.map(c=>c+" ("+new Date().toLocaleString("pt-BR")+")"));
 let msg="Certo, corrigi: "+ch.join(", ")+".";
 if(S.plan&&S.status!=="none"&&S.status!=="equip"){const wasApr=S.status==="aprovado";S.aprov=null;S.adj=[];generate(true);
  msg+=wasApr?" Recalculei o treino e ele voltou para aprovação do personal.":" Recalculei o treino e a semana."}
 hdr();save();
 if(S.status==="none"&&S.queue){const cur=S.queue[S.step];if(cur&&cur.id===field){S.step++;save();say(msg);setTimeout(ask,10);return true}say(msg+(cur&&cur.q?" "+cur.q:""));return true}
 render();say(msg);return true}
function avancar(){S.step++;save();ask()}
function gravarMedida(campo,valor,ok){const body={};body[campo]=valor;fetch("/api/student/medidas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"erro");return j}).then(j=>{if(window.__ME){if(j.altura_cm!=null)window.__ME.altura_cm=j.altura_cm;if(j.peso_kg!=null)window.__ME.peso_kg=j.peso_kg}if(ok)ok()}).catch(()=>{say(campo==="peso"?"Não entendi o peso. Pode repetir em quilos?":"Não entendi a altura. Pode dizer 1,75 ou 175?")})}
function aplicarDias(ids,done){S.a.diasSemana=ids.slice();fetch("/api/student/dias",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dias:ids})}).then(async r=>{if(!r.ok)throw new Error();if(window.__ME)window.__ME.dias_semana=ids;if(done)done()}).catch(()=>{say("Não entendi os dias. Pode dizer, por exemplo, segunda, quarta e sexta?")})}
function pedirDiasDeNovo(){S.queue[S.step]={id:"diasSem",q:"Quais dias da semana você pode treinar?"};save();say("O treino fica entre 2 e 6 dias. Quais dias você escolhe?")}
function handle(ans){
 if(!S.queue||S.status!=="none")return;
 const it=S.queue[S.step];if(!it)return;
 if(it.id==="fim"){finishAnam();return}
 addMsg("a",ans);if(correction(ans))return;const n=norm(ans),A=S.a;
 switch(true){
  case it.id==="nome":{const nm=parseName(ans);if(!nm){say("Não peguei seu nome. Pode repetir?");return}A.nome=nm;hdr();break}
  case it.id==="idade":A.idade=num(ans);if(A.idade===null){say("Não entendi a idade. Pode repetir só o número?");return}break;
  case it.id==="objetivo":{const gs=applyGoals(ans);if(!gs.length){S.objTry=(S.objTry||0)+1;say(S.objTry>1?"Sem problema. Pode dizer saúde, hipertrofia, emagrecimento, força, condicionamento, mobilidade, ou outro e explicar com as suas palavras.":"Pode me contar com outras palavras? Vale mais de um.");if(S.objTry>2){A.objetivos=["outro"];A.objetivo="outro";A.objOutro=cleanObj(ans);A.objTxt=cleanObj(ans);break}return}break}
  case it.id==="resultados":{const x=cleanSay(ans);if(!x){say("Me conta, mesmo em poucas palavras, o resultado que você quer ver.");return}A.resultados=x;break}
  case it.id==="prioridade":applyPrio(ans);break;
  case it.id==="prazo":{const x=cleanSay(ans);if(!x){say("Pode ser uma ideia: duas semanas, três meses, um ano...");return}A.prazo=x;break}
  case it.id==="progresso":{const x=cleanSay(ans);if(!x){say("O que você vai notar quando estiver melhorando?");return}A.progresso=x;break}
  case it.id==="nivel"||it.id==="nivel2":{
   if(/parei|parado|parada|faz tempo que nao|voltando|retorn|larguei/.test(n)){A.nivel="iniciante";A.retorno=true;break}
   const k=num(ans);let m=null;
   if(/\bmes(es)?\b/.test(n))m=(k??1);else if(/\bano(s)?\b/.test(n))m=(k??1)*12+(/e meio/.test(n)?6:0);else if(/semana/.test(n))m=0.5;
   if(m!==null){A.nivel=m<6?"iniciante":m<=24?"intermediario":"avancado";break}
   if(/\bnao\b/.test(n)||/iniciante/.test(n)){A.nivel="iniciante";break}
   if(/avancado/.test(n)){A.nivel="avancado";break}
   if(/sim|treino|intermedi/.test(n)&&it.id==="nivel"){insertNext([{id:"nivel2",q:"Há quanto tempo?"}]);A.nivel="intermediario";break}
   A.nivel=A.nivel||"iniciante";break}
  case it.id==="dias":{let d=num(ans);if(d===null){say("Quantos dias? Diga um número de 2 a 6.");return}A.dias=Math.min(6,Math.max(2,d));break}
  case it.id==="diasSem":{const ids=(window.Voz&&window.Voz.dias(ans))||[];if(!ids.length){say("Não entendi os dias. Pode dizer, por exemplo, segunda, quarta e sexta?");return}if(ids.length!==A.dias){if(ids.length<2||ids.length>6){say("O treino fica entre 2 e 6 dias. Quais dias você escolhe?");return}S.diasPend=ids;insertNext([{id:"diasConf",q:window.Voz.msgDias(A.dias,ids.length)}]);break}aplicarDias(ids,avancar);return}
  case it.id==="diasConf":{const escolha=window.Voz.escolherDias(A.dias,S.diasPend||[],ans);if(escolha.acao==="incerto"){say(it.q);return}if(escolha.acao==="numero"){S.queue[S.step]={id:"diasSem",q:"Quais dias da semana você pode treinar?"};save();ask();return}const ids=escolha.dias||[];if(ids.length<2||ids.length>6){pedirDiasDeNovo();return}A.dias=ids.length;aplicarDias(ids,avancar);return}
  case it.id==="peso":{const kg=window.Voz&&window.Voz.peso(ans);if(kg==null){say("Não entendi o peso. Pode repetir em quilos?");return}A.peso=kg;gravarMedida("peso",ans,avancar);return}
  case it.id==="altura":{const cm=window.Voz&&window.Voz.altura(ans);if(cm==null){say("Não entendi a altura. Pode dizer 1,75 ou 175?");return}A.altura=cm;gravarMedida("altura",ans,avancar);return}
  case it.id==="tempo":{let t=num(ans);if(/meia hora/.test(n)&&!/e meia/.test(n))t=30;else if(/hora/.test(n))t=(t||1)*60+(/e meia/.test(n)?30:0);A.tempo=t||60;break}
  case it.id==="dor":{const parts=bodyIn(ans);if(parts.length){const f=[];parts.forEach(p=>{A.dores[p]={};f.push({id:"int:"+p,q:"Entendi, dor no "+p+". De 0 a 10, quanto dói?"},{id:"qdo:"+p,q:"Em que momento o "+p+" dói?"},{id:"dx:"+p,q:"Já tem diagnóstico médico pro "+p+"?"})});insertNext(f)}else if(yes(ans)){insertNext([{id:"dor",q:"Em qual parte do corpo?"}])}break}
  case it.id.startsWith("int:"):{const p=it.id.slice(4);A.dores[p].int=num(ans)??5;if(A.dores[p].int>=7)A.obs.push("Dor intensa ("+A.dores[p].int+"/10) no "+p);break}
  case it.id.startsWith("qdo:"):A.dores[it.id.slice(4)].quando=ans;if(/repouso|noite|parado/.test(n))A.obs.push("Dor em repouso no "+it.id.slice(4));break;
  case it.id.startsWith("dx:"):A.dores[it.id.slice(3)].dx=yes(ans)||/[a-z]{6,}/.test(n)&&!/^nao/.test(n)?ans:"Sem diagnóstico";break;
  case it.id==="med":{const mi=parseMed(ans);if(medNo(ans)){mi.nenhuma=true;mi.vazio=false}A.med=ans;A.medInfo=mi;if(medFollow(ans))insertNext([{id:"med2",q:"Qual?"}]);break}
  case it.id==="med2":{A.med=ans;A.medInfo=parseMed(ans);if(medNo(ans)){A.medInfo.nenhuma=true;A.medInfo.vazio=false}break}
  case it.id==="c:hipertensao":A.cond.hipertensao=ans;if(!yes(ans)||/nao/.test(n))A.obs.push("Hipertensão possivelmente não controlada");break;
  case it.id==="c:diabetes":A.cond.diabetes=ans;if(/hipoglic|sim/.test(n)&&/hipoglic/.test(n))A.obs.push("Histórico de hipoglicemia");break;
  case it.id==="c:meds":A.meds=ans;if(/beta|atenolol|propranolol|insulina|anticoagul|varfarina/.test(n))A.obs.push("Medicamento que afeta a resposta ao exercício: "+ans);break;
  case it.id==="c:lesao":A.cond.lesao=ans;bodyIn(ans).forEach(p=>{if(!A.dores[p])A.dores[p]={int:null,quando:"",dx:ans}});break;
 }
 S.step++;save();ask();
}
/* ---------- Orientação médica (resposta livre) ---------- */
const COND=[
 {k:"cardio",re:/coracao|cardiopat|cardiac|infart|arritmi|sopro|marca ?passo|safena|stent|insuficiencia cardiaca/,l:"Cardiopatia / problema cardíaco",grave:1,low:1},
 {k:"peito",re:/dor no peito|aperto no peito|angina/,l:"Dor no peito",grave:1,low:1},
 {k:"gravidez",re:/gravid|gestante|gestacao|esperando bebe/,l:"Gravidez",grave:1,low:1,tags:["impacto","lombar","pesado"]},
 {k:"cirurgia",re:/cirurgi|operei|operad|opera[cç]ao/,l:"Cirurgia",grave:1,low:1},
 {k:"hipertensao",re:/hipertensao/,l:"Hipertensão",low:1},
 {k:"diabetes",re:/diabetes/,l:"Diabetes",low:0},
 {k:"hernia",re:/hernia|protusao|bico de papagaio/,l:"Hérnia / problema de coluna",tags:["lombar","pesado"]},
 {k:"artrose",re:/artrose|artrite|desgaste|condromalac|menisco|ligamento/,l:"Artrose / problema articular",tags:["impacto"]},
 {k:"asma",re:/asma|bronquite|falta de ar|dpoc/,l:"Asma / problema respiratório",low:1},
 {k:"remedio",re:/remedio|medicament|insulina|losartana|metformina|anticoagul|betabloq|atenolol|propranolol/,l:"Uso de medicamento"}];
function parseMed(t){const n=norm(t),r={texto:t,conds:[],tags:[],low:false,graves:[],atencao:[],soCaminhada:false,liberado:false,nenhuma:false,vazio:false};
 r.liberado=/liberad|pode treinar normal|sem restric|tudo certo/.test(n);
 COND.forEach(c=>{if(c.re.test(n)){r.conds.push(c.l);if(c.tags)r.tags.push(...c.tags);if(c.low)r.low=true;
  let grave=!!c.grave;
  if(c.k==="cirurgia"&&/\d+ anos|faz anos|muito tempo|ha anos/.test(n)&&!/mes|semana|dias|recente/.test(n))grave=false;
  if(c.k==="hipertensao"&&/nao controlad|descontrolad|alta mesmo|nao baixa|muito alta/.test(n))grave=true;
  (grave&&!r.liberado?r.graves:r.atencao).push(c.l+(c.k==="hipertensao"&&grave?" não controlada":"")+(grave&&r.liberado?" (aluno relata liberação)":""))}});
 if(/impacto|nao (pode|posso|devo) (correr|pular|saltar)|evitar (correr|corrida|pular|salto)|sem corrida|sem pulo/.test(n)){r.tags.push("impacto");r.atencao.push("Evitar impacto")}
 if(/evitar (pegar |levantar )?peso|sem (muito )?peso|nao (pode|posso|devo) (pegar |levantar )?peso|pouca carga|carga leve|evitar carga/.test(n)){r.tags.push("pesado");r.low=true;r.atencao.push("Evitar carga alta")}
 if(/(so|apenas|somente) caminhad/.test(n)){r.soCaminhada=true;r.atencao.push("Apenas caminhada")}
 const parts=bodyIn(t);if(parts.length&&(r.tags.length||r.conds.length)){r.tags.push(...parts);r.atencao.push("Poupar: "+parts.join(", "))}
 r.tags=[...new Set(r.tags)];
 const sinal=r.conds.length||r.tags.length||r.soCaminhada;
 if(!sinal){if(medNo(t)||r.liberado)r.nenhuma=true;
  else if(medBareYes(t))r.vazio=true;
  else r.atencao.push("Orientação não reconhecida automaticamente – personal deve conferir")}
 return r}
function medPlain(t){return String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[.,!?;]/g," ").replace(/\s+/g," ").trim()}
function medWords(t){return medPlain(t).split(" ").filter(w=>w&&!/^(ah|eh|hm|hum|hmm|uh|ok|ta|e|oi|aham|por|favor)$/.test(w))}
function medNo(t){const words=medWords(t);if(!words.length)return false;
 const ok=new Set("nao no nenhuma nenhum nada sem negativo tenho preciso orientacao medica medico alguma uma".split(" "));
 return words.some(w=>/^(nao|no|nenhuma|nenhum|nada|sem|negativo)$/.test(w))&&words.every(w=>ok.has(w))}
function medBareYes(t){const words=medWords(t);if(!words.length||medNo(t))return false;
 const ok=new Set("sim tenho s yes positivo isso afirmativo".split(" "));
 return words.every(w=>ok.has(w))&&words.some(w=>/^(sim|tenho|s|yes|positivo|afirmativo|isso)$/.test(w))}
/* Não repete a pergunta quando a resposta já é não, ou quando o aluno já explicou. "Qual?" só sai num sim sem detalhe. */
function medFollow(t){return medNo(t)||!medBareYes(t)?"":"Qual?"}
function risk(){const A=S.a;return((A.medInfo&&A.medInfo.graves)||[]).map(x=>"Orientação médica: "+x).concat(A.obs)}
function attn(){const m=S.a.medInfo;return m?m.atencao.concat(m.conds.filter(c=>!m.graves.some(g=>g.startsWith(c))&&!m.atencao.some(a=>a.startsWith(c)))):[]}
function medNoteHTML(){const m=S.a.medInfo;if(!m||m.nenhuma)return"";return `<div class="alert warn">🩺 Treino ajustado conforme a orientação médica informada: “${esc(S.a.med)}”.${m.low?" Intensidade reduzida (menos séries, mais repetições leves e descanso maior).":""}${m.tags.length?" Restrições aplicadas: "+esc(m.tags.join(", "))+".":""}</div>`}
function diasInformados(){const A=S.a||{};return Array.isArray(A.diasSemana)&&A.diasSemana.length>=2&&A.diasSemana.length<=6}
function pesoInformado(){const A=S.a||{};return A.peso!=null||!!(window.__ME&&window.__ME.peso_kg)}
function alturaInformada(){const A=S.a||{};return A.altura!=null||!!(window.__ME&&window.__ME.altura_cm)}
function corpoOk(){return diasInformados()&&pesoInformado()&&alturaInformada()}
function finishAnam(){
 if(!corpoOk()){
  if(!Array.isArray(S.queue))S.queue=[];
  const faltam=[];
  if(!diasInformados()){faltam.push({id:"dias",q:"Quantos dias por semana você consegue treinar?"},{id:"diasSem",q:"Quais dias da semana você pode treinar?"})}
  if(!pesoInformado())faltam.push({id:"peso",q:"Qual o seu peso?"});
  if(!alturaInformada())faltam.push({id:"altura",q:"Qual a sua altura?"});
  const fim=S.queue.findIndex(x=>x&&x.id==="fim");
  const at=fim<0?S.queue.length:fim;
  S.queue.splice(at,0,...faltam);
  S.step=at;save();ask();return}
 const r=risk();
 addMsg("c","Obrigado, "+(primeiroNome(S.a.nome)||"")+"! Anamnese concluída."+(r.length?" Atenção: identifiquei pontos de risco. Você vai precisar de liberação médica antes de treinar.":" Agora marque os equipamentos da sua academia."));
 S.status="equip";save();render()}

function cleanObj(t){let x=String(t||"").trim().replace(/[.!?;]+$/,"").replace(/^(ah|eh|bom|entao|então|olha|tipo|é|e)[,\s]+/i,"").replace(/^(o )?meu objetivo (é|e|eh)\s+/i,"").replace(/^(eu )?(quero|queria|gostaria de|pretendo|busco)\s+/i,"").replace(/^(é|e)\s+/i,"").trim();return x?x.charAt(0).toUpperCase()+x.slice(1):""}
function objShow(A){A=A||S.a;return A.objTxt||({hipertrofia:"Hipertrofia",emagrecimento:"Emagrecimento",condicionamento:"Condicionamento",saude:"Saúde"}[A.objetivo]||A.objetivo||"")}
function parseName(t){let x=" "+t.toLowerCase().replace(/[.,!?;:"]/g," ")+" ";
 x=x.replace(/\b(oi|ola|olá|e ai|eai|bom dia|boa tarde|boa noite|opa|entao|então|bem|tipo|ah|eh|é|uai|oxe|tchê|tche|bah|mano|cara|beleza|blz|tudo bem|prazer)\b/g," ");
 const m=x.match(/(?:meu nome (?:e|é|eh)|me chamo|pode me chamar de|podem me chamar de|me chama de|me chamam de|eu sou o|eu sou a|sou o|sou a|eu sou|sou|aqui (?:e|é) o|aqui (?:e|é) a|(?:e|é) o|(?:e|é) a)\s+(.+)/);if(m)x=m[1];x=x.trim().replace(/^(?:é|e|eh)\s+/,"");
 x=x.replace(/\b(mas|e voce|e você|obrigad\w*|aqui|mesmo|viu|ta|tá)\b.*$/,"");
 const lw=["da","de","do","das","dos","e"];const w=x.trim().split(/\s+/).filter(w=>/^[a-zà-ÿ'-]+$/i.test(w)).slice(0,4);
 if(!w.length)return "";return w.map((p,i)=>i&&lw.includes(p)?p:p.charAt(0).toUpperCase()+p.slice(1)).join(" ")}
function hdrLine(id,t){const h=$(id);h.textContent=t||"";h.classList.toggle("hide",!t)}
function hdr(){const nm=primeiroNome(S.a.nome);hdrLine("#hdrAluno",nm?"Aluno: "+nm:"");
 hdrLine("#hdrProf",S.status==="aprovado"&&S.aprov?"Professor: "+S.aprov.nome+(S.aprov.cref?" — CREF "+S.aprov.cref:""):S.plan?"Professor: aguardando aprovação":"");
 let dia="";if(S.plan&&S.plan.treinos){const td=todayTreino(),sw=activeSwap();if(sw&&sw.rest)dia="Hoje é descanso";else if(td.hoje){const T=sw||S.plan.treinos[td.idx];dia=T?"Dia: "+td.dia+" — "+T.nome:"Hoje é descanso"}else dia="Hoje é descanso"}hdrLine("#hdrDia",dia)}
/* ---------- Gerador de treino ---------- */
const EX={
 peito:[
  {n:"Supino reto com halteres",e:"Halteres",t:"ombro"},
  {n:"Supino na máquina",e:"Máquina de supino",j:"Trajetória guiada, mais segura"},
  {n:"Supino inclinado com halteres",e:"Halteres",t:"ombro"},
  {n:"Crucifixo no crossover",e:"Polia/Crossover",j:"Tensão constante com pouca carga articular"},
  {n:"Supino reto com barra",e:"Barra livre",t:"ombro pesado"},
  {n:"Supino no Smith",e:"Smith"},
  {n:"Crucifixo com halteres",e:"Halteres"},
  {n:"Flexão de braço",e:null,t:"punho",j:"Peso corporal, dá para fazer em qualquer lugar"},
  {n:"Supino inclinado com barra",e:"Barra livre",t:"ombro pesado"},
  {n:"Supino inclinado no Smith",e:"Smith",t:"ombro"},
  {n:"Supino declinado com barra",e:"Barra livre",t:"ombro pesado"},
  {n:"Supino declinado com halteres",e:"Halteres",t:"ombro"},
  {n:"Supino inclinado na máquina",e:"Máquina de supino"},
  {n:"Supino articulado pegada neutra",e:"Máquinas articuladas"},
  {n:"Voador (peck deck)",e:"Voador (peck deck)"},
  {n:"Crucifixo inclinado com halteres",e:"Halteres",t:"ombro"},
  {n:"Crossover polia baixa",e:"Polia/Crossover"},
  {n:"Crossover polia alta",e:"Polia/Crossover"},
  {n:"Flexão de braço inclinada (mãos no banco)",e:"Banco",t:"punho"},
  {n:"Flexão de braço declinada (pés elevados)",e:"Banco",t:"punho ombro"},
  {n:"Mergulho nas paralelas (peito)",e:"Barra fixa/Paralelas",t:"ombro"},
  {n:"Supino reto com halteres pegada neutra",e:"Halteres"}
 ],
 triceps:[
  {n:"Tríceps na polia (corda)",e:"Polia/Crossover",j:"Baixo estresse no cotovelo"},
  {n:"Tríceps testa com halteres",e:"Halteres",t:"cotovelo"},
  {n:"Tríceps coice com halter",e:"Halteres"},
  {n:"Tríceps francês com halter",e:"Halteres",t:"ombro"},
  {n:"Mergulho no banco",e:"Banco",t:"ombro punho"},
  {n:"Tríceps com elástico",e:"Elásticos"},
  {n:"Supino fechado",e:"Barra livre",t:"ombro pesado"},
  {n:"Tríceps na polia com barra reta",e:"Polia/Crossover"},
  {n:"Tríceps na polia com barra V",e:"Polia/Crossover"},
  {n:"Tríceps na polia pegada supinada",e:"Polia/Crossover",t:"punho"},
  {n:"Tríceps unilateral na polia",e:"Polia/Crossover"},
  {n:"Tríceps francês na polia com corda",e:"Polia/Crossover",t:"ombro"},
  {n:"Tríceps testa com barra W",e:"Barra livre",t:"cotovelo"},
  {n:"Tríceps francês com halter unilateral",e:"Halteres",t:"ombro"},
  {n:"Tríceps na máquina",e:"Máquinas articuladas"},
  {n:"Mergulho nas paralelas (tríceps)",e:"Barra fixa/Paralelas",t:"ombro"},
  {n:"Flexão de braço fechada (diamante)",e:null,t:"punho"},
  {n:"Tríceps coice na polia",e:"Polia/Crossover"}
 ],
 antebraco:[
  {n:"Rosca punho com halter",e:"Halteres",t:"punho"},
  {n:"Rosca punho invertida com halter",e:"Halteres",t:"punho"},
  {n:"Rosca inversa na polia",e:"Polia/Crossover",t:"cotovelo"},
  {n:"Pegada isométrica com halter",e:"Halteres",j:"Força de pegada sem movimento do punho"},
  {n:"Rosca punho com barra",e:"Barra livre",t:"punho"},
  {n:"Caminhada do fazendeiro (farmer walk)",e:"Halteres",t:"lombar pesado",j:"Pegada e estabilidade de tronco"},
  {n:"Extensão de punho com elástico",e:"Elásticos",t:"punho"},
  {n:"Rosca punho na polia",e:"Polia/Crossover",t:"punho"},
  {n:"Rolo de punho (wrist roller)",e:null,t:"punho ombro"},
  {n:"Pegada de pinça com anilhas",e:"Barra livre"},
  {n:"Pendurar na barra (dead hang)",e:"Barra fixa/Paralelas",t:"ombro"}
 ],
 costas:[
  {n:"Puxada frontal no pulley",e:"Puxador (pulley)"},
  {n:"Remada baixa na polia",e:"Polia/Crossover",j:"Remada com apoio, protege a lombar"},
  {n:"Remada unilateral com halter",e:"Halteres",j:"Apoio no banco protege a lombar"},
  {n:"Pulldown braço reto na polia",e:"Polia/Crossover"},
  {n:"Remada curvada com barra",e:"Barra livre",t:"lombar pesado"},
  {n:"Remada no Smith",e:"Smith",t:"lombar"},
  {n:"Remada com elástico",e:"Elásticos"},
  {n:"Barra fixa",e:"Barra fixa/Paralelas",t:"ombro"},
  {n:"Puxada frontal pegada neutra no pulley",e:"Puxador (pulley)"},
  {n:"Puxada frontal pegada supinada no pulley",e:"Puxador (pulley)",t:"punho"},
  {n:"Puxada frontal pegada aberta no pulley",e:"Puxador (pulley)",t:"ombro"},
  {n:"Puxada unilateral na polia alta",e:"Polia/Crossover"},
  {n:"Pulldown com corda na polia",e:"Polia/Crossover"},
  {n:"Barra fixa pegada supinada",e:"Barra fixa/Paralelas",t:"ombro"},
  {n:"Barra fixa pegada neutra",e:"Barra fixa/Paralelas",t:"ombro"},
  {n:"Barra fixa no graviton (assistida)",e:"Máquinas articuladas"},
  {n:"Remada baixa pegada aberta na polia",e:"Polia/Crossover"},
  {n:"Remada baixa pegada supinada na polia",e:"Polia/Crossover",t:"punho"},
  {n:"Remada unilateral na polia",e:"Polia/Crossover"},
  {n:"Remada na máquina pegada neutra",e:"Máquinas articuladas"},
  {n:"Remada articulada (máquina)",e:"Máquinas articuladas"},
  {n:"Remada cavalinho (T-bar)",e:"Barra livre",t:"lombar pesado"},
  {n:"Remada cavalinho na máquina com apoio",e:"Máquinas articuladas"},
  {n:"Remada curvada pegada supinada",e:"Barra livre",t:"lombar pesado punho"},
  {n:"Remada curvada com halteres",e:"Halteres",t:"lombar"},
  {n:"Remada com halteres no banco inclinado",e:"Halteres"},
  {n:"Serrote com halter",e:"Halteres"},
  {n:"Hiperextensão lombar no banco romano",e:"Banco romano",t:"lombar"},
  {n:"Encolhimento com halteres",e:"Halteres",t:"pescoco"}
 ],
 biceps:[
  {n:"Rosca alternada com halteres",e:"Halteres"},
  {n:"Rosca na polia",e:"Polia/Crossover"},
  {n:"Rosca martelo com halteres",e:"Halteres"},
  {n:"Rosca concentrada",e:"Halteres"},
  {n:"Rosca direta com barra",e:"Barra livre",t:"punho"},
  {n:"Rosca com elástico",e:"Elásticos"},
  {n:"Rosca scott com halter",e:"Banco",t:"cotovelo"},
  {n:"Rosca direta com barra W",e:"Barra livre"},
  {n:"Rosca simultânea com halteres",e:"Halteres"},
  {n:"Rosca scott com barra W",e:"Banco",t:"cotovelo"},
  {n:"Rosca scott na máquina",e:"Máquinas articuladas",t:"cotovelo"},
  {n:"Rosca inclinada com halteres",e:"Halteres",t:"ombro"},
  {n:"Rosca martelo na polia com corda",e:"Polia/Crossover"},
  {n:"Rosca martelo cruzada",e:"Halteres"},
  {n:"Rosca na polia com barra reta",e:"Polia/Crossover",t:"punho"},
  {n:"Rosca bayesiana na polia",e:"Polia/Crossover",t:"ombro"},
  {n:"Rosca 21",e:"Barra livre"},
  {n:"Rosca com elástico unilateral",e:"Elásticos"}
 ],
 ombro:[
  {n:"Desenvolvimento com halteres",e:"Halteres",t:"ombro"},
  {n:"Elevação lateral com halteres",e:"Halteres",t:"ombro"},
  {n:"Crucifixo invertido com halteres",e:"Halteres",t:"ombro"},
  {n:"Elevação frontal com halteres",e:"Halteres",t:"ombro"},
  {n:"Desenvolvimento no Smith",e:"Smith",t:"ombro pesado"},
  {n:"Elevação lateral na polia",e:"Polia/Crossover",t:"ombro"},
  {n:"Face pull na polia (carga leve)",e:"Polia/Crossover",j:"Fortalece manguito rotador e postura; seguro com carga leve"},
  {n:"Rotação externa com elástico",e:"Elásticos",j:"Fortalece o manguito rotador e protege o ombro"},
  {n:"Elevação lateral parcial leve (até 45°)",e:"Halteres",j:"Amplitude curta e carga leve, sem pinçamento"},
  {n:"Desenvolvimento Arnold",e:"Halteres",t:"ombro"},
  {n:"Desenvolvimento na máquina",e:"Máquinas articuladas",t:"ombro"},
  {n:"Desenvolvimento com barra sentado",e:"Barra livre",t:"ombro pesado"},
  {n:"Desenvolvimento com halteres em pé",e:"Halteres",t:"ombro lombar"},
  {n:"Elevação lateral na máquina",e:"Máquinas articuladas",t:"ombro"},
  {n:"Elevação lateral unilateral na polia",e:"Polia/Crossover",t:"ombro"},
  {n:"Elevação lateral sentado com halteres",e:"Halteres",t:"ombro"},
  {n:"Elevação frontal na polia com corda",e:"Polia/Crossover",t:"ombro"},
  {n:"Elevação frontal com anilha",e:"Barra livre",t:"ombro"},
  {n:"Crucifixo invertido no peck deck",e:"Voador (peck deck)",t:"ombro"},
  {n:"Crucifixo invertido na polia",e:"Polia/Crossover",t:"ombro"},
  {n:"Remada alta na polia (pegada aberta)",e:"Polia/Crossover",t:"ombro"},
  {n:"Rotação externa na polia",e:"Polia/Crossover"}
 ],
 quad:[
  {n:"Agachamento livre com barra",e:"Barra livre",t:"joelho lombar pesado"},
  {n:"Leg press 45°",e:"Leg press",t:"joelho"},
  {n:"Cadeira extensora",e:"Cadeira extensora",t:"joelho"},
  {n:"Agachamento búlgaro com halteres",e:"Halteres",t:"joelho"},
  {n:"Afundo (avanço) com halteres",e:"Halteres",t:"joelho impacto"},
  {n:"Agachamento no Smith",e:"Smith",t:"joelho lombar"},
  {n:"Leg press com amplitude parcial",e:"Leg press",j:"Amplitude reduzida poupa o joelho"},
  {n:"Agachamento parcial no banco (box squat)",e:"Banco",j:"Amplitude controlada, menos estresse no joelho"},
  {n:"Isometria na parede (wall sit) em ângulo confortável",e:null,j:"Fortalece o quadríceps sem impacto e com pouca carga no joelho"},
  {n:"Agachamento com elástico",e:"Elásticos",j:"Carga leve e progressiva"},
  {n:"Agachamento goblet (taça) com halter",e:"Halteres",t:"joelho"},
  {n:"Agachamento livre com peso corporal",e:null,t:"joelho"},
  {n:"Agachamento frontal com barra",e:"Barra livre",t:"joelho lombar pesado"},
  {n:"Hack machine",e:"Hack/Agachamento máquina",t:"joelho"},
  {n:"Leg press horizontal",e:"Leg press",t:"joelho"},
  {n:"Leg press 45° unilateral",e:"Leg press",t:"joelho"},
  {n:"Leg press 45° pés baixos",e:"Leg press",t:"joelho"},
  {n:"Cadeira extensora unilateral",e:"Cadeira extensora",t:"joelho"},
  {n:"Agachamento sumô com barra",e:"Barra livre",t:"joelho lombar pesado"},
  {n:"Passada (avanço caminhando) com halteres",e:"Halteres",t:"joelho impacto"},
  {n:"Afundo no Smith",e:"Smith",t:"joelho"},
  {n:"Subida no banco (step up) com halteres",e:"Banco",t:"joelho"},
  {n:"Agachamento búlgaro no Smith",e:"Smith",t:"joelho"},
  {n:"Cadeira adutora",e:"Cadeira abdutora/adutora",t:"quadril"}
 ],
 pant:[
  {n:"Panturrilha em pé no Smith",e:"Smith"},
  {n:"Panturrilha no leg press",e:"Leg press"},
  {n:"Panturrilha sentado com halter",e:"Halteres",j:"Ênfase no sóleo"},
  {n:"Panturrilha em pé unilateral com halter",e:"Halteres",t:"tornozelo"},
  {n:"Panturrilha no degrau (peso corporal)",e:null,t:"tornozelo"},
  {n:"Panturrilha com elástico",e:"Elásticos",j:"Carga leve, boa para tornozelo sensível"},
  {n:"Panturrilha sentado na máquina",e:"Máquinas articuladas"},
  {n:"Panturrilha em pé na máquina",e:"Máquinas articuladas"},
  {n:"Panturrilha no hack",e:"Hack/Agachamento máquina"},
  {n:"Elevação das pontas dos pés (tibial anterior)",e:null},
  {n:"Panturrilha unilateral no degrau",e:null,t:"tornozelo"}
 ],
 post:[
  {n:"Mesa flexora",e:"Mesa flexora"},
  {n:"Stiff com halteres",e:"Halteres",t:"lombar pesado"},
  {n:"Elevação pélvica no banco",e:"Banco",j:"Glúteo forte estabiliza joelho e lombar"},
  {n:"Glúteo na polia (coice)",e:"Polia/Crossover"},
  {n:"Levantamento terra romeno com barra",e:"Barra livre",t:"lombar pesado"},
  {n:"Afundo reverso com halteres",e:"Halteres",t:"joelho"},
  {n:"Ponte de glúteo no colchonete",e:null,j:"Sem carga na coluna nem no joelho"},
  {n:"Abdução de quadril com elástico",e:"Elásticos",j:"Glúteo médio, estabiliza o joelho"},
  {n:"Flexão de joelho com elástico",e:"Elásticos"},
  {n:"Cadeira flexora",e:"Cadeira flexora"},
  {n:"Flexora em pé unilateral",e:"Mesa flexora"},
  {n:"Stiff com barra",e:"Barra livre",t:"lombar pesado"},
  {n:"Stiff unilateral com halter",e:"Halteres",t:"lombar"},
  {n:"Bom dia com barra",e:"Barra livre",t:"lombar pesado"},
  {n:"Stiff no Smith",e:"Smith",t:"lombar"},
  {n:"Levantamento terra com kettlebell",e:"Kettlebell",t:"lombar"},
  {n:"Flexão de joelho na bola suíça",e:"Bola suíça"},
  {n:"Mesa flexora unilateral",e:"Mesa flexora"}
 ],
 gluteo:[
  {n:"Elevação pélvica no banco",e:"Banco",j:"Glúteo forte estabiliza joelho e lombar"},
  {n:"Glúteo na polia (coice)",e:"Polia/Crossover"},
  {n:"Ponte de glúteo no colchonete",e:null,j:"Sem carga na coluna nem no joelho"},
  {n:"Abdução de quadril com elástico",e:"Elásticos",j:"Glúteo médio, estabiliza o joelho"},
  {n:"Agachamento sumô com halter",e:"Halteres",j:"Ênfase em glúteo e parte interna da coxa"},
  {n:"Elevação pélvica com barra (hip thrust)",e:"Barra livre",t:"pesado"},
  {n:"Elevação pélvica na máquina",e:"Máquinas articuladas"},
  {n:"Elevação pélvica unilateral",e:"Banco"},
  {n:"Cadeira abdutora",e:"Cadeira abdutora/adutora",t:"quadril"},
  {n:"Cadeira abdutora com tronco à frente",e:"Cadeira abdutora/adutora",t:"quadril"},
  {n:"Coice na máquina",e:"Máquinas articuladas",t:"lombar"},
  {n:"Glúteo 4 apoios com caneleira",e:"Colchonete"},
  {n:"Abdução de quadril na polia",e:"Polia/Crossover"},
  {n:"Abdução deitado de lado",e:"Colchonete"},
  {n:"Concha (clamshell) com elástico",e:"Elásticos"},
  {n:"Agachamento sumô com kettlebell",e:"Kettlebell",t:"joelho"},
  {n:"Passada lateral com miniband",e:"Elásticos"},
  {n:"Recuo (afundo reverso) no Smith",e:"Smith",t:"joelho"},
  {n:"Frog pump (elevação pélvica sapo)",e:"Colchonete"}
 ],
 abdomen:[
  {n:"Prancha abdominal",e:"Colchonete",j:"Estabiliza o tronco sem flexão repetida da lombar"},
  {n:"Abdominal crunch no colchonete",e:"Colchonete"},
  {n:"Elevação de pernas deitado",e:"Colchonete",t:"lombar"},
  {n:"Abdominal na polia",e:"Polia/Crossover"},
  {n:"Dead bug (abdominal deitado)",e:"Colchonete",j:"Controle do abdômen com a lombar apoiada"},
  {n:"Prancha lateral",e:"Colchonete",t:"ombro"},
  {n:"Abdominal infra no colchonete",e:"Colchonete",t:"lombar"},
  {n:"Abdominal bicicleta",e:"Colchonete",t:"pescoco"},
  {n:"Abdominal canivete",e:"Colchonete",t:"lombar"},
  {n:"Elevação de joelhos na barra (abdominal infra)",e:"Barra fixa/Paralelas",t:"ombro"},
  {n:"Abdominal na máquina",e:"Máquinas articuladas"},
  {n:"Abdominal oblíquo na polia",e:"Polia/Crossover",t:"lombar"},
  {n:"Rotação de tronco na polia (lenhador)",e:"Polia/Crossover",t:"lombar"},
  {n:"Pallof press na polia",e:"Polia/Crossover"},
  {n:"Prancha com toque no ombro",e:"Colchonete",t:"punho ombro"},
  {n:"Abdominal remador",e:"Colchonete",t:"lombar"}
 ],
 cardio:[
  {n:"Caminhada (esteira ou ao ar livre)",e:null,min:"20–40"},
  {n:"Caminhada ou trote leve na esteira",e:"Esteira",min:"15–30"},
  {n:"Bicicleta ergométrica",e:"Bicicleta ergométrica",min:"15–30"},
  {n:"Elíptico (transport)",e:"Elíptico"},
  {n:"Remo ergômetro",e:"Remo ergômetro",t:"lombar"},
  {n:"Escada (simulador)",e:"Escada (simulador)",t:"joelho"},
  {n:"Bicicleta horizontal",e:"Bicicleta ergométrica"},
  {n:"Caminhada inclinada na esteira",e:"Esteira"},
  {n:"Corda de pular",e:"Corda de pular",t:"impacto tornozelo joelho"},
  {n:"Polichinelo",e:null,t:"impacto"}
 ],
 mobilidade:[
  {n:"Gato-camelo no colchonete",e:"Colchonete",j:"Mobiliza a coluna com controle"},
  {n:"Alongamento de peito no batente",e:null,j:"Abre o peitoral antes de empurrar"},
  {n:"Rotação de quadril em pé",e:null,j:"Solta o quadril para agachar e caminhar"},
  {n:"Alongamento de posterior de coxa em pé",e:null},
  {n:"World's greatest stretch (passo longo com rotação)",e:null,j:"Mobilidade de quadril e coluna torácica"},
  {n:"Mobilidade de ombro com elástico",e:"Elásticos",j:"Prepara o ombro sem carga alta"},
  {n:"Alongamento do flexor do quadril (afundo ajoelhado)",e:"Colchonete",t:"joelho"},
  {n:"Rotação torácica em quatro apoios",e:"Colchonete"},
  {n:"Mobilidade de tornozelo na parede",e:null},
  {n:"Alongamento de glúteo deitado (figura 4)",e:"Colchonete"},
  {n:"Postura da criança (alongamento de costas)",e:"Colchonete",t:"joelho"}
 ]
};
const GN={peito:"Peito",triceps:"Tríceps",antebraco:"Antebraço",costas:"Costas",biceps:"Bíceps",ombro:"Ombro",quad:"Quadríceps (anterior de coxa)",post:"Posterior de coxa e glúteo",pant:"Panturrilha",caminhada:"Caminhada",gluteo:"Glúteos",abdomen:"Abdômen",cardio:"Cardio",mobilidade:"Mobilidade",descanso:"Descanso"};
const WHY={peito:"trabalha peitoral, ombro anterior e tríceps",costas:"fortalece dorsais e melhora a postura",ombro:"desenvolve deltoides e estabilidade do ombro",antebraco:"fortalece antebraço e pegada, ajudando nos outros exercícios",biceps:"trabalha flexores do cotovelo",triceps:"trabalha extensores do cotovelo",quad:"fortalece quadríceps, essencial para joelho estável e força de perna",post:"fortalece posteriores e glúteos, protegendo joelho e lombar",pant:"fortalece panturrilhas, estabilidade do tornozelo e a caminhada",gluteo:"fortalece glúteos, estabiliza quadril, joelho e lombar",abdomen:"fortalece o abdômen e a estabilidade do tronco",cardio:"trabalha o condicionamento e o gasto calórico",mobilidade:"prepara as articulações e a amplitude antes da carga"};
const SPLIT_GS=[{id:"peito",label:"Peito"},{id:"costas",label:"Costas"},{id:"ombro",label:"Ombros"},{id:"biceps",label:"Bíceps"},{id:"triceps",label:"Tríceps"},{id:"quad",label:"Pernas / quadríceps"},{id:"post",label:"Posterior"},{id:"gluteo",label:"Glúteos"},{id:"pant",label:"Panturrilha"},{id:"abdomen",label:"Abdômen"},{id:"cardio",label:"Cardio"},{id:"descanso",label:"Descanso"}];
const TREINOS=[{nome:"Treino 1",titulo:"Peito + Tríceps + Antebraço",gs:["peito","triceps","antebraco"]},{nome:"Treino 2",titulo:"Costas + Bíceps + Ombro",gs:["costas","biceps","ombro"]},{nome:"Treino 3",titulo:"Posterior de coxa (e glúteo)",gs:["post"]},{nome:"Treino 4",titulo:"Quadríceps + Panturrilha",gs:["quad","pant"]}];
const NOW=()=>window.__fakeNow?new Date(window.__fakeNow):new Date();const dayKey=d=>d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();
const WKF=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const DAYSETS={2:[1,4],3:[1,3,5],4:[1,2,3,4],5:[1,2,3,4,5],6:[1,2,3,4,5,6]};
function params_old(){const o=S.a.objetivo,l=S.a.nivel;let p={hipertrofia:{s:4,r:"8–12",d:"60–90s"},emagrecimento:{s:3,r:"12–15",d:"30–45s"},condicionamento:{s:3,r:"15–20",d:"30s"},saude:{s:3,r:"10–15",d:"60s"}}[o]||{s:3,r:"10–12",d:"60s"};p={...p};if(l==="iniciante")p.s=Math.min(p.s,3);if(l==="avancado")p.s++;const m=S.a.medInfo;if(m&&m.low){p.s=Math.max(2,p.s-1);p.r="12–15 (carga leve)";p.d="90s"}return p}
function params(){const gs=goalSet(),m=S.a.medInfo;const p={s:4,r:"10–12",d:"60s",circuit:false,cardio:false,mobility:false};
 if(gs.includes("forca")&&gs.includes("hipertrofia")){p.r="6–8";p.d="2 min"}
 else if(gs.includes("forca")){p.r="4–6";p.d="2–3 min"}
 else if(gs.includes("hipertrofia")){p.r="8–12";p.d="60s"}
 else if(gs.includes("emagrecimento")){p.r="12–15";p.d="30–45s"}
 else if(gs.includes("condicionamento")){p.r="15–20";p.d="30s"}
 else {p.r="10–15";p.d="60s"}
 if(gs.includes("emagrecimento")){p.cardio=true;if(!gs.includes("forca")){p.circuit=true;p.d="30–45s";if(!gs.includes("hipertrofia"))p.r="12–15"}}
 if(gs.includes("condicionamento")&&!gs.includes("forca"))p.cardio=true;
 if(gs.includes("mobilidade"))p.mobility=true;
 if(m&&m.low){p.s=3;p.r="12–15 (carga leve)";p.d="90s (1min30)";p.circuit=false}return p}
function perGroup(){const t=S.a.tempo||60;return t<50?3:4}
function curRestr(){const A=S.a,M=A.medInfo||{tags:[]};return Object.keys(A.dores).filter(k=>A.dores[k].int===undefined||A.dores[k].int===null||A.dores[k].int>=2).concat(M.tags||[])}
function badTags(x,restr){return(x.t||"").split(" ").filter(t=>t&&restr.includes(t))}
function whyAvoid(x,bad){const mt=(S.a.medInfo&&S.a.medInfo.tags)||[];return x.n+" (evitado"+(bad.some(b=>mt.includes(b))?" conforme orientação médica: “"+S.a.med+"”":" por restrição: "+bad.join(", "))+")"}
function mkEx(x,g,P){const M=S.a.medInfo||{};const e={n:x.n,g,s:P.s,r:P.r,d:P.d,j:"Por que: "+(WHY[g]||"trabalha o grupo escolhido")+(x.j?". "+x.j:"")+" — ajuda no seu objetivo: “"+objShow()+"”."+(M.low?" Carga leve conforme orientação médica.":""),sub:""};if(g==="cardio"){e.s=1;e.r=(x.min||"20–30")+" min";e.d="—"}if(g==="mobilidade"){e.s=1;e.r="30–40 s";e.d="—"}return e}
function buildBlock(g,restr,P,n){const ex=[],why=[];
 for(const x of (EX[g]||[])){if(ex.length>=n)break;if(x.e&&!S.equip.includes(x.e))continue;const b=badTags(x,restr);if(b.length){why.push(whyAvoid(x,b));continue}ex.push(mkEx(x,g,P))}
 if(why.length&&ex.length)ex[0].sub=why.join("; ");
 return{g,ex,aviso:ex.length<Math.min(3,n)?"Só "+ex.length+" exercício(s) compatível(is) com equipamentos/restrições.":""}}
function alts(g){return EX[g].filter(x=>!x.e||S.equip.includes(x.e))}
function mondayOf(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
function planStart(){return S.aprov&&S.aprov.ts?S.aprov.ts:(S.plan&&S.plan.criado?Date.parse(S.plan.criado):Date.now())}
function isCustomSplit(){return !!(S.plan&&S.plan.split&&S.plan.split.custom&&Array.isArray(S.plan.split.days)&&S.plan.split.days.length)}
function gsClean(gs){const ids=SPLIT_GS.map(g=>g.id),out=[];(gs||[]).forEach(g=>{if(ids.includes(g)&&g!=="descanso"&&EX[g]&&!out.includes(g))out.push(g)});return out}
function weekPlan(ref){if(isCustomSplit()){const by={};let i=0;S.plan.split.days.forEach(d=>{if(gsClean(d.gs).length)by[d.w]=i++});return[1,2,3,4,5,6,0].map(w=>({w,dia:WKF[w],t:by[w]==null?null:by[w]}))}
 const N=S.a.dias,days=DAYSETS[N]||DAYSETS[3],T=S.plan.treinos.length;const wk=Math.max(0,Math.round((mondayOf(ref)-mondayOf(planStart()))/6048e5));
 return[1,2,3,4,5,6,0].map(w=>{const pos=days.indexOf(w);return{w,dia:WKF[w],t:pos<0?null:(wk*N+pos)%T}})}
function activeSwap(){const sw=S.plan&&S.plan.swapHoje;if(!sw||sw.dk!==dayKey(NOW()))return null;if(sw.rest)return sw;if(!sw.blocos||!sw.blocos.length)return null;return sw}
function todayTreino(){const now=NOW(),w=now.getDay(),wp=weekPlan(now),order=[1,2,3,4,5,6,0];const ti=order.indexOf(w);const sw=activeSwap();
 if(sw&&sw.rest)return{idx:null,dia:WKF[w],hoje:false,swap:true};
 if(sw)return{idx:wp[ti].t==null?-1:wp[ti].t,dia:wp[ti].dia,hoje:true,swap:true};
 if(wp[ti].t!==null)return{idx:wp[ti].t,dia:wp[ti].dia,hoje:true};
 for(let i=ti+1;i<7;i++)if(wp[i].t!==null)return{idx:wp[i].t,dia:wp[i].dia,hoje:false};
 const nx=weekPlan(new Date(now.getTime()+7*864e5)).find(x=>x.t!==null);return{idx:nx?nx.t:0,dia:(nx?nx.dia:"")+" (próx. semana)",hoje:false}}
function walkingTreino(){const A=S.a;return{nome:"Treino 1",titulo:"Caminhada",blocos:[{g:"caminhada",ex:[{n:"Caminhada (esteira ou ao ar livre)",g:"caminhada",s:1,r:Math.min(60,Math.max(20,A.tempo-10))+" min",d:"—",j:"Por que: a orientação médica informada (“"+A.med+"”) permite apenas caminhada. Ritmo em que dá para conversar.",sub:"Musculação suspensa até nova orientação médica"}]}]}}
function prioMain(){const A=S.a,gs=Array.isArray(A.prioGs)&&A.prioGs.length?A.prioGs:prioGroups(A.prioridade||"");return gs.find(g=>EX[g]&&g!=="mobilidade")||""}
function autoTreinos(){const M=S.a.medInfo||{},P=params(),restr=curRestr();if(M.soCaminhada)return[walkingTreino()];
 const prio=prioMain();let list=TREINOS.map(T=>({titulo:T.titulo,gs:T.gs.slice(),base:T.gs.join(",")} ));
 if(prio){let idx=list.findIndex(t=>t.gs.includes(prio)||(prio==="gluteo"&&t.gs.includes("post")));if(idx<0)idx=0;if(!list[idx].gs.includes(prio))list[idx].gs=[prio,...list[idx].gs];else list[idx].gs=[prio,...list[idx].gs.filter(g=>g!==prio)];const day=list.splice(idx,1)[0];list.unshift(day)}
 return list.map((T,i)=>{const blocks=[];if(P.mobility){const b=buildBlock("mobilidade",restr,{s:1,r:"30–40 s",d:"—"},3);if(b.ex.length)blocks.push(b)}
  T.gs.forEach(g=>{const extra=g===prio,n=g==="cardio"?1:(extra?Math.min(perGroup()+1,5):perGroup()),PP=extra?{...P,s:Math.min((P.s||4)+1,6)}:P;blocks.push(buildBlock(g,restr,PP,n))});
  if(P.cardio&&!T.gs.includes("cardio")){const b=buildBlock("cardio",restr,P,1);if(b.ex.length)blocks.push(b)}
  const same=T.gs.join(",")===T.base&&!P.mobility&&!P.cardio;const titulo=same?T.titulo:T.gs.map(g=>GN[g]||g).join(" + ")+(P.circuit?" (circuito)":"");
  return{nome:"Treino "+(i+1),titulo,gs:T.gs,blocos:blocks.filter(b=>b.ex.length)}})}
function generate(quiet){const P=params(),restr=curRestr();
 S.plan={treinos:autoTreinos(),restr,params:P,criado:new Date().toISOString()};S.status=risk().length?"bloqueado":"pendente";save();render();
 if(!quiet)say(S.status==="bloqueado"?"Seu treino foi gerado, mas está bloqueado até você apresentar liberação médica ao personal.":"Treino gerado! Agora ele aguarda a aprovação do seu personal.")}
function treinoFromGs(label,gs){const groups=gsClean(gs);if(!groups.length)return null;const P=params(),restr=curRestr();
 const nome=(label||"").trim()||groups.map(g=>GN[g]||g).join(" + ");
 return{nome,titulo:groups.map(g=>GN[g]||g).join(" + "),gs:groups,blocos:groups.map(g=>buildBlock(g,restr,P,g==="cardio"?Math.min(perGroup(),3):perGroup()))}}
function autoSeed(){const N=S.a.dias||3,days=DAYSETS[N]||DAYSETS[3],ids=SPLIT_GS.map(g=>g.id);
 return days.map((w,pos)=>{const tr=TREINOS[pos%TREINOS.length];return{w,label:tr.titulo,gs:tr.gs.filter(g=>ids.includes(g))}})}
function applySplit(days){if(!S.plan)return;grpOpen=null;const prev={};(S.plan.treinos||[]).forEach(t=>{if(t&&t.w!=null)prev[t.w]=t});
 const train=days.filter(d=>gsClean(d.gs).length);if(!train.length){alert("Escolha pelo menos um grupo muscular em algum dia.");render();return}
 S.plan.treinos=train.map(d=>{const gs=gsClean(d.gs),old=prev[d.w],same=old&&JSON.stringify(old.gs||[])===JSON.stringify(gs);
  if(same){const copy=JSON.parse(JSON.stringify(old));copy.nome=(d.label||"").trim()||copy.nome;copy.w=d.w;return copy}
  const t=treinoFromGs(d.label,gs);t.w=d.w;return t});
 S.plan.split={custom:true,days:days.map(d=>({w:d.w,label:(d.label||"").trim(),gs:gsClean(d.gs)}))};
 S.plan.params=params();S.plan.restr=curRestr();save();render()}
function useAutoSplit(){if(!S.plan)return;grpOpen=null;const criado=S.plan.criado,swap=S.plan.swapHoje;
 S.plan.treinos=autoTreinos();S.plan.params=params();S.plan.restr=curRestr();S.plan.split=null;S.plan.criado=criado;if(swap)S.plan.swapHoje=swap;save();render()}
function setSwap(treino){if(!S.plan)return;grpOpen=null;const dk=dayKey(NOW());S.adj=(S.adj||[]).filter(a=>a.dk!==dk);
 if(!treino){S.plan.swapHoje=null;save();render();return}
 const slot=weekPlan(NOW()).find(x=>x.w===NOW().getDay());
 S.plan.swapHoje={dk,nome:treino.nome,titulo:treino.titulo||treino.nome,gs:treino.gs||[],blocos:treino.blocos||[],rest:!!treino.rest,idx:slot&&slot.t!=null?slot.t:-1};save();render()}
function swapFromDay(idx){const src=S.plan&&S.plan.treinos[+idx];if(!src)return;setSwap(JSON.parse(JSON.stringify(src)))}
function swapFromGs(gs){const groups=gsClean(gs);if(!groups.length){setSwap({rest:true,nome:"Descanso",titulo:"Descanso",gs:["descanso"],blocos:[]});return}const t=treinoFromGs("",groups);if(t)setSwap(t)}
/* Edição pelo personal */
function editPlan(act,di,bi,ei,val){const P=S.plan.params||params(),d=S.plan.treinos[di];if(!d)return;const blk=d.blocos[bi];if(!blk)return;
 if(act==="add"){const x=(EX[blk.g]||[]).find(z=>z.n===val);if(!x||blk.ex.some(e=>e.n===x.n))return;blk.ex.push(mkEx(x,blk.g,P));grpOpen=di+"-"+bi;save();render();return}
 const e=blk.ex[ei];if(!e)return;
 if(act==="rm"){blk.ex.splice(ei,1);if(!blk.ex.length){d.blocos.splice(bi,1);grpOpen=null}else grpOpen=di+"-"+bi}
 else if(act==="up"&&ei>0){[blk.ex[ei-1],blk.ex[ei]]=[blk.ex[ei],blk.ex[ei-1]];grpOpen=di+"-"+bi}
 else if(act==="down"&&ei<blk.ex.length-1){[blk.ex[ei+1],blk.ex[ei]]=[blk.ex[ei],blk.ex[ei+1]];grpOpen=di+"-"+bi}
 else if(act==="swap"){const x=EX[e.g]&&EX[e.g].find(z=>z.n===val);if(!x)return;const b=badTags(x,S.plan.restr||[]);const ne=mkEx(x,e.g,P);ne.s=e.s;ne.r=e.r;ne.d=e.d;ne.sub="Trocado pelo personal"+(b.length?" (atenção: restrição "+b.join(", ")+")":"");blk.ex[ei]=ne;grpOpen=di+"-"+bi}
 else if(act==="s"){const v=parseInt(val);if(v>=1&&v<=10)e.s=v;else return;grpOpen=di+"-"+bi}
 else if(act==="r"&&val.trim()){e.r=val.trim().slice(0,20);grpOpen=di+"-"+bi}
 else if(act==="d"&&val.trim()){e.d=val.trim().slice(0,20);grpOpen=di+"-"+bi}
 else return;
 save();render()}
const MANUAL_HINT="Seu personal vai te ensinar a execução";
let customEx=[],customOpen="",customTried=false,customGen=0;
function manualText(e){const n=e&&e.nota&&String(e.nota).trim();return n||MANUAL_HINT}
function meRole(){try{return typeof ME!=="undefined"&&ME&&ME.role}catch(err){return null}}
function mkManual(g,nome,nota,s,r,d,P){const note=String(nota||"").trim().slice(0,200),name=String(nome||"").trim().slice(0,80);let sv=parseInt(s,10);if(!(sv>=1&&sv<=10))sv=(P&&P.s)||3;const rv=String(r||(P&&P.r)||"10–12").trim().slice(0,20)||"10–12",dv=String(d||(P&&P.d)||"60s").trim().slice(0,20)||"60s";return{n:name,g,s:sv,r:rv,d:dv,j:note||MANUAL_HINT,nota:note,manual:true,sub:""}}
function ensureCustom(){if(customTried||meRole()!=="personal"||!unlocked||!viewing)return;customTried=true;const gen=customGen;fetch("/api/personal/exercises").then(async r=>{if(!r.ok||gen!==customGen)return;const j=await r.json();if(gen!==customGen)return;customEx=j.exercises||[];if(customOpen)render()}).catch(()=>{})}
async function customReq(url,method,body){const r=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"Não foi possível salvar o exercício.");return j}
function applyManual(di,bi,ei,row){const d=S.plan&&S.plan.treinos[di];if(!d)return;const blk=d.blocos[bi];if(!blk||row.n.length<2)return;if(ei<0){if(blk.ex.some(e=>String(e.n).toLowerCase()===row.n.toLowerCase()))return;blk.ex.push(row)}else{if(!blk.ex[ei])return;blk.ex[ei]=row}customOpen="";grpOpen=di+"-"+bi;save();render()}
function customKey(di,bi,ei){return di+"-"+bi+"-"+(ei<0?"add":ei)}
function customTab(di,bi,ei){const k=customKey(di,bi,ei);return `<button type="button" class="btn sm sec exCustomTab${customOpen===k?" on":""}" data-cxkey="${k}">✏️ Outro exercício</button>`}
function customPanel(di,bi,ei,g){const k=customKey(di,bi,ei);if(customOpen!==k)return "";const P=(S.plan&&S.plan.params)||params();const cur=ei>=0?((((S.plan.treinos[di]||{}).blocos||[])[bi]||{}).ex||[])[ei]||{}:{};const mine=(customEx||[]).filter(x=>x.grupo===g);const list=mine.length?`<div class="meus"><b>Meus exercícios</b>${mine.map(x=>`<div class="meu"><span><b>${esc(x.nome)}</b>${x.nota?`<small>${esc(x.nota)}</small>`:""}</span><span class="exActs"><button type="button" class="btn sm" data-use="${x.id}" data-d="${di}" data-b="${bi}" data-e="${ei}">Usar</button><button type="button" class="btn sm bad" data-delx="${x.id}">Apagar</button></span></div>`).join("")}</div>`:`<p class="meusEmpty">Meus exercícios: nenhum neste grupo ainda.</p>`;return `<div class="exCustom" data-cx="${k}"><label>Nome do exercício<input class="cxNome" maxlength="80" placeholder="Ex.: Remada cavalinho" value="${esc(ei>=0&&cur.manual?cur.n:"")}"></label><label>Instrução (opcional)<input class="cxNota" maxlength="200" placeholder="Como o aluno deve fazer" value="${esc(cur.nota||"")}"></label><div class="cxSets"><label>Séries <input class="cxS" type="number" min="1" max="10" value="${esc(cur.manual?cur.s:(P.s||3))}"></label><label>Reps <input class="cxR" maxlength="20" value="${esc(cur.manual?cur.r:(P.r||""))}"></label><label>Descanso <input class="cxD" maxlength="20" value="${esc(cur.manual?cur.d:(P.d||""))}"></label></div><button type="button" class="btn sm" data-savecx="1" data-d="${di}" data-b="${bi}" data-e="${ei}" data-g="${esc(g)}">Salvar exercício</button>${list}</div>`}
function exGrupo(g,sel){const lab=esc(GN[g]||g);return `<optgroup label="${lab}">`+(EX[g]||[]).map(x=>`<option ${x.n===sel?"selected":""}>${esc(x.n)}</option>`).join("")+"</optgroup>"}
function exAdd(g,usados,di,bi){const lab=esc(GN[g]||g);const list=(EX[g]||[]).filter(x=>!usados.includes(x.n));return `<div class="exPick"><input class="exBusca" type="search" placeholder="Buscar variação" aria-label="Buscar variação em ${lab}"><select data-act="add" size="8" data-d="${di}" data-b="${bi}" data-e="-1"><option value="">Adicionar exercício</option><optgroup label="${lab}">${list.map(x=>`<option>${esc(x.n)}</option>`).join("")}</optgroup></select></div>`}
function exEdit(e,di,bi,ei){if(!EX[e.g])return "";return `<div class="edit"><select data-act="swap" data-d="${di}" data-b="${bi}" data-e="${ei}">${(EX[e.g].some(x=>x.n===e.n)?"":`<option value="" selected>${esc(e.n)}</option>`)+exGrupo(e.g,e.n)}</select>${customTab(di,bi,ei)}${customPanel(di,bi,ei,e.g)}<label>Séries <input type="number" min="1" max="10" value="${e.s}" data-act="s" data-d="${di}" data-b="${bi}" data-e="${ei}"></label><label>Reps <input value="${esc(e.r)}" data-act="r" data-d="${di}" data-b="${bi}" data-e="${ei}"></label><label>Descanso <input value="${esc(e.d)}" data-act="d" data-d="${di}" data-b="${bi}" data-e="${ei}"></label><span class="exActs"><button type="button" class="btn sm sec" data-act="up" data-d="${di}" data-b="${bi}" data-e="${ei}">↑</button><button type="button" class="btn sm sec" data-act="down" data-d="${di}" data-b="${bi}" data-e="${ei}">↓</button><button type="button" class="btn sm bad" data-act="rm" data-d="${di}" data-b="${bi}" data-e="${ei}">Remover</button></span></div>`}
function saveCustomFrom(btn){const box=btn.closest(".exCustom");if(!box||!S.plan)return;const di=+btn.dataset.d,bi=+btn.dataset.b,ei=+btn.dataset.e,g=btn.dataset.g,P=S.plan.params||params();const row=mkManual(g,box.querySelector(".cxNome").value,box.querySelector(".cxNota").value,box.querySelector(".cxS").value,box.querySelector(".cxR").value,box.querySelector(".cxD").value,P);if(row.n.length<2){alert("Informe o nome do exercício.");return}const blk=S.plan.treinos[di]&&S.plan.treinos[di].blocos[bi];if(!blk)return;if(ei<0&&blk.ex.some(e=>String(e.n).toLowerCase()===row.n.toLowerCase())){alert("Esse exercício já está neste bloco.");return}btn.disabled=true;customReq("/api/personal/exercises","POST",{nome:row.n,nota:row.nota,grupo:row.g,series:row.s,reps:row.r,descanso:row.d}).then(j=>{customGen++;customEx=j.exercises||[];applyManual(di,bi,ei,row)}).catch(err=>{btn.disabled=false;alert(err.message)})}
function useCustom(id,di,bi,ei){const x=(customEx||[]).find(z=>z.id===id);if(!x||!S.plan)return;const row=mkManual(x.grupo,x.nome,x.nota,x.series,x.reps,x.descanso,S.plan.params||params());const blk=S.plan.treinos[di]&&S.plan.treinos[di].blocos[bi];if(!blk)return;if(ei<0&&blk.ex.some(e=>String(e.n).toLowerCase()===row.n.toLowerCase())){alert("Esse exercício já está neste bloco.");return}applyManual(di,bi,ei,row)}
function delCustom(id){if(!confirm("Apagar este exercício da sua lista? Ele continua nos treinos em que você já colocou."))return;customReq("/api/personal/exercises/"+id,"DELETE").then(j=>{customGen++;customEx=j.exercises||[];render()}).catch(err=>alert(err.message))}

/* ---------- Ajustes conversacionais ---------- */
function isTired(n){return/cansad|cansaco|exaust|sem energia|acordei mal|dormi mal|nao dormi|dormi pouco|insonia|sono|indispost|moid|quebrad|esgotad|fadiga|sem forca|desanimad/.test(n)}
const PAINMAP=[["ombro",/ombro/],["lombar",/costas|lombar|coluna/],["joelho",/joelho/],["punho",/punho|pulso/],["cotovelo",/cotovelo/],["pescoco",/pescoco|cervical/],["quadril",/quadril|virilha/],["tornozelo",/tornozelo/]];
const PAINLBL={ombro:"ombro",lombar:"costas",joelho:"joelho",punho:"punho",cotovelo:"cotovelo",pescoco:"pescoço",quadril:"quadril",tornozelo:"tornozelo"};
const MAINOF={ombro:["ombro"],lombar:["costas"],joelho:["quad"],punho:["antebraco"],cotovelo:["triceps","biceps"],quadril:["post"],tornozelo:["pant"]};
const EXTRA={lombar:/agachamento livre|terra|stiff|remada curvada|smith|farmer|bulgaro|afundo/i,ombro:/desenvolvimento|mergulho|supino fechado|barra fixa|frances/i,joelho:/agachamento livre|bulgaro|afundo|extensora/i,pescoco:/desenvolvimento|farmer|terra|encolhimento/i};
const UNSAFE="Não consegui ajustar com segurança. Consulte o seu personal.",DUV="Qualquer dúvida, consulte o seu personal.";
function adjust(t){if(correction(t))return;if(S.status!=="aprovado"||!S.plan){const msg="Seu treino ainda aguarda a aprovação do personal. Se quiser corrigir uma resposta, diga por exemplo: errei, são 4 dias por semana.";$("#adjOut").innerHTML=`<div class="alert warn">${esc(msg)}</div>`;return}
 const n=norm(t),td=todayTreino();if(!td.hoje){$("#adjOut").innerHTML=`<div class="alert warn">${esc("Hoje é descanso, não há treino para ajustar. "+DUV)}</div>`;return}
 const sw=activeSwap();const orig=(sw&&!sw.rest?sw:(S.plan.treinos[td.idx]||S.plan.treinos[0]));const day=JSON.parse(JSON.stringify(orig));const exp=[],lbl=[];let unsafe="";
 const tired=isTired(n),painW=/\bdor\b|dores|doendo|doi\b|machuc|lesion|incomod|travad/.test(n);
 const areas=PAINMAP.filter(([k,r])=>r.test(n)).map(x=>x[0]);
 if(painW&&!areas.length)unsafe="não identifiquei o local da dor";
 if(painW&&/muito forte|dor forte|insuportavel|aguda|nao consigo mexer|travou|travad|inchad|formigament|piorando muito|10 de 10|9 de 10|8 de 10/.test(n))unsafe="dor forte";
 if(!unsafe){
  if(tired){const m=t.match(/dormi mal|acordei mal|n[aã]o dormi|dormi pouco|sem energia|cansad[oa]|exaust[oa]|esgotad[oa]/i);lbl.push(m?m[0].toLowerCase():"cansaço");
   day.blocos.forEach(b=>b.ex.forEach(e=>{if(e.g!=="caminhada"){e.s=Math.min(e.s,3);e.d="90s (1min30)"}}));exp.push("Por causa do cansaço: 3 séries por exercício com 1min30 de descanso, intensidade moderada.")}
  if(areas.length){lbl.push("dor no "+areas.map(a=>PAINLBL[a]).join(" e "));const restr=(S.plan.restr||[]).concat(areas);
   const bad=x=>badTags(x,areas).length||areas.some(a=>EXTRA[a]&&EXTRA[a].test(x.n));
   day.blocos.forEach(bk=>{if(!EX[bk.g])return;const main=areas.find(a=>(MAINOF[a]||[]).includes(bk.g));const used=new Set(bk.ex.map(e=>e.n));
    const manual=e=>!!(e&&(e.manual||!(EX[bk.g]||[]).some(z=>z.n===e.n)));
    bk.ex=bk.ex.map(e=>{if(manual(e))return e;const x=EX[bk.g].find(z=>z.n===e.n);if(!bad(x))return e;
     const alt=EX[bk.g].find(z=>!bad(z)&&!badTags(z,restr).length&&(!z.e||S.equip.includes(z.e))&&!used.has(z.n));
     if(alt){used.add(alt.n);exp.push("Troquei "+e.n+" por "+alt.n+" (poupa o "+PAINLBL[areas.find(a=>bad(x)&&(badTags(x,[a]).length||EXTRA[a]&&EXTRA[a].test(x.n)))||areas[0]]+").");return{...e,n:alt.n,j:"Substituição por dor hoje. "+(alt.j||"Amplitude confortável e carga controlada."),sub:""}}
     exp.push("Tirei "+e.n+" hoje para poupar a região dolorida.");return null}).filter(Boolean);
    if(main){let n=0;bk.ex=bk.ex.filter(e=>manual(e)||n++<2).map(e=>manual(e)?e:{...e,s:Math.min(e.s,3),r:"12–15 (carga leve)",d:"90s (1min30)",sub:"Versão leve: a dor atinge o músculo principal deste bloco. Amplitude reduzida, sem dor durante o movimento."});
     exp.push(bk.ex.length?"Como a dor atinge "+(GN[bk.g]||bk.g)+", deixei esse bloco em versão leve (2 exercícios, carga leve, amplitude reduzida).":"Tirei o bloco de "+(GN[bk.g]||bk.g)+" hoje.")}});
   day.blocos=day.blocos.filter(b=>b.ex.length);
   const kept=day.blocos.reduce((s,b)=>s+b.ex.length,0),tot=orig.blocos.reduce((s,b)=>s+b.ex.length,0);
   if(!kept||kept<tot/3)unsafe="o treino de hoje ficaria comprometido";
   else{const nohit=areas.filter(a=>!exp.some(x=>x.includes(PAINLBL[a])))
    ;if(nohit.length&&!exp.some(x=>/Troquei|Tirei|leve/.test(x)))exp.push("O treino de hoje não sobrecarrega "+nohit.map(a=>"o "+PAINLBL[a]).join(" nem ")+"; mantenha carga leve.");
    exp.push("Se a dor for forte ou piorar, pare e fale com seu personal.")}}
  if(!unsafe&&/pouco tempo|pressa|rapido/.test(n)){day.blocos.forEach(b=>{b.ex=b.ex.slice(0,2);b.ex.forEach(e=>e.d="45s")});lbl.push("pouco tempo");exp.push("Pouco tempo: 2 exercícios por grupo com descanso menor.")}
  if(!unsafe&&!lbl.length)unsafe="não entendi o que ajustar";}
 const dk=dayKey(NOW()),dt=NOW().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
 if(unsafe){S.adjLog=(S.adjLog||[]).concat([dt+" “"+t+"” — não ajustado ("+unsafe+")"]);save();render();$("#adjOut").innerHTML=`<div class="alert bad">⚠️ <b>${UNSAFE}</b><br><small>${esc(unsafe[0].toUpperCase()+unsafe.slice(1))}.</small></div>`;return}
 exp.push(DUV);day.adj=true;day.lbl=lbl.join(" + ");
 S.adj=(S.adj||[]).filter(a=>a.dk!==dk);S.adj.unshift({t,dk,idx:td.idx,quando:new Date().toLocaleString("pt-BR"),exp,day});S.adj=S.adj.slice(0,10);
 S.adjLog=(S.adjLog||[]).concat([dt+" "+day.lbl]);save();render()}
function todayAdj(){if(!S.plan||S.status!=="aprovado")return null;const td=todayTreino();return td.hoje?(S.adj||[]).find(a=>a.dk===dayKey(NOW())&&a.day&&(a.idx===undefined||a.idx===td.idx)):null}

/* ---------- Detalhes dos exercícios ---------- */
const HOW={
"Supino reto com halteres":["Deite no banco reto com os pés firmes no chão, um halter em cada mão na altura do peito, escápulas encaixadas para trás e para baixo.","Empurre os halteres para cima até quase estender os cotovelos, aproximando-os no topo; desça devagar até a linha do peito, cotovelos a uns 45° do tronco.","Abrir demais os cotovelos (90°), bater os halteres no topo, tirar o quadril do banco.","Use carga que permita controle; peça ajuda para posicionar halteres pesados.","Peitoral maior, ombro anterior e tríceps"],
"Supino na máquina":["Ajuste o banco para que as manoplas fiquem na linha do meio do peito; costas apoiadas e pés no chão.","Empurre as manoplas à frente até quase estender os braços e volte devagar até sentir o peito alongar.","Desencostar as costas, travar os cotovelos, voltar rápido deixando o peso bater.","Trajetória guiada: boa opção para iniciantes e para quem tem desconforto no ombro.","Peitoral maior, ombro anterior e tríceps"],
"Supino inclinado com halteres":["Banco inclinado a 30–45°, halteres na altura da parte de cima do peito, escápulas encaixadas.","Empurre os halteres para cima e levemente para dentro; desça controlando até a linha do peito.","Inclinar demais o banco (vira exercício de ombro), arquear muito a lombar.","Evite descer além do confortável se sentir o ombro.","Peitoral superior (clavicular), ombro anterior e tríceps"],
"Crucifixo no crossover":["Polias na altura dos ombros ou um pouco acima, um passo à frente, tronco levemente inclinado, cotovelos levemente flexionados.","Traga as mãos à frente do peito em arco, como num abraço, e volte devagar abrindo até sentir o peito alongar.","Dobrar e esticar os cotovelos (vira supino), usar o impulso do corpo.","Carga moderada; não abra além da linha dos ombros.","Peitoral maior e ombro anterior"],
"Supino reto com barra":["Deite com os olhos sob a barra, pegada um pouco mais larga que os ombros, pés firmes, escápulas encaixadas.","Tire a barra do suporte, desça controlando até tocar levemente o meio do peito e empurre de volta.","Quicar a barra no peito, tirar o quadril do banco, cotovelos muito abertos.","Use sempre alguém de apoio (spotter) ou travas de segurança em cargas altas.","Peitoral maior, ombro anterior e tríceps"],
"Supino no Smith":["Banco centralizado de modo que a barra desça sobre o meio do peito; ajuste as travas de segurança.","Destrave a barra girando os punhos, desça controlando até o peito e empurre de volta.","Banco mal posicionado (barra no pescoço ou na barriga), esquecer de travar no fim.","Ajuste as travas um pouco acima do peito para segurança.","Peitoral maior, ombro anterior e tríceps"],
"Crucifixo com halteres":["Deite no banco reto com os halteres acima do peito, palmas viradas uma para a outra, cotovelos levemente dobrados.","Abra os braços em arco até a altura do peito e volte pelo mesmo caminho, como num abraço.","Descer demais, esticar os cotovelos por completo, usar carga muito alta.","Amplitude confortável; pare antes de sentir o ombro.","Peitoral maior e ombro anterior"],
"Flexão de braço":["Mãos no chão um pouco mais largas que os ombros, corpo reto da cabeça aos pés (ou joelhos apoiados para facilitar).","Desça o peito em direção ao chão com cotovelos a 45° e empurre de volta mantendo o abdômen firme.","Deixar o quadril cair ou subir, olhar para frente forçando o pescoço.","Se o punho incomodar, use apoios de flexão ou halteres como pegada.","Peitoral, ombro anterior, tríceps e abdômen"],
"Tríceps na polia (corda)":["De frente para a polia alta, corda nas mãos, cotovelos colados ao lado do corpo, tronco levemente inclinado.","Estenda os cotovelos levando a corda para baixo e abrindo as pontas no final; volte devagar até 90°.","Mexer os cotovelos para frente e para trás, usar o tronco para empurrar.","Baixo estresse no cotovelo; ótima opção para começar.","Tríceps"],
"Tríceps testa com halteres":["Deitado no banco, halteres acima do peito com braços estendidos e palmas viradas uma para a outra.","Dobre só os cotovelos levando os halteres para o lado da cabeça e estenda de volta.","Abrir os cotovelos, mexer os ombros, descer rápido.","Carga moderada; evite se sentir dor no cotovelo.","Tríceps (principalmente a porção longa)"],
"Tríceps coice com halter":["Apoie uma mão e um joelho no banco, tronco paralelo ao chão, braço de trabalho colado ao corpo com cotovelo a 90°.","Estenda o cotovelo levando o halter para trás até o braço ficar reto; volte devagar.","Balançar o braço, deixar o cotovelo cair.","Carga leve a moderada, foco em contrair no final.","Tríceps"],
"Tríceps francês com halter":["Sentado com as costas apoiadas, segure um halter com as duas mãos acima da cabeça.","Dobre os cotovelos levando o halter atrás da cabeça e estenda de volta, cotovelos apontando para cima.","Abrir os cotovelos, arquear a lombar.","Evite se tiver dor no ombro; comece leve.","Tríceps (porção longa)"],
"Mergulho no banco":["Mãos na borda de um banco atrás do corpo, pernas à frente, quadril perto do banco.","Dobre os cotovelos descendo o quadril até cerca de 90° e empurre de volta.","Descer demais, afastar o quadril do banco, ombros subindo para a orelha.","Força bastante o ombro e o punho; evite se tiver dor nessas regiões.","Tríceps, ombro anterior e peitoral"],
"Tríceps com elástico":["Prenda o elástico em um ponto alto, segure com as mãos e cole os cotovelos ao lado do corpo.","Estenda os cotovelos para baixo e volte devagar resistindo ao elástico.","Deixar o elástico puxar rápido na volta, mexer os cotovelos.","Carga leve e progressiva, gentil com as articulações.","Tríceps"],
"Supino fechado":["Deitado no banco, barra com pegada na largura dos ombros.","Desça a barra até a parte de baixo do peito com cotovelos perto do corpo e empurre de volta.","Pegada fechada demais (força o punho), cotovelos abertos.","Força ombro; use spotter em cargas altas.","Tríceps, peitoral e ombro anterior"],
"Rosca punho com halter":["Sentado, antebraço apoiado na coxa ou no banco, palma para cima e punho para fora do apoio.","Flexione o punho trazendo o halter para cima e desça devagar.","Mexer o antebraço, usar carga alta com movimento curto.","Carga leve; evite se tiver dor no punho.","Flexores do antebraço"],
"Rosca punho invertida com halter":["Sentado, antebraço apoiado, palma para baixo e punho para fora do apoio.","Estenda o punho levantando o dorso da mão e desça devagar.","Carga pesada demais, movimentos rápidos.","Comece bem leve; evite se tiver dor no punho.","Extensores do antebraço"],
"Rosca inversa na polia":["De frente para a polia baixa, barra com pegada pronada (palmas para baixo), cotovelos ao lado do corpo.","Flexione os cotovelos trazendo a barra até o peito e desça devagar.","Balançar o tronco, abrir os cotovelos.","Carga moderada; pare se o cotovelo doer.","Braquiorradial, antebraço e bíceps"],
"Pegada isométrica com halter":["Em pé, halteres pesados nas mãos, braços estendidos ao lado do corpo, ombros para trás.","Segure firme pelo tempo indicado (20–40 s por série) sem deixar o punho dobrar.","Encolher os ombros, curvar as costas.","Sem movimento do punho: boa opção quando ele está sensível.","Músculos de pegada do antebraço e trapézio"],
"Rosca punho com barra":["Sentado, antebraços apoiados nas coxas, barra com palmas para cima.","Flexione os punhos subindo a barra e desça devagar.","Usar impulso, carga alta demais.","Evite se tiver dor no punho.","Flexores do antebraço"],
"Caminhada do fazendeiro (farmer walk)":["Halteres pesados nas mãos, postura ereta, abdômen firme, ombros para trás.","Caminhe em passos curtos e firmes pela distância ou tempo indicado.","Curvar o tronco, deixar os ombros caírem para frente.","Carga moderada se tiver dor na lombar; evite em crise de dor.","Antebraço (pegada), trapézio, abdômen e estabilizadores do tronco"],
"Extensão de punho com elástico":["Sentado, antebraço apoiado, elástico preso sob o pé e na mão com a palma para baixo.","Estenda o punho para cima contra o elástico e volte devagar.","Movimento rápido, elástico forte demais.","Carga leve; ajuda na saúde do punho e cotovelo.","Extensores do antebraço"],
"Puxada frontal no pulley":["Sente com as coxas presas no apoio, pegada um pouco mais larga que os ombros, peito alto.","Puxe a barra até a parte de cima do peito levando os cotovelos para baixo e para trás; volte devagar até esticar os braços.","Puxar atrás da nuca, jogar o tronco para trás, puxar só com os braços.","Mantenha o peito aberto; não force o pescoço.","Grande dorsal, redondo maior, bíceps e romboides"],
"Remada baixa na polia":["Sentado com os pés no apoio, joelhos levemente dobrados, coluna reta e peito aberto.","Puxe o triângulo até o abdômen levando os cotovelos para trás e unindo as escápulas; volte devagar.","Balançar o tronco para frente e para trás, arredondar as costas.","Com apoio, protege a lombar.","Dorsais, romboides, trapézio médio e bíceps"],
"Remada unilateral com halter":["Apoie a mão e o joelho do mesmo lado no banco, costas retas e paralelas ao chão, halter na outra mão.","Puxe o halter em direção ao quadril com o cotovelo perto do corpo e desça devagar.","Girar o tronco, puxar com o braço em vez das costas.","O apoio no banco protege a lombar.","Grande dorsal, romboides e bíceps"],
"Pulldown braço reto na polia":["De frente para a polia alta, barra ou corda nas mãos, braços estendidos e tronco levemente inclinado.","Leve a barra para baixo até as coxas em arco, com os braços quase retos, e volte devagar.","Dobrar os cotovelos, usar o tronco para empurrar.","Carga moderada, foco na contração das costas.","Grande dorsal e redondo maior"],
"Remada curvada com barra":["Pés na largura do quadril, joelhos levemente dobrados, tronco inclinado à frente com a coluna reta.","Puxe a barra até o abdômen unindo as escápulas e desça controlando.","Arredondar a lombar, levantar o tronco a cada repetição.","Exige bastante da lombar; evite se tiver dor nas costas.","Dorsais, romboides, trapézio, lombar e bíceps"],
"Remada no Smith":["Tronco inclinado à frente com coluna reta, barra do Smith na altura dos joelhos.","Puxe a barra até o abdômen e desça controlando.","Arredondar as costas, usar impulso.","Evite se tiver dor na lombar.","Dorsais, romboides e bíceps"],
"Remada com elástico":["Sentado com as pernas estendidas, elástico passando pelos pés, coluna reta.","Puxe as pontas do elástico até o abdômen unindo as escápulas e volte devagar.","Curvar as costas, deixar o elástico voltar rápido.","Carga leve e segura para as articulações.","Dorsais, romboides e bíceps"],
"Barra fixa":["Pendure-se na barra com pegada um pouco mais larga que os ombros, abdômen firme.","Puxe o corpo até o queixo passar a barra e desça devagar até esticar os braços.","Balançar o corpo, não descer por completo.","Use elástico ou máquina de apoio se ainda não consegue; evite com dor no ombro.","Grande dorsal, bíceps e romboides"],
"Rosca alternada com halteres":["Em pé, halteres ao lado do corpo, palmas para frente, cotovelos colados ao tronco.","Flexione um cotovelo de cada vez subindo o halter até o ombro e desça devagar.","Balançar o tronco, adiantar o cotovelo.","Controle a descida para proteger o cotovelo.","Bíceps e braquial"],
"Rosca na polia":["De frente para a polia baixa, barra nas mãos com palmas para cima, cotovelos ao lado do corpo.","Flexione os cotovelos trazendo a barra até o peito e desça devagar.","Usar o tronco para ajudar, mexer os cotovelos.","Tensão constante, gentil com as articulações.","Bíceps e braquial"],
"Rosca martelo com halteres":["Em pé, halteres ao lado do corpo com as palmas viradas para o corpo.","Flexione os cotovelos mantendo a pegada neutra e desça devagar.","Balançar o corpo, girar o punho.","Pegada neutra costuma ser confortável para punho e cotovelo.","Braquiorradial, braquial e bíceps"],
"Rosca concentrada":["Sentado, cotovelo apoiado na parte interna da coxa, halter na mão.","Flexione o cotovelo levando o halter ao ombro e desça devagar até quase esticar.","Mexer o ombro, descer rápido.","Carga moderada, foco na contração.","Bíceps"],
"Rosca direta com barra":["Em pé, barra com pegada na largura dos ombros, palmas para cima, cotovelos ao lado do corpo.","Flexione os cotovelos subindo a barra até o peito e desça devagar.","Jogar o tronco para trás, adiantar os cotovelos.","Se o punho incomodar, use barra W ou halteres.","Bíceps e braquial"],
"Rosca com elástico":["Pise no meio do elástico e segure as pontas com as palmas para cima.","Flexione os cotovelos contra a resistência e volte devagar.","Deixar o elástico voltar rápido.","Carga leve e progressiva.","Bíceps"],
"Rosca scott com halter":["Sente no banco scott com o braço apoiado na almofada, halter na mão.","Flexione o cotovelo até o ombro e desça controlando sem esticar totalmente.","Esticar o cotovelo por completo no final, carga alta demais.","Força o cotovelo; evite se tiver dor nele.","Bíceps"],
"Desenvolvimento com halteres":["Sentado com as costas apoiadas, halteres na altura dos ombros com as palmas para frente.","Empurre os halteres para cima até quase estender os braços e desça até a altura das orelhas.","Arquear a lombar, bater os halteres no topo.","Evite se tiver dor no ombro.","Deltoides (principalmente anterior e médio) e tríceps"],
"Elevação lateral com halteres":["Em pé, halteres ao lado do corpo, cotovelos levemente dobrados, tronco levemente à frente.","Eleve os braços pelas laterais até a altura dos ombros e desça devagar.","Subir acima dos ombros, balançar o corpo, encolher os ombros.","Carga leve; pare se sentir pinçar o ombro.","Deltoide médio"],
"Crucifixo invertido com halteres":["Tronco inclinado à frente (ou deitado de bruços no banco inclinado), halteres pendurados.","Abra os braços para os lados até a altura dos ombros unindo as escápulas e desça devagar.","Usar impulso, carga alta demais.","Carga leve; ótimo para a postura.","Deltoide posterior, romboides e trapézio médio"],
"Elevação frontal com halteres":["Em pé, halteres à frente das coxas, palmas para baixo.","Eleve os braços à frente até a altura dos ombros e desça devagar.","Balançar o tronco, subir acima dos ombros.","Evite se tiver dor no ombro.","Deltoide anterior"],
"Desenvolvimento no Smith":["Sente no banco com encosto sob a barra do Smith, pegada um pouco mais larga que os ombros.","Empurre a barra para cima e desça até a altura do queixo.","Descer atrás da nuca, arquear a lombar.","Evite se tiver dor no ombro.","Deltoides e tríceps"],
"Elevação lateral na polia":["De lado para a polia baixa, segure a pegada com a mão do lado oposto.","Eleve o braço pela lateral até a altura do ombro e desça devagar.","Usar impulso do corpo, subir demais.","Tensão constante; use carga leve.","Deltoide médio"],
"Face pull na polia (carga leve)":["Polia alta com corda, segure as pontas com as palmas para dentro e dê um passo atrás.","Puxe a corda em direção ao rosto abrindo as mãos e levando os cotovelos para trás e para cima; volte devagar.","Carga pesada, puxar com o tronco.","Fortalece o manguito rotador e a postura; seguro com carga leve.","Deltoide posterior, manguito rotador, trapézio e romboides"],
"Rotação externa com elástico":["Elástico preso na altura do cotovelo, cotovelo a 90° colado ao corpo (uma toalha entre o braço e o corpo ajuda).","Gire o antebraço para fora mantendo o cotovelo parado e volte devagar.","Afastar o cotovelo do corpo, elástico forte demais.","Exercício de proteção do ombro; sempre leve e sem dor.","Manguito rotador (infraespinhal e redondo menor)"],
"Elevação lateral parcial leve (até 45°)":["Em pé, halteres bem leves ao lado do corpo.","Eleve os braços pelas laterais só até uns 45° e desça devagar.","Passar de 45°, usar carga pesada.","Amplitude curta e carga leve para não pinçar o ombro.","Deltoide médio"],
"Agachamento livre com barra":["Barra apoiada no trapézio (não no pescoço), pés na largura dos ombros, pontas levemente para fora.","Desça como se fosse sentar, joelhos acompanhando a direção dos pés e coluna neutra, até onde mantiver a postura; suba empurrando o chão.","Joelhos para dentro, arredondar a lombar, tirar os calcanhares do chão.","Use travas de segurança ou rack; evite com dor no joelho ou na lombar.","Quadríceps, glúteos, adutores e core"],
"Leg press 45°":["Costas e quadril bem apoiados, pés na plataforma na largura do quadril.","Destrave, desça a plataforma dobrando os joelhos até uns 90° e empurre de volta sem travar os joelhos.","Tirar o quadril do banco no fundo, travar os joelhos no final.","Sempre trave a máquina ao terminar.","Quadríceps e glúteos"],
"Cadeira extensora":["Ajuste o encosto para o joelho ficar alinhado com o eixo da máquina e o rolo sobre o tornozelo.","Estenda os joelhos até as pernas ficarem retas e desça devagar.","Chutar o peso, deixar bater na volta.","Pode incomodar o joelho; use carga moderada.","Quadríceps"],
"Agachamento búlgaro com halteres":["Um pé à frente e o pé de trás apoiado num banco, halteres nas mãos.","Desça o joelho de trás em direção ao chão mantendo o tronco ereto e suba empurrando o pé da frente.","Joelho da frente para dentro, passo curto demais.","Exige equilíbrio; comece sem carga. Evite com dor no joelho.","Quadríceps e glúteos"],
"Afundo (avanço) com halteres":["Em pé, halteres nas mãos, tronco ereto.","Dê um passo à frente e desça até os dois joelhos ficarem a uns 90°; volte à posição inicial.","Joelho da frente passando muito da ponta do pé ou indo para dentro.","Tem impacto; evite com dor no joelho.","Quadríceps e glúteos"],
"Agachamento no Smith":["Barra do Smith no trapézio, pés levemente à frente do corpo.","Desça controlando até onde mantiver a postura e suba empurrando o chão.","Pés muito para trás, arredondar a lombar.","Ajuste as travas de segurança; evite com dor no joelho ou na lombar.","Quadríceps e glúteos"],
"Leg press com amplitude parcial":["Como no leg press 45°, com os pés um pouco mais altos na plataforma.","Desça só até um ângulo confortável (sem dor) e empurre de volta.","Descer demais, travar os joelhos.","Amplitude reduzida poupa o joelho.","Quadríceps e glúteos"],
"Agachamento parcial no banco (box squat)":["Fique em frente a um banco, pés na largura dos ombros.","Desça devagar até encostar levemente no banco e suba sem se jogar.","Sentar com tudo no banco, joelhos para dentro.","Amplitude controlada, menos estresse no joelho.","Quadríceps e glúteos"],
"Isometria na parede (wall sit) em ângulo confortável":["Costas apoiadas na parede, pés afastados à frente.","Deslize até um ângulo confortável e segure pelo tempo indicado (20–45 s).","Descer demais, prender a respiração.","Fortalece sem impacto; pare se o joelho doer.","Quadríceps"],
"Agachamento com elástico":["Pise no elástico com os pés na largura dos ombros e segure as pontas na altura dos ombros.","Agache até onde for confortável e suba contra a resistência.","Joelhos para dentro, arredondar as costas.","Carga leve e progressiva.","Quadríceps e glúteos"],
"Panturrilha em pé no Smith":["Ponta dos pés num step sob a barra do Smith, barra no trapézio.","Suba na ponta dos pés o máximo possível e desça até alongar a panturrilha.","Dobrar os joelhos, fazer rápido.","Faça uma pausa no alto e embaixo.","Gastrocnêmio e sóleo"],
"Panturrilha no leg press":["No leg press, apoie só a ponta dos pés na parte de baixo da plataforma, joelhos quase estendidos.","Empurre a plataforma com a ponta dos pés e volte alongando.","Dobrar os joelhos, deixar o pé escorregar.","Não destrave a máquina com os pés só na ponta; mantenha as travas próximas.","Gastrocnêmio e sóleo"],
"Panturrilha sentado com halter":["Sentado, ponta dos pés num step, halter apoiado sobre as coxas perto dos joelhos.","Eleve os calcanhares o máximo possível e desça alongando.","Movimento curto, rápido demais.","Ênfase no sóleo.","Sóleo e gastrocnêmio"],
"Panturrilha em pé unilateral com halter":["Em pé num step com um pé, halter na mão do mesmo lado, a outra mão apoiada.","Suba na ponta do pé e desça alongando.","Perder o equilíbrio, fazer rápido.","Evite com dor no tornozelo.","Gastrocnêmio e sóleo"],
"Panturrilha no degrau (peso corporal)":["Ponta dos pés num degrau, mãos apoiadas numa parede.","Suba na ponta dos pés e desça até alongar.","Fazer rápido, dobrar os joelhos.","Evite com dor no tornozelo.","Gastrocnêmio e sóleo"],
"Panturrilha com elástico":["Sentado com as pernas estendidas, elástico na ponta dos pés.","Empurre a ponta dos pés contra o elástico e volte devagar.","Elástico forte demais.","Carga leve, boa para tornozelo sensível.","Gastrocnêmio e sóleo"],
"Mesa flexora":["Deite de bruços com os joelhos logo após a borda e o rolo acima dos calcanhares.","Flexione os joelhos levando o rolo em direção ao glúteo e desça devagar.","Tirar o quadril do banco, descer rápido.","Carga moderada e controle total.","Posteriores da coxa"],
"Stiff com halteres":["Em pé, halteres à frente das coxas, joelhos levemente dobrados.","Leve o quadril para trás descendo os halteres rente às pernas com a coluna reta até sentir o posterior alongar; suba contraindo o glúteo.","Arredondar a lombar, dobrar demais os joelhos.","Evite com dor na lombar.","Posteriores da coxa, glúteos e lombar"],
"Elevação pélvica no banco":["Parte de cima das costas apoiada no banco, pés no chão, carga sobre o quadril (opcional).","Suba o quadril até o tronco ficar alinhado com as coxas, contraia o glúteo e desça devagar.","Arquear a lombar no topo, empurrar com a ponta dos pés.","Glúteo forte estabiliza joelho e lombar.","Glúteo máximo e posteriores"],
"Glúteo na polia (coice)":["De frente para a polia baixa, tornozeleira presa no pé, mãos apoiadas.","Leve a perna para trás estendendo o quadril, contraia o glúteo e volte devagar.","Arquear a lombar, girar o quadril.","Carga moderada.","Glúteo máximo"],
"Levantamento terra romeno com barra":["Em pé, barra nas mãos à frente das coxas, joelhos levemente dobrados.","Leve o quadril para trás deslizando a barra rente às pernas até o meio da canela, coluna reta, e suba contraindo o glúteo.","Arredondar a lombar, afastar a barra do corpo.","Exige bastante da lombar; evite com dor nas costas.","Posteriores da coxa, glúteos e lombar"],
"Afundo reverso com halteres":["Em pé, halteres nas mãos.","Dê um passo para trás e desça até os joelhos ficarem a uns 90°; volte à posição inicial.","Tronco caindo para frente, joelho para dentro.","Mais gentil com o joelho que o afundo à frente, mas evite se doer.","Glúteos, posteriores e quadríceps"],
"Ponte de glúteo no colchonete":["Deitado de barriga para cima, joelhos dobrados e pés no chão.","Suba o quadril contraindo o glúteo e desça devagar.","Arquear a lombar, empurrar com a ponta dos pés.","Sem carga na coluna nem no joelho.","Glúteo máximo e posteriores"],
"Abdução de quadril com elástico":["Elástico acima dos joelhos, em pé ou deitado de lado.","Afaste a perna (ou os joelhos) contra o elástico e volte devagar.","Girar o quadril, usar impulso.","Fortalece o glúteo médio e estabiliza o joelho.","Glúteo médio e mínimo"],
"Flexão de joelho com elástico":["Deitado de bruços, elástico preso num ponto fixo e no tornozelo.","Flexione o joelho levando o pé em direção ao glúteo e volte devagar.","Tirar o quadril do chão, voltar rápido.","Carga leve e segura.","Posteriores da coxa"],
"Caminhada (esteira ou ao ar livre)":["Tênis confortável, postura ereta e olhar à frente.","Caminhe num ritmo em que dê para conversar, balançando os braços naturalmente.","Começar rápido demais, olhar para baixo.","Siga sempre a orientação médica; pare se sentir dor no peito, falta de ar ou tontura.","Pernas, coração e pulmões"],
"Agachamento sumô com halter":["Pés mais abertos que os ombros, pontas viradas para fora, um halter entre as pernas.","Desça empurrando os joelhos para fora até as coxas quase paralelas e suba contraindo o glúteo.","Joelhos fechando, tronco caindo à frente.","Amplitude confortável; pare se o joelho doer.","Glúteo máximo, adutores e quadríceps"],
"Prancha abdominal":["Apoie antebraços e pontas dos pés no chão, corpo reto da cabeça aos calcanhares.","Segure a posição pelo tempo da série, abdômen firme e sem prender o ar.","Deixar o quadril cair ou subir demais, prender a respiração.","Se a lombar doer, apoie os joelhos.","Abdômen, transverso e estabilizadores do tronco"],
"Abdominal crunch no colchonete":["Deitado de barriga para cima, joelhos dobrados, mãos leves ao lado da cabeça.","Eleve só as escápulas do chão contraindo o abdômen e desça devagar.","Puxar o pescoço com as mãos, tirar a lombar inteira do chão.","Movimento curto e controlado.","Reto abdominal"],
"Elevação de pernas deitado":["Deitado de barriga para cima, mãos ao lado do corpo, lombar apoiada no chão.","Suba as pernas estendidas até 90° e desça devagar sem tirar a lombar do chão.","Arquear a lombar, descer rápido.","Se a lombar descolar, dobre um pouco os joelhos.","Abdômen inferior e flexores do quadril"],
"Abdominal na polia":["Ajoelhado de frente para a polia alta, corda ao lado da cabeça, quadril levemente flexionado.","Enrole o tronco para baixo contraindo o abdômen e volte devagar.","Puxar com os braços, sentar no calcanhar usando o peso do corpo.","Carga moderada.","Reto abdominal"],
"Dead bug (abdominal deitado)":["Deitado, braços para o teto, quadris e joelhos a 90°, lombar colada no chão.","Estenda um braço e a perna oposta sem tirar a lombar do chão e volte; alterne os lados.","Arquear a lombar, prender o ar.","Movimento lento.","Abdômen profundo e estabilidade do tronco"],
"Caminhada ou trote leve na esteira":["Esteira parada, suba com segurança e comece devagar, postura ereta.","Caminhe ou trote num ritmo em que ainda dê para falar frases curtas.","Segurar no painel o tempo todo, olhar para baixo.","Use a trava de segurança. Pare se sentir dor no peito ou tontura.","Pernas, coração e pulmões"],
"Bicicleta ergométrica":["Ajuste o banco para o joelho ficar levemente dobrado no ponto mais baixo do pedal.","Pedale em ritmo constante, sem travar o joelho.","Banco alto ou baixo demais, carga pesada logo no começo.","Boa opção quando o impacto da corrida incomoda.","Quadríceps, glúteos e condicionamento"],
"Supino inclinado com barra":["Banco inclinado a 30 a 45°, olhos sob a barra, pegada um pouco mais larga que os ombros, escápulas encaixadas, pés firmes.","Tire a barra do suporte, desça controlando até a parte de cima do peito e empurre de volta.","Inclinar demais o banco, quicar a barra, tirar o quadril do banco.","Use spotter ou travas de segurança em cargas altas.","Peitoral superior, ombro anterior e tríceps"],
"Supino inclinado no Smith":["Banco inclinado a 30 a 45° centralizado para a barra descer na parte de cima do peito; ajuste as travas.","Destrave a barra, desça controlando até o peito e empurre de volta.","Banco mal posicionado, descer rápido, esquecer de travar.","Travas um pouco acima do peito para segurança.","Peitoral superior, ombro anterior e tríceps"],
"Supino declinado com barra":["Deite no banco declinado com as pernas presas, pegada um pouco mais larga que os ombros, escápulas encaixadas.","Desça a barra controlando até a parte de baixo do peito e empurre de volta.","Quicar a barra, cotovelos muito abertos, tirar a barra sem ajuda.","Use sempre spotter; não indicado para quem tem pressão alta ou tontura.","Peitoral inferior, tríceps e ombro anterior"],
"Supino declinado com halteres":["Deite no banco declinado com as pernas presas, um halter em cada mão na altura do peito baixo.","Empurre os halteres para cima aproximando-os no topo e desça devagar até a linha do peito.","Descer demais, bater os halteres, perder o controle.","Peça ajuda para posicionar e retirar os halteres.","Peitoral inferior, tríceps e ombro anterior"],
"Supino inclinado na máquina":["Ajuste o banco para as manoplas ficarem na linha da parte de cima do peito; costas apoiadas e pés no chão.","Empurre as manoplas até quase estender os braços e volte devagar até sentir o peito alongar.","Desencostar as costas, travar os cotovelos, voltar deixando o peso bater.","Trajetória guiada; boa opção para iniciantes.","Peitoral superior, ombro anterior e tríceps"],
"Supino articulado pegada neutra":["Sente com as costas no encosto, pegadas neutras (palmas viradas uma para a outra) na altura do meio do peito.","Empurre à frente até quase estender os braços e volte controlando.","Tirar as costas do encosto, travar os cotovelos, fazer rápido.","Pegada neutra é mais confortável para o ombro.","Peitoral maior, ombro anterior e tríceps"],
"Voador (peck deck)":["Ajuste o banco para as pegadas ficarem na altura do peito, costas apoiadas, cotovelos levemente dobrados.","Feche os braços à frente do peito como num abraço, aperte 1 segundo e volte devagar até a linha dos ombros.","Abrir além da linha dos ombros, tirar as costas do encosto, usar impulso.","Carga moderada; pare antes de sentir o ombro.","Peitoral maior e ombro anterior"],
"Crucifixo inclinado com halteres":["Banco inclinado a 30°, halteres acima do peito com palmas viradas uma para a outra e cotovelos levemente dobrados.","Abra os braços em arco até a linha do peito e volte pelo mesmo caminho, como num abraço.","Descer demais, esticar totalmente os cotovelos, carga alta.","Amplitude confortável para o ombro.","Peitoral superior e ombro anterior"],
"Crossover polia baixa":["Polias na posição baixa, um passo à frente, tronco levemente inclinado, cotovelos levemente dobrados, palmas para frente.","Traga as mãos de baixo para cima até a altura do peito, juntando à frente; volte devagar.","Dobrar e esticar os cotovelos, usar o tronco, encolher os ombros.","Carga moderada; ótimo para a parte de cima do peito.","Peitoral superior e ombro anterior"],
"Crossover polia alta":["Polias na posição alta, um passo à frente, tronco levemente inclinado, cotovelos levemente dobrados.","Traga as mãos de cima para baixo até a frente do quadril, juntando-as; volte devagar abrindo os braços.","Usar o peso do corpo, dobrar demais os cotovelos, voltar rápido.","Carga moderada e movimento controlado.","Peitoral inferior e ombro anterior"],
"Flexão de braço inclinada (mãos no banco)":["Mãos na borda de um banco um pouco mais largas que os ombros, corpo reto da cabeça aos pés.","Desça o peito até perto do banco com cotovelos a 45° e empurre de volta.","Deixar o quadril cair, cotovelos muito abertos.","Versão mais fácil da flexão; boa para iniciantes.","Peitoral, ombro anterior e tríceps"],
"Flexão de braço declinada (pés elevados)":["Pés apoiados num banco, mãos no chão um pouco mais largas que os ombros, corpo reto.","Desça o peito em direção ao chão e empurre de volta mantendo o abdômen firme.","Quadril caindo, cabeça para frente, amplitude curta.","Mais difícil que a flexão normal; só para quem já faz bem a tradicional.","Peitoral superior, ombro anterior e tríceps"],
"Mergulho nas paralelas (peito)":["Apoie-se nas paralelas com braços estendidos, tronco levemente inclinado à frente e pernas cruzadas.","Desça dobrando os cotovelos até cerca de 90° e empurre de volta.","Descer demais, ombros subindo para a orelha, balançar.","Força o ombro; use a máquina de mergulho assistido ou evite se tiver dor.","Peitoral inferior, tríceps e ombro anterior"],
"Supino reto com halteres pegada neutra":["Deite no banco reto, halteres na altura do peito com palmas viradas uma para a outra, escápulas encaixadas.","Empurre os halteres para cima até quase estender e desça devagar com os cotovelos perto do corpo.","Bater os halteres, tirar o quadril do banco, descer rápido.","Pegada neutra é mais gentil para o ombro.","Peitoral maior, tríceps e ombro anterior"],
"Puxada frontal pegada neutra no pulley":["Sente com as coxas presas no apoio, triângulo ou barra de pegada neutra nas mãos (palmas viradas uma para a outra), peito alto.","Puxe até a parte de cima do peito levando os cotovelos para baixo, perto do corpo; volte devagar até esticar os braços.","Jogar o tronco para trás, encolher os ombros, puxar só com os braços.","Pegada mais confortável para ombro e punho; boa para iniciantes.","Grande dorsal, redondo maior, bíceps e braquial"],
"Puxada frontal pegada supinada no pulley":["Sente com as coxas presas no apoio, barra com as palmas viradas para você na largura dos ombros, peito alto.","Puxe a barra até a parte de cima do peito levando os cotovelos para baixo e para trás; volte devagar.","Jogar o tronco para trás, abrir demais os cotovelos, soltar o peso na volta.","Cuidado com o punho; reduza a carga se incomodar.","Grande dorsal (parte de baixo), bíceps e romboides"],
"Puxada frontal pegada aberta no pulley":["Sente com as coxas presas no apoio, barra longa com pegada bem mais larga que os ombros, palmas para frente.","Puxe a barra até a parte de cima do peito com os cotovelos descendo para os lados; volte devagar até esticar os braços.","Pegada larga demais, puxar atrás da nuca, balançar o tronco.","Não exagere na abertura se sentir o ombro.","Grande dorsal (porção lateral), redondo maior, romboides e bíceps"],
"Puxada unilateral na polia alta":["Ajoelhado ou sentado de frente para a polia alta, pegador de uma mão, braço estendido acima da cabeça, tronco firme.","Puxe o pegador em direção ao lado do peito levando o cotovelo para baixo, perto do corpo; volte devagar até esticar.","Girar o tronco, puxar com o bíceps, encolher o ombro.","Carga moderada; foque em sentir a lateral das costas trabalhar.","Grande dorsal, redondo maior e bíceps"],
"Pulldown com corda na polia":["De frente para a polia alta, corda nas mãos, braços quase estendidos, quadril para trás e tronco levemente inclinado.","Leve a corda para baixo em arco até perto das coxas, abrindo as pontas no final, e volte devagar com os braços quase retos.","Dobrar os cotovelos, usar o tronco, subir rápido.","Carga moderada; mantenha o abdômen firme.","Grande dorsal e redondo maior"],
"Barra fixa pegada supinada":["Pendure-se na barra com as palmas viradas para você na largura dos ombros, braços estendidos e abdômen firme.","Puxe o corpo até o queixo passar da barra levando os cotovelos para baixo; desça devagar até esticar os braços.","Balançar o corpo (kipping), subir só até a metade, descer soltando.","Exige força; use o graviton ou elástico de assistência se precisar.","Grande dorsal, bíceps e romboides"],
"Barra fixa pegada neutra":["Pendure-se nas pegadas paralelas da barra (palmas viradas uma para a outra), braços estendidos e abdômen firme.","Puxe o corpo até o queixo chegar à altura das mãos e desça devagar até esticar os braços.","Balançar as pernas, encolher os ombros, encurtar a descida.","Pegada mais gentil para ombros; use assistência se necessário.","Grande dorsal, braquial, bíceps e romboides"],
"Barra fixa no graviton (assistida)":["Ajuste o contrapeso do graviton, apoie os joelhos na plataforma e segure as pegadas acima da cabeça.","Puxe o corpo até o queixo passar das mãos e desça devagar até esticar os braços.","Descer rápido deixando a plataforma bater, encolher os ombros.","Quanto maior o contrapeso, mais fácil; ótima para aprender a barra fixa.","Grande dorsal, bíceps e romboides"],
"Remada baixa pegada aberta na polia":["Sentado com os pés no apoio, joelhos levemente dobrados, barra reta com pegada aberta e palmas para baixo, coluna reta.","Puxe a barra até a altura do peito baixo, cotovelos abertos para os lados, unindo as escápulas; volte devagar.","Balançar o tronco, arredondar as costas, encolher os ombros.","Com apoio dos pés e tronco firme, protege a lombar.","Romboides, trapézio médio, deltoide posterior e dorsais"],
"Remada baixa pegada supinada na polia":["Sentado com os pés no apoio, barra reta com palmas para cima na largura dos ombros, coluna reta e peito aberto.","Puxe a barra até o umbigo com os cotovelos perto do corpo, unindo as escápulas; volte devagar.","Inclinar o tronco para trás a cada repetição, puxar com o bíceps.","Reduza a carga se o punho incomodar.","Grande dorsal (parte de baixo), bíceps e romboides"],
"Remada unilateral na polia":["Sentado ou em pé de frente para a polia na altura do peito, pegador de uma mão, braço estendido e tronco firme.","Puxe o pegador até o lado do abdômen levando o cotovelo para trás; volte devagar sentindo as costas alongarem.","Girar o tronco para puxar, encolher o ombro.","Corrige diferença de força entre os lados.","Grande dorsal, romboides e bíceps"],
"Remada na máquina pegada neutra":["Ajuste o banco para as pegadas ficarem na altura do peito, peito apoiado na almofada, pegadas neutras nas mãos.","Puxe as pegadas levando os cotovelos para trás e unindo as escápulas; volte devagar até esticar os braços.","Desencostar o peito do apoio, encolher os ombros, voltar soltando.","O apoio no peito protege a lombar; boa para iniciantes.","Dorsais, romboides, trapézio médio e bíceps"],
"Remada articulada (máquina)":["Sente com o peito no apoio e os pés firmes, segure as pegadas da máquina com os braços estendidos.","Puxe levando os cotovelos para trás até as mãos ficarem ao lado do corpo e volte devagar.","Tirar o peito do apoio, usar impulso, amplitude curta.","Trajetória guiada; permite treinar um lado de cada vez.","Dorsais, romboides, trapézio e bíceps"],
"Remada cavalinho (T-bar)":["Em pé sobre a plataforma ou com a barra presa no canto, joelhos levemente dobrados, tronco inclinado à frente com coluna reta, triângulo na barra.","Puxe a barra até o abdômen unindo as escápulas e desça controlando, sem mudar a inclinação do tronco.","Arredondar a lombar, levantar o tronco para puxar, carga excessiva.","Exige lombar; prefira a versão com apoio no peito se tiver dor nas costas.","Dorsais, romboides, trapézio, lombar e bíceps"],
"Remada cavalinho na máquina com apoio":["Deite com o peito na almofada da máquina, pés firmes, segure as pegadas com braços estendidos.","Puxe levando os cotovelos para trás até a altura do tronco e volte devagar.","Tirar o peito do apoio, encolher os ombros.","O apoio no peito tira a carga da lombar.","Dorsais, romboides, trapézio e bíceps"],
"Remada curvada pegada supinada":["Pés na largura do quadril, joelhos levemente dobrados, tronco inclinado à frente com coluna reta, barra com palmas para cima.","Puxe a barra até o umbigo com os cotovelos perto do corpo, unindo as escápulas; desça controlando.","Arredondar a lombar, levantar o tronco a cada repetição, usar impulso.","Exige bastante da lombar; evite se tiver dor nas costas.","Grande dorsal, romboides, bíceps e lombar"],
"Remada curvada com halteres":["Pés na largura do quadril, joelhos levemente dobrados, tronco inclinado à frente com coluna reta, halteres pendurados com palmas viradas uma para a outra.","Puxe os halteres em direção ao quadril unindo as escápulas e desça devagar.","Arredondar as costas, levantar o tronco, puxar só com os braços.","Mantenha o abdômen firme; evite se tiver dor lombar.","Dorsais, romboides, trapézio e bíceps"],
"Remada com halteres no banco inclinado":["Deite de bruços no banco inclinado a 30 a 45°, halteres pendurados abaixo dos ombros, pés firmes no chão.","Puxe os halteres levando os cotovelos para trás e unindo as escápulas; desça devagar até esticar os braços.","Tirar o peito do banco, encolher os ombros, puxar rápido.","O banco apoia o tronco e protege a lombar.","Romboides, trapézio médio, dorsais e deltoide posterior"],
"Serrote com halter":["Em pé ao lado do banco, uma mão apoiada nele, pés afastados, tronco inclinado à frente com coluna reta, halter na outra mão.","Puxe o halter em direção ao quadril num arco, cotovelo perto do corpo, e desça devagar alongando as costas.","Girar o tronco, arredondar as costas, encolher o ombro.","Apoio na mão protege a lombar.","Grande dorsal, romboides e bíceps"],
"Hiperextensão lombar no banco romano":["Ajuste o apoio na altura do quadril, pés presos, corpo reto e braços cruzados no peito.","Desça o tronco dobrando no quadril com a coluna reta e suba até o corpo ficar em linha reta, sem passar disso.","Subir além da linha do corpo (hiperestender), fazer rápido, arredondar as costas.","Sem carga no início; evite em crise de dor lombar.","Lombar (eretores da espinha), glúteo e posterior de coxa"],
"Encolhimento com halteres":["Em pé, um halter em cada mão ao lado do corpo, braços estendidos, postura ereta.","Suba os ombros em direção às orelhas, segure 1 segundo e desça devagar.","Girar os ombros, dobrar os cotovelos, jogar a cabeça para frente.","Movimento só para cima e para baixo; evite se tiver dor no pescoço.","Trapézio superior"],
"Desenvolvimento Arnold":["Sentado com as costas apoiadas, halteres à frente do rosto com as palmas viradas para você e cotovelos dobrados.","Empurre os halteres para cima girando as palmas para frente durante a subida; desça fazendo o caminho inverso.","Arquear a lombar, girar rápido, bater os halteres no topo.","Carga moderada; evite se tiver dor no ombro.","Deltoide anterior e lateral, tríceps"],
"Desenvolvimento na máquina":["Ajuste o banco para as pegadas ficarem na altura dos ombros, costas apoiadas e pés firmes.","Empurre as pegadas para cima até quase estender os braços e desça devagar até a altura das orelhas.","Desencostar as costas, travar os cotovelos, descer rápido.","Trajetória guiada; mais segura para iniciantes.","Deltoide anterior e lateral, tríceps"],
"Desenvolvimento com barra sentado":["Sentado no banco a 90° com as costas apoiadas, barra à frente na altura do queixo, pegada um pouco mais larga que os ombros.","Empurre a barra para cima até quase estender os braços e desça controlando até a altura do queixo.","Descer atrás da nuca, arquear a lombar, usar impulso das pernas.","Sempre pela frente; evite se tiver dor no ombro.","Deltoide anterior e lateral, tríceps e trapézio"],
"Desenvolvimento com halteres em pé":["Em pé, pés na largura do quadril, halteres na altura dos ombros, abdômen e glúteo contraídos.","Empurre os halteres para cima até quase estender os braços e desça devagar até os ombros.","Arquear a lombar, usar impulso das pernas.","Carga moderada; prefira sentado se tiver dor lombar.","Deltoide anterior e lateral, tríceps e abdômen"],
"Elevação lateral na máquina":["Sente com o peito ou as costas no apoio, braços ao lado do corpo com as almofadas encostadas na parte de fora dos braços.","Eleve os braços para os lados até a altura dos ombros e desça devagar.","Subir acima dos ombros, encolher os ombros, usar impulso.","Carga leve a moderada.","Deltoide lateral"],
"Elevação lateral unilateral na polia":["Em pé de lado para a polia baixa, pegador na mão do lado oposto à polia, cabo passando à frente do corpo.","Eleve o braço para o lado até a altura do ombro com o cotovelo levemente dobrado e desça devagar.","Inclinar o tronco, subir acima do ombro, encolher o ombro.","Carga leve; tensão constante com menos carga articular.","Deltoide lateral"],
"Elevação lateral sentado com halteres":["Sentado na ponta do banco, halteres ao lado do corpo, coluna reta e cotovelos levemente dobrados.","Eleve os braços para os lados até a altura dos ombros e desça devagar.","Balançar o tronco, subir acima dos ombros, encolher os ombros.","Sentado evita o impulso; use carga leve.","Deltoide lateral"],
"Elevação frontal na polia com corda":["De costas para a polia baixa, corda passando entre as pernas, braços estendidos à frente das coxas.","Eleve a corda à frente até a altura dos ombros com os cotovelos levemente dobrados e desça devagar.","Balançar o tronco, subir acima dos ombros, arquear a lombar.","Carga leve; o deltoide anterior já trabalha bastante no peito.","Deltoide anterior"],
"Elevação frontal com anilha":["Em pé, anilha segurada com as duas mãos nas laterais, braços estendidos à frente das coxas.","Eleve a anilha à frente até a altura dos ombros e desça devagar.","Usar o impulso do corpo, subir acima da cabeça, arquear a lombar.","Anilha leve; mantenha o abdômen firme.","Deltoide anterior"],
"Crucifixo invertido no peck deck":["Sente de frente para o encosto do voador, peito apoiado, pegadas na altura dos ombros com braços estendidos à frente.","Abra os braços para trás até a linha do corpo e volte devagar.","Encolher os ombros, dobrar muito os cotovelos, usar impulso.","Carga leve a moderada.","Deltoide posterior, romboides e trapézio médio"],
"Crucifixo invertido na polia":["Entre as polias na altura dos ombros, cabos cruzados (mão direita no cabo da esquerda e vice-versa), braços à frente.","Abra os braços para os lados e para trás até a linha do corpo e volte devagar.","Encolher os ombros, inclinar o tronco, dobrar muito os cotovelos.","Carga leve; foque na parte de trás do ombro.","Deltoide posterior, romboides e trapézio médio"],
"Remada alta na polia (pegada aberta)":["Em pé de frente para a polia baixa, barra reta com pegada mais larga que os ombros, braços estendidos.","Puxe a barra até a altura do peito baixo levando os cotovelos para os lados, sem passar a altura dos ombros; desça devagar.","Pegada fechada, puxar até o queixo, cotovelos acima dos ombros.","Pegada aberta e amplitude limitada reduzem o risco de pinçamento; evite se tiver dor no ombro.","Deltoide lateral e trapézio"],
"Rotação externa na polia":["De lado para a polia na altura do cotovelo, pegador na mão de fora, cotovelo colado ao corpo a 90°, uma toalha entre braço e tronco.","Gire o antebraço para fora mantendo o cotovelo colado e volte devagar.","Desgrudar o cotovelo, carga alta, girar o tronco.","Carga bem leve; fortalece o manguito rotador.","Manguito rotador (infraespinhal e redondo menor)"],
"Rosca direta com barra W":["Em pé, barra W com pegada nas curvas, cotovelos ao lado do corpo, ombros para trás.","Flexione os cotovelos trazendo a barra até a altura do peito e desça devagar até quase esticar.","Balançar o tronco, adiantar os cotovelos, soltar a descida.","A barra W alivia o punho em comparação à reta.","Bíceps e braquial"],
"Rosca simultânea com halteres":["Em pé, um halter em cada mão ao lado do corpo, palmas para frente, cotovelos colados ao tronco.","Flexione os dois cotovelos ao mesmo tempo subindo os halteres e desça devagar.","Balançar o tronco, adiantar os cotovelos, descer rápido.","Carga que permita fazer sem balanço.","Bíceps e braquial"],
"Rosca scott com barra W":["Sente no banco scott com a parte de trás dos braços apoiada na almofada, barra W nas mãos, braços quase estendidos.","Flexione os cotovelos subindo a barra até perto dos ombros e desça devagar sem esticar totalmente.","Descer rápido e esticar de vez, tirar os braços do apoio.","Controle a descida para proteger o cotovelo.","Bíceps e braquial"],
"Rosca scott na máquina":["Ajuste o banco para os braços ficarem apoiados na almofada, pegadas nas mãos com palmas para cima.","Flexione os cotovelos subindo as pegadas e desça devagar até quase esticar.","Tirar os braços do apoio, descer rápido.","Trajetória guiada e segura.","Bíceps e braquial"],
"Rosca inclinada com halteres":["Sentado no banco inclinado a 45 a 60°, costas apoiadas, halteres pendurados ao lado do corpo, palmas para frente.","Flexione os cotovelos subindo os halteres sem mover os ombros e desça devagar até esticar.","Levar os cotovelos para frente, tirar as costas do banco.","Carga leve; alonga bastante o bíceps.","Bíceps (porção longa)"],
"Rosca martelo na polia com corda":["De frente para a polia baixa, corda nas mãos com as palmas viradas uma para a outra, cotovelos colados ao corpo.","Flexione os cotovelos trazendo a corda até perto dos ombros e desça devagar.","Balançar o tronco, adiantar os cotovelos.","Pegada neutra é gentil com o punho.","Braquial, braquiorradial e bíceps"],
"Rosca martelo cruzada":["Em pé, halteres ao lado do corpo com palmas viradas para o corpo.","Suba um halter cruzando à frente do peito em direção ao ombro oposto e desça devagar; alterne.","Balançar o tronco, girar o ombro.","Carga moderada.","Braquial, braquiorradial e bíceps"],
"Rosca na polia com barra reta":["De frente para a polia baixa, barra reta nas mãos com palmas para cima, cotovelos colados ao corpo.","Flexione os cotovelos subindo a barra até o peito e desça devagar.","Balançar o tronco, adiantar os cotovelos.","Reduza a carga se o punho incomodar; troque pela barra W.","Bíceps e braquial"],
"Rosca bayesiana na polia":["De costas para a polia baixa, pegador numa mão, um passo à frente, braço estendido levemente atrás do corpo.","Flexione o cotovelo subindo o pegador à frente, sem levar o cotovelo para frente, e desça devagar.","Mexer o ombro, girar o tronco.","Carga leve; trabalha o bíceps alongado.","Bíceps (porção longa)"],
"Rosca 21":["Em pé, barra com palmas para cima, cotovelos ao lado do corpo.","Faça 7 repetições da metade de baixo, 7 da metade de cima e 7 completas, sem descanso.","Balançar o tronco, perder o controle nas últimas.","Use carga menor que na rosca normal.","Bíceps e braquial"],
"Rosca com elástico unilateral":["Pise numa ponta do elástico e segure a outra com a palma para cima, cotovelo colado ao corpo.","Flexione o cotovelo subindo a mão até o ombro e volte devagar resistindo ao elástico.","Deixar o elástico puxar rápido, mexer o cotovelo.","Carga leve; ótimo para treinar em casa.","Bíceps"],
"Tríceps na polia com barra reta":["De frente para a polia alta, barra reta com palmas para baixo, cotovelos colados ao lado do corpo.","Estenda os cotovelos levando a barra até as coxas e volte devagar até 90°.","Mexer os cotovelos, usar o peso do corpo, encolher os ombros.","Baixo estresse no cotovelo.","Tríceps"],
"Tríceps na polia com barra V":["De frente para a polia alta, barra V nas mãos, cotovelos colados ao corpo, tronco levemente inclinado.","Estenda os cotovelos levando a barra para baixo e volte devagar.","Abrir os cotovelos, subir além de 90°.","Pegada confortável para o punho.","Tríceps"],
"Tríceps na polia pegada supinada":["De frente para a polia alta, barra reta com as palmas para cima, cotovelos colados ao corpo.","Estenda os cotovelos levando a barra para baixo e volte devagar.","Carga alta demais, abrir os cotovelos.","Carga menor que na pegada pronada.","Tríceps (porção medial)"],
"Tríceps unilateral na polia":["De frente para a polia alta, pegador numa mão, cotovelo colado ao corpo.","Estenda o cotovelo levando a mão até a coxa e volte devagar.","Girar o tronco, mexer o ombro.","Corrige diferenças entre os braços.","Tríceps"],
"Tríceps francês na polia com corda":["De costas para a polia baixa ou média, corda atrás da cabeça, um pé à frente, cotovelos apontando para frente.","Estenda os cotovelos levando a corda à frente e acima da cabeça e volte devagar.","Abrir os cotovelos, arquear a lombar.","Evite se tiver dor no ombro; comece leve.","Tríceps (porção longa)"],
"Tríceps testa com barra W":["Deitado no banco reto, barra W acima do peito com braços estendidos, pegada fechada nas curvas.","Dobre só os cotovelos descendo a barra até a testa ou um pouco atrás e estenda de volta.","Abrir os cotovelos, mexer os ombros, descer rápido.","Carga moderada e spotter se pesado; evite se o cotovelo doer.","Tríceps"],
"Tríceps francês com halter unilateral":["Sentado com as costas apoiadas, halter numa mão acima da cabeça, braço estendido.","Dobre o cotovelo descendo o halter atrás da cabeça e estenda de volta, cotovelo apontando para cima.","Abrir o cotovelo, arquear a lombar.","Comece leve; segure o cotovelo com a outra mão se ajudar.","Tríceps (porção longa)"],
"Tríceps na máquina":["Ajuste o banco para os cotovelos ficarem alinhados com o eixo da máquina, braços apoiados.","Estenda os cotovelos empurrando as pegadas e volte devagar.","Tirar os braços do apoio, voltar rápido.","Trajetória guiada; boa para iniciantes.","Tríceps"],
"Mergulho nas paralelas (tríceps)":["Apoie-se nas paralelas com braços estendidos, tronco reto e cotovelos apontando para trás.","Desça dobrando os cotovelos até cerca de 90° e empurre de volta.","Descer demais, abrir os cotovelos, ombros subindo.","Força o ombro; prefira o mergulho assistido na máquina.","Tríceps, peitoral e ombro anterior"],
"Flexão de braço fechada (diamante)":["Mãos no chão juntas sob o peito (ou na largura dos ombros), corpo reto, joelhos apoiados se precisar.","Desça o peito com os cotovelos perto do corpo e empurre de volta.","Quadril caindo, cotovelos abertos.","Se o punho incomodar, afaste um pouco as mãos.","Tríceps, peitoral e ombro anterior"],
"Tríceps coice na polia":["De frente para a polia baixa, tronco inclinado à frente, pegador numa mão, braço colado ao corpo com cotovelo a 90°.","Estenda o cotovelo levando a mão para trás até o braço ficar reto e volte devagar.","Balançar o braço, deixar o cotovelo cair.","Carga leve; foque em contrair no final.","Tríceps"],
"Rosca punho na polia":["Sentado de frente para a polia baixa, antebraços apoiados nas coxas ou no banco, barra com palmas para cima e punhos para fora do apoio.","Flexione os punhos subindo a barra e desça devagar até alongar.","Mexer os antebraços, usar impulso.","Carga leve; evite se tiver dor no punho.","Flexores do antebraço"],
"Rolo de punho (wrist roller)":["Em pé, braços estendidos à frente na altura dos ombros segurando o rolo, com o peso pendurado pela corda.","Gire o rolo alternando as mãos até enrolar toda a corda e desenrole devagar.","Abaixar os braços, encolher os ombros, girar com o corpo.","Peso leve; dobre os cotovelos se o ombro cansar.","Flexores e extensores do antebraço"],
"Pegada de pinça com anilhas":["Em pé, segure duas anilhas lisas juntas pela borda, só com os dedos e o polegar, braços estendidos ao lado do corpo.","Segure firme pelo tempo indicado (20 a 40 s) e solte com cuidado.","Encolher os ombros, curvar o tronco.","Anilhas leves; sem movimento do punho.","Músculos da mão e flexores do antebraço"],
"Pendurar na barra (dead hang)":["Segure a barra fixa com as palmas para frente e deixe o corpo pendurado com os pés fora do chão.","Fique pendurado pelo tempo indicado mantendo os ombros levemente ativos.","Relaxar totalmente os ombros, balançar.","Comece com 15 a 20 s; evite se tiver dor no ombro.","Antebraço (pegada), dorsais e ombros"],
"Agachamento goblet (taça) com halter":["Em pé, pés um pouco mais largos que o quadril, segure um halter na vertical junto ao peito.","Desça sentando entre as pernas com o peito alto até onde for confortável e suba empurrando o chão.","Joelhos caindo para dentro, calcanhares saindo do chão, arredondar as costas.","Ótimo para aprender o agachamento; carga moderada.","Quadríceps, glúteos e abdômen"],
"Agachamento livre com peso corporal":["Em pé, pés na largura dos ombros, pontas levemente para fora, braços à frente.","Desça levando o quadril para trás e para baixo, peito alto, e suba empurrando o chão.","Joelhos caindo para dentro, calcanhares saindo do chão.","Desça só até onde for confortável.","Quadríceps e glúteos"],
"Agachamento frontal com barra":["Barra apoiada na frente dos ombros, cotovelos altos, pés na largura dos ombros.","Desça mantendo o tronco bem ereto e os cotovelos altos; suba empurrando o chão.","Deixar os cotovelos caírem, inclinar o tronco, arredondar as costas.","Técnico; use rack com travas de segurança.","Quadríceps, glúteos e abdômen"],
"Hack machine":["Costas e ombros apoiados na máquina, pés no meio da plataforma na largura do quadril.","Destrave, desça dobrando os joelhos até cerca de 90° e suba empurrando a plataforma.","Tirar o quadril do encosto, joelhos para dentro, travar os joelhos no topo.","Trave a máquina ao terminar.","Quadríceps e glúteos"],
"Leg press horizontal":["Sente com as costas apoiadas, pés na plataforma na largura do quadril.","Empurre a plataforma até quase estender os joelhos e volte devagar até cerca de 90°.","Travar os joelhos, tirar o quadril do banco, joelhos para dentro.","Mais leve para a lombar; boa para iniciantes.","Quadríceps e glúteos"],
"Leg press 45° unilateral":["Costas apoiadas, um pé no meio da plataforma, o outro apoiado fora.","Desça a plataforma dobrando o joelho até cerca de 90° e empurre de volta.","Joelho caindo para dentro, tirar o quadril do banco.","Use carga bem menor que no bilateral.","Quadríceps e glúteos"],
"Leg press 45° pés baixos":["Costas apoiadas, pés na parte de baixo da plataforma na largura do quadril.","Desça a plataforma até onde for confortável e empurre de volta sem travar os joelhos.","Calcanhar saindo da plataforma, quadril saindo do banco.","Dá mais ênfase ao quadríceps; evite se o joelho doer.","Quadríceps"],
"Cadeira extensora unilateral":["Sente com as costas apoiadas, joelho alinhado ao eixo da máquina, rolo na frente do tornozelo de uma perna.","Estenda o joelho até a perna ficar reta, segure 1 segundo e desça devagar.","Chutar o peso, tirar o quadril do banco.","Carga leve a moderada.","Quadríceps"],
"Agachamento sumô com barra":["Barra nas costas, pés bem afastados com pontas para fora.","Desça mantendo os joelhos na direção das pontas dos pés e suba empurrando o chão.","Joelhos para dentro, inclinar demais o tronco.","Use rack com travas.","Quadríceps, adutores e glúteos"],
"Passada (avanço caminhando) com halteres":["Em pé, halteres ao lado do corpo, postura ereta.","Dê um passo longo à frente, desça até os dois joelhos ficarem a cerca de 90° e passe para o próximo passo.","Joelho da frente para dentro, passo curto demais, tronco caindo para frente.","Espaço livre; evite se tiver dor no joelho.","Quadríceps, glúteos e posterior"],
"Afundo no Smith":["Barra do Smith nas costas, um pé à frente e o outro atrás, passada longa.","Desça até o joelho de trás quase tocar o chão e suba empurrando com a perna da frente.","Joelho da frente para dentro, tronco inclinado.","Guiado e mais estável que o livre.","Quadríceps e glúteos"],
"Subida no banco (step up) com halteres":["De frente para um banco ou caixote estável, halteres ao lado do corpo.","Pise com o pé inteiro no banco e suba empurrando com essa perna; desça devagar.","Empurrar com a perna de trás, joelho para dentro, banco alto demais.","Banco firme e na altura do joelho ou abaixo.","Quadríceps e glúteos"],
"Agachamento búlgaro no Smith":["Barra do Smith nas costas, pé de trás apoiado num banco, pé da frente afastado.","Desça até a coxa da frente ficar quase paralela ao chão e suba.","Pé da frente muito perto do banco, joelho para dentro.","Mais estável que com halteres.","Quadríceps e glúteos"],
"Cadeira adutora":["Sente com as costas apoiadas, almofadas na parte de dentro dos joelhos, pernas abertas.","Feche as pernas até as almofadas se encontrarem e volte devagar.","Abrir demais, usar impulso.","Amplitude confortável para a virilha.","Adutores (parte interna da coxa)"],
"Cadeira flexora":["Sente com as costas apoiadas, joelho alinhado ao eixo, rolo atrás dos tornozelos e trava sobre as coxas.","Flexione os joelhos levando os calcanhares para baixo e volte devagar.","Tirar o quadril do banco, voltar rápido.","Ótima opção; trabalha o posterior bem alongado.","Posterior de coxa"],
"Flexora em pé unilateral":["Em pé na máquina, peito apoiado, rolo atrás do tornozelo de uma perna.","Flexione o joelho levando o calcanhar em direção ao glúteo e desça devagar.","Girar o quadril, usar impulso.","Corrige diferença entre as pernas.","Posterior de coxa"],
"Stiff com barra":["Em pé, barra nas mãos à frente das coxas, joelhos levemente dobrados, coluna reta.","Desça a barra rente às pernas levando o quadril para trás até sentir o posterior alongar e suba contraindo o glúteo.","Arredondar as costas, dobrar demais os joelhos, afastar a barra do corpo.","Desça só até onde mantiver a coluna reta.","Posterior de coxa, glúteos e lombar"],
"Stiff unilateral com halter":["Em pé numa perna, joelho levemente dobrado, halter na mão do lado oposto.","Incline o tronco à frente levando a perna livre para trás até o corpo quase ficar paralelo ao chão e volte.","Girar o quadril, arredondar as costas.","Apoie a mão livre em algo se perder o equilíbrio.","Posterior de coxa, glúteos e equilíbrio"],
"Bom dia com barra":["Barra apoiada nas costas, pés na largura do quadril, joelhos levemente dobrados.","Leve o quadril para trás inclinando o tronco com a coluna reta até sentir o posterior e volte.","Arredondar a lombar, descer demais, carga alta.","Carga leve; evite se tiver dor nas costas.","Posterior de coxa, glúteos e lombar"],
"Stiff no Smith":["Em pé dentro do Smith, barra à frente das coxas, joelhos levemente dobrados.","Desça a barra levando o quadril para trás com coluna reta e suba contraindo o glúteo.","Arredondar as costas, ficar longe da barra.","Guiado; ajuste as travas de segurança.","Posterior de coxa, glúteos e lombar"],
"Levantamento terra com kettlebell":["Kettlebell no chão entre os pés, pés na largura do quadril.","Agache levando o quadril para trás, segure a alça com a coluna reta e suba empurrando o chão.","Arredondar as costas, puxar com os braços.","Carga moderada; ótimo para aprender o movimento do terra.","Glúteos, posterior de coxa e lombar"],
"Flexão de joelho na bola suíça":["Deitado de costas, calcanhares sobre uma bola suíça, braços no chão.","Eleve o quadril e puxe a bola em direção ao glúteo dobrando os joelhos; volte devagar.","Deixar o quadril cair, fazer rápido.","Sem carga na coluna.","Posterior de coxa e glúteos"],
"Mesa flexora unilateral":["Deite de bruços com o joelho logo fora do banco, rolo atrás do tornozelo de uma perna.","Flexione o joelho levando o calcanhar em direção ao glúteo e desça devagar.","Tirar o quadril do banco, girar o tronco.","Carga leve a moderada.","Posterior de coxa"],
"Elevação pélvica com barra (hip thrust)":["Costas apoiadas na borda do banco, barra sobre o quadril (com proteção), pés firmes na largura do quadril.","Suba o quadril até o corpo ficar reto dos ombros aos joelhos, contraia o glúteo 1 segundo e desça.","Arquear a lombar no topo, empurrar com a ponta dos pés.","Use almofada na barra; sem carga na coluna.","Glúteo máximo e posterior de coxa"],
"Elevação pélvica na máquina":["Sente na máquina com as costas no apoio e o cinto ou almofada sobre o quadril, pés firmes.","Suba o quadril até alinhar o corpo, contraia o glúteo e desça devagar.","Arquear a lombar, empurrar com a ponta dos pés.","Guiado e fácil de ajustar a carga.","Glúteo máximo"],
"Elevação pélvica unilateral":["Costas apoiadas no banco, um pé firme no chão e a outra perna estendida ou dobrada no ar.","Suba o quadril empurrando com o calcanhar de apoio, contraia o glúteo e desça.","Deixar o quadril girar, arquear a lombar.","Peso corporal já basta no início.","Glúteo máximo e médio"],
"Cadeira abdutora":["Sente com as costas apoiadas, almofadas na parte de fora dos joelhos, pernas juntas.","Abra as pernas contra a resistência, segure 1 segundo e volte devagar.","Fazer rápido, tirar as costas do banco.","Carga moderada.","Glúteo médio e mínimo"],
"Cadeira abdutora com tronco à frente":["Sente na abdutora e incline o tronco à frente com a coluna reta, mãos nas pegadas.","Abra as pernas contra a resistência e volte devagar.","Arredondar as costas, usar impulso.","Dá mais ênfase no glúteo máximo.","Glúteo médio e máximo"],
"Coice na máquina":["Apoie o peito e os braços na máquina, um pé na plataforma de chute.","Empurre a perna para trás e para cima até estender o quadril e volte devagar.","Arquear a lombar, girar o quadril.","Não suba além do confortável para a lombar.","Glúteo máximo"],
"Glúteo 4 apoios com caneleira":["Quatro apoios no colchonete, caneleira no tornozelo, mãos abaixo dos ombros e joelhos abaixo do quadril.","Eleve uma perna para trás e para cima com o joelho dobrado até a linha do quadril e desça devagar.","Arquear a lombar, girar o quadril.","Abdômen firme; sem carga na coluna.","Glúteo máximo"],
"Abdução de quadril na polia":["De lado para a polia baixa, tornozeleira no pé de fora, mão apoiada na máquina.","Leve a perna para o lado e um pouco para trás e volte devagar.","Inclinar o tronco, girar o pé para cima.","Carga leve.","Glúteo médio"],
"Abdução deitado de lado":["Deitado de lado no colchonete, pernas estendidas e alinhadas com o corpo.","Eleve a perna de cima até cerca de 45° e desça devagar.","Rolar o quadril para trás, subir demais.","Pode usar caneleira ou elástico.","Glúteo médio"],
"Concha (clamshell) com elástico":["Deitado de lado, joelhos dobrados, elástico acima dos joelhos, pés juntos.","Abra o joelho de cima mantendo os pés juntos e feche devagar.","Rolar o quadril para trás.","Carga leve; ótimo para estabilizar o joelho.","Glúteo médio"],
"Agachamento sumô com kettlebell":["Pés bem afastados com pontas para fora, kettlebell nas mãos entre as pernas.","Desça mantendo o peito alto e os joelhos na direção dos pés; suba contraindo o glúteo.","Joelhos para dentro, arredondar as costas.","Carga moderada.","Glúteos, adutores e quadríceps"],
"Passada lateral com miniband":["Miniband acima dos joelhos ou nos tornozelos, joelhos levemente dobrados.","Dê passos para o lado mantendo a tensão no elástico e volte.","Deixar os joelhos caírem para dentro, ficar em pé reto.","Ótimo para aquecer o glúteo.","Glúteo médio"],
"Recuo (afundo reverso) no Smith":["Barra do Smith nas costas, pés juntos.","Dê um passo para trás, desça até os dois joelhos ficarem a cerca de 90° e volte.","Joelho da frente para dentro, tronco caindo.","Guiado; mais estável.","Glúteos e quadríceps"],
"Frog pump (elevação pélvica sapo)":["Deitado de costas, solas dos pés juntas e joelhos abertos.","Suba o quadril contraindo o glúteo e desça devagar.","Arquear a lombar, fazer rápido.","Pode usar halter sobre o quadril.","Glúteo máximo"],
"Panturrilha sentado na máquina":["Sente com a almofada sobre as coxas, ponta dos pés na plataforma.","Suba os calcanhares o máximo possível, segure 1 segundo e desça devagar.","Fazer rápido, amplitude curta.","Ênfase no sóleo.","Sóleo e gastrocnêmio"],
"Panturrilha em pé na máquina":["Ombros sob as almofadas, ponta dos pés na plataforma.","Suba os calcanhares o máximo possível e desça devagar.","Dobrar os joelhos, amplitude curta.","Carga moderada.","Gastrocnêmio e sóleo"],
"Panturrilha no hack":["Costas no apoio do hack, ponta dos pés na borda da plataforma.","Suba os calcanhares e desça devagar.","Dobrar os joelhos, amplitude curta.","Trave a máquina ao terminar.","Gastrocnêmio e sóleo"],
"Elevação das pontas dos pés (tibial anterior)":["Em pé com as costas e o quadril encostados na parede, calcanhares a um passo da parede.","Suba as pontas dos pés o máximo possível mantendo os calcanhares no chão e desça devagar.","Fazer rápido, dobrar os joelhos.","Sem carga; fortalece a canela e ajuda a prevenir dor na canela de quem corre.","Tibial anterior"],
"Panturrilha unilateral no degrau":["Em pé numa perna só com a ponta do pé na borda de um degrau, mão apoiada na parede para equilíbrio.","Desça o calcanhar abaixo do degrau, depois suba o máximo possível e segure 1 segundo.","Fazer rápido, dobrar o joelho, amplitude curta.","Segure em algo firme; pode segurar um halter na outra mão para progredir.","Gastrocnêmio e sóleo"],
"Prancha lateral":["Deitado de lado no colchonete, antebraço apoiado logo abaixo do ombro, pernas estendidas uma sobre a outra.","Suba o quadril até o corpo ficar reto da cabeça aos pés e segure pelo tempo indicado; repita do outro lado.","Deixar o quadril cair, girar o tronco para frente, ombro subindo para a orelha.","Para facilitar, apoie os joelhos dobrados no chão.","Oblíquos, abdômen e glúteo médio"],
"Abdominal infra no colchonete":["Deitado de costas, mãos ao lado do corpo ou sob o quadril, joelhos dobrados e pés no ar.","Leve os joelhos em direção ao peito tirando levemente o quadril do chão e volte devagar sem encostar os pés no chão.","Usar impulso das pernas, arquear a lombar na volta, fazer rápido.","Mantenha a lombar apoiada; pare se sentir dor nas costas.","Abdômen (porção inferior) e flexores do quadril"],
"Abdominal bicicleta":["Deitado de costas, mãos atrás da cabeça sem entrelaçar os dedos, pernas levantadas com joelhos a 90°.","Leve o cotovelo em direção ao joelho oposto enquanto estica a outra perna; alterne os lados de forma controlada.","Puxar a cabeça com as mãos, fazer rápido sem girar o tronco.","Pescoço relaxado; olhe para cima.","Oblíquos e reto do abdômen"],
"Abdominal canivete":["Deitado de costas, braços estendidos acima da cabeça e pernas estendidas no chão.","Suba braços e pernas ao mesmo tempo tentando tocar as mãos nos pés e desça devagar.","Usar impulso, arquear a lombar na descida, prender a respiração.","Exercício avançado; comece com os joelhos dobrados.","Reto do abdômen e flexores do quadril"],
"Elevação de joelhos na barra (abdominal infra)":["Pendure-se na barra fixa ou apoie os antebraços nas paralelas (cadeira romana), corpo parado.","Eleve os joelhos até a altura do quadril ou do peito e desça devagar sem balançar.","Balançar o corpo, usar impulso, descer soltando.","Exige pegada e ombro; prefira a versão nas paralelas se sentir o ombro.","Abdômen (porção inferior) e flexores do quadril"],
"Abdominal na máquina":["Ajuste o banco, sente com as costas apoiadas e segure as pegadas ou apoie os braços nas almofadas.","Flexione o tronco à frente enrolando a coluna e contraindo o abdômen; volte devagar.","Puxar com os braços, usar impulso, carga alta demais.","Carga moderada; foque em sentir o abdômen.","Reto do abdômen"],
"Abdominal oblíquo na polia":["Em pé de lado para a polia baixa, pegador numa mão, braço estendido ao lado do corpo, pés na largura do quadril.","Incline o tronco para o lado oposto à polia contraindo a lateral do abdômen e volte devagar.","Girar ou inclinar o tronco para frente, carga alta.","Carga leve a moderada; evite em crise de dor lombar.","Oblíquos e quadrado lombar"],
"Rotação de tronco na polia (lenhador)":["De lado para a polia na posição alta, pegador nas duas mãos, braços estendidos, pés afastados.","Gire o tronco puxando o cabo em diagonal de cima para baixo até o lado oposto e volte devagar.","Puxar só com os braços, arredondar as costas, girar rápido.","Carga moderada; gire o pé de trás junto para proteger o joelho.","Oblíquos e reto do abdômen"],
"Pallof press na polia":["Em pé de lado para a polia na altura do peito, pegador nas duas mãos junto ao peito, pés na largura dos ombros.","Estenda os braços à frente sem deixar o tronco girar, segure 2 segundos e volte ao peito.","Deixar o tronco girar em direção à polia, prender a respiração.","Ótimo para estabilidade do tronco e proteção da lombar.","Abdômen e oblíquos (anti-rotação)"],
"Prancha com toque no ombro":["Prancha alta com mãos abaixo dos ombros, corpo reto e pés afastados na largura do quadril.","Tire uma mão do chão e toque o ombro oposto sem deixar o quadril balançar; alterne.","Balançar o quadril, deixar o quadril cair, fazer rápido.","Afaste mais os pés para ficar mais fácil.","Abdômen, oblíquos e ombros"],
"Abdominal remador":["Sentado no colchonete, tronco levemente inclinado para trás, braços à frente e pernas estendidas.","Traga os joelhos em direção ao peito enquanto aproxima o tronco e volte estendendo as pernas sem tocar o chão.","Usar impulso, arredondar demais as costas.","Faça devagar; apoie as mãos no chão para facilitar.","Reto do abdômen e flexores do quadril"],
"Elíptico (transport)":["Suba no aparelho, pés inteiros nos pedais e mãos nas alças móveis.","Faça o movimento contínuo combinando pernas e braços no ritmo indicado.","Apoiar o peso do corpo nos braços, ficar na ponta dos pés.","Sem impacto; ótimo para quem tem dor no joelho.","Pernas, glúteos e condicionamento"],
"Remo ergômetro":["Sente com os pés presos, joelhos dobrados, pegada nas mãos e coluna reta.","Empurre primeiro com as pernas, depois incline levemente o tronco e puxe a pegada até o abdômen; volte na ordem inversa.","Puxar só com os braços, arredondar as costas.","Comece em ritmo leve.","Pernas, costas, braços e condicionamento"],
"Escada (simulador)":["Suba no aparelho, postura ereta e mãos apoiadas de leve nas alças.","Suba os degraus no ritmo indicado pisando com o pé inteiro.","Apoiar o peso do corpo nas mãos, inclinar demais o tronco.","Ritmo leve a moderado; evite se tiver dor no joelho.","Glúteos, quadríceps e condicionamento"],
"Bicicleta horizontal":["Sente com as costas apoiadas e ajuste o banco para o joelho ficar levemente dobrado com o pedal mais longe.","Pedale no ritmo e carga indicados.","Banco muito perto ou muito longe.","Encosto apoia a coluna; boa opção para dor lombar.","Pernas e condicionamento"],
"Caminhada inclinada na esteira":["Ajuste a inclinação (5 a 12%) e a velocidade de caminhada.","Caminhe com postura ereta e passos naturais, sem segurar nas barras.","Segurar nas barras, inclinar o tronco para trás.","Comece com inclinação baixa.","Glúteos, panturrilhas e condicionamento"],
"Corda de pular":["Em pé, corda atrás do corpo, cotovelos perto do corpo.","Gire a corda com os punhos e pule baixo na ponta dos pés.","Pular alto, girar com os braços inteiros.","Impacto alto; evite se tiver dor em joelho ou tornozelo.","Panturrilhas e condicionamento"],
"Polichinelo":["Em pé, pés juntos e braços ao lado do corpo.","Salte abrindo as pernas e levando os braços acima da cabeça; volte à posição inicial.","Pousar com os calcanhares, fazer sem ritmo.","Impacto moderado; dá para fazer sem pular, abrindo uma perna de cada vez.","Corpo todo e condicionamento"],
"Gato-camelo no colchonete":["Em quatro apoios no colchonete, mãos abaixo dos ombros e joelhos abaixo do quadril.","Arredonde a coluna levando o umbigo para cima e o queixo ao peito; depois afunde a coluna olhando para frente. Faça 8 a 10 vezes, devagar.","Fazer rápido, forçar o pescoço.","Movimento suave, sem dor.","Mobilidade de toda a coluna"],
"Alongamento de peito no batente":["Em pé num batente de porta, antebraço apoiado na lateral com o cotovelo na altura do ombro.","Dê um passo à frente até sentir alongar o peito e segure 20 a 30 s; troque de lado.","Forçar demais, cotovelo acima do ombro.","Alongamento leve; não deve doer o ombro.","Peitoral e ombro anterior"],
"Rotação de quadril em pé":["Em pé, mãos na cintura ou apoiadas na parede, pés na largura do quadril.","Eleve um joelho e faça círculos com o quadril, para fora e para dentro, 8 a 10 vezes de cada lado.","Girar o tronco junto, fazer rápido.","Segure em algo se perder o equilíbrio.","Mobilidade do quadril"],
"Alongamento de posterior de coxa em pé":["Em pé, apoie um calcanhar num banco baixo com a perna estendida.","Incline o tronco à frente com a coluna reta até sentir alongar atrás da coxa; segure 20 a 30 s e troque.","Arredondar as costas, forçar o joelho.","Alongamento leve, sem dor.","Posterior de coxa"],
"World's greatest stretch (passo longo com rotação)":["Dê um passo longo à frente e apoie as duas mãos no chão por dentro do pé da frente.","Leve o cotovelo de dentro em direção ao chão, depois gire o tronco abrindo o braço para o teto; volte e troque de lado.","Deixar o joelho de trás cair sem controle, girar rápido.","Faça devagar; apoie o joelho de trás se precisar.","Quadril, posterior, coluna torácica e ombros"],
"Mobilidade de ombro com elástico":["Em pé, segure um elástico com as mãos bem afastadas à frente do corpo.","Leve os braços estendidos por cima da cabeça até atrás do corpo e volte, 10 vezes.","Dobrar os cotovelos, arquear a lombar.","Afaste mais as mãos se sentir o ombro.","Mobilidade dos ombros"],
"Alongamento do flexor do quadril (afundo ajoelhado)":["Ajoelhado com um joelho no colchonete e o outro pé à frente, joelho da frente a 90°, tronco ereto.","Contraia o glúteo da perna de trás e leve o quadril levemente à frente até sentir alongar a frente do quadril; segure 20 a 30 s e troque.","Arquear a lombar, jogar o joelho da frente além do pé.","Use uma almofada sob o joelho; não deve doer.","Flexores do quadril (iliopsoas) e quadríceps"],
"Rotação torácica em quatro apoios":["Em quatro apoios no colchonete, mãos abaixo dos ombros e joelhos abaixo do quadril, uma mão atrás da cabeça.","Leve o cotovelo em direção ao braço de apoio e depois gire o tronco abrindo o cotovelo para o teto; faça 8 a 10 de cada lado.","Girar o quadril junto, fazer rápido.","Movimento lento e sem forçar.","Coluna torácica e ombros"],
"Mobilidade de tornozelo na parede":["De frente para a parede, pé da frente a cerca de um palmo dela, mãos apoiadas na parede.","Leve o joelho à frente até tocar a parede sem tirar o calcanhar do chão e volte; faça 10 de cada lado.","Tirar o calcanhar do chão, deixar o joelho cair para dentro.","Afaste o pé aos poucos conforme melhorar.","Tornozelo e panturrilha"],
"Alongamento de glúteo deitado (figura 4)":["Deitado de costas, cruze um tornozelo sobre o joelho da outra perna.","Puxe a coxa de baixo em direção ao peito até sentir alongar o glúteo; segure 20 a 30 s e troque.","Tirar a cabeça e a lombar do chão, forçar o joelho.","Sem dor no joelho.","Glúteos e rotadores do quadril"],
"Postura da criança (alongamento de costas)":["Ajoelhado no colchonete, sente sobre os calcanhares com os joelhos um pouco afastados.","Leve o tronco à frente estendendo os braços no chão e respire fundo por 20 a 30 s.","Forçar os joelhos, prender a respiração.","Coloque uma almofada se os joelhos incomodarem.","Dorsais, lombar e quadril"]
};
const BREATH={peito:"Puxe o ar na descida e solte ao empurrar.",triceps:"Solte o ar ao estender o cotovelo e puxe na volta.",antebraco:"Respire de forma contínua, sem prender o ar.",costas:"Solte o ar ao puxar e puxe o ar ao voltar.",biceps:"Solte o ar ao subir e puxe ao descer.",ombro:"Solte o ar ao subir e puxe ao descer.",quad:"Puxe o ar antes de descer e solte ao subir.",pant:"Respire de forma contínua, soltando o ar na subida.",post:"Puxe o ar na descida e solte ao subir contraindo o glúteo.",caminhada:"Respire pelo nariz e solte pela boca, num ritmo confortável.",gluteo:"Solte o ar ao subir contraindo o glúteo e puxe na descida.",abdomen:"Solte o ar no esforço e puxe na volta, sem prender a respiração.",cardio:"Respire pelo nariz e solte pela boca, num ritmo em que dê para conversar."};
const GAIN={hipertrofia:"o estímulo de tensão com carga desafiadora faz esse músculo crescer ao longo das semanas",emagrecimento:"trabalhar esse músculo aumenta o gasto calórico do treino e preserva a massa magra enquanto você perde gordura",forca:"progredir a carga neste exercício deixa você mais forte no movimento",condicionamento:"as repetições mais altas melhoram a resistência desse músculo para você cansar menos",saude:"fortalece músculos e articulações, melhora a postura e deixa o dia a dia mais fácil"};
function howOf(n,g){const h=HOW[n];if(h)return{setup:h[0],exec:h[1],err:h[2],seg:h[3],mus:h[4]};return{setup:"Ajuste o equipamento ao seu corpo e fique numa posição firme e estável antes de começar.",exec:"Faça o movimento de forma lenta e controlada em toda a amplitude confortável, sem usar impulso.",err:"Usar carga alta demais, fazer rápido, perder a postura.",seg:"Se não souber executar, peça ao seu personal para demonstrar. Pare se sentir dor.",mus:GN[g]||"Músculos do treino de hoje"}}
let detOpen=null;
function nomesCatalogo(){const s=[];Object.keys(EX).forEach(g=>(EX[g]||[]).forEach(x=>{if(x&&x.n&&!s.includes(x.n))s.push(x.n)}));return s.sort((a,b)=>a.localeCompare(b,"pt"))}
function videoDoExercicio(nome){const v=window.__EXVID||{};if(v.custom&&v.custom[nome])return v.custom[nome];if(v.defaults&&v.defaults[nome])return v.defaults[nome];return ""}
function detHTML(e){const h=howOf(e.n,e.g),A=S.a,cat=/forc/.test(norm(A.objTxt||""))&&A.objetivo==="hipertrofia"?"forca":A.objetivo,light=/leve/.test(e.r+" "+(e.sub||""))||/90/.test(e.d)||(S.a.medInfo&&S.a.medInfo.low);
 const src=videoDoExercicio(e.n);
 const vid=src?`<div class="dvidBox"><video src="${esc(src)}" muted autoplay loop playsinline preload="metadata"></video><span class="dvidMarca">Shape de Qualidade</span></div>`:"";
 return `<div class="dhead"><button class="dback" id="detBack" aria-label="Voltar">←</button><h3>${esc(e.n)}</h3></div>
 ${vid}
 <p class="dmeta">${e.s} série(s) × ${esc(e.r)} · descanso ${esc(e.d)}</p>
 <h4>Como fazer</h4><ol><li><b>Posição inicial:</b> ${esc(h.setup)}</li><li><b>Execução:</b> ${esc(h.exec)}</li><li><b>Respiração:</b> ${esc(BREATH[e.g]||"Solte o ar no esforço e puxe na volta, sem prender a respiração.")}</li></ol>
 <h4>Erros comuns</h4><p>${esc(h.err)}</p><h4>Segurança</h4><p>${esc(h.seg)}${light?" Hoje: carga leve, amplitude controlada e foco na técnica.":""} Se sentir dor, pare e fale com seu personal.</p>
 <h4>Músculos trabalhados</h4><p>${esc(h.mus)}</p>
 <h4>O que você ganha</h4><p><b>${esc(objShow())}:</b> ${esc(GAIN[cat]||GAIN.saude)}.</p>`}
function openDet(key,e){if(!e||e.manual)return;const d=$("#detDrawer"),o=$("#detOv");if(detOpen===key){closeDet();return}
 const paint=()=>{detOpen=key;d.innerHTML=detHTML(e);d.classList.add("open");o.classList.add("open");$("#detBack").onclick=closeDet;document.querySelectorAll(".detBtn").forEach(b=>b.classList.toggle("on",b.dataset.k===key));const vid=d.querySelector("video");if(vid){vid.muted=true;vid.playsInline=true;const p=vid.play();if(p&&p.catch)p.catch(()=>{})}};
 paint();if(!window.__EXVID&&typeof loadExVid==="function")loadExVid().then(()=>{if(detOpen===key)paint()})}
function closeDet(){detOpen=null;const d=$("#detDrawer");if(d){d.classList.remove("open");$("#detOv").classList.remove("open")}document.querySelectorAll(".detBtn").forEach(b=>b.classList.remove("on"))}

/* ---------- Voz ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null,listening=false,target="anam",audioCtx,an,raf,stream;
for(let i=0;i<9;i++)$("#wave").appendChild(document.createElement("span"));
/* Voz: escolhe a voz pt-BR mais natural disponível */
const VKEY="coachvoz_voz";let VOICES=[],vpref=(()=>{try{const v=JSON.parse(localStorage.getItem(VKEY));return v&&typeof v==="object"?v:{rate:1.15}}catch(e){return{rate:1.15}}})(),spkId=0;
function vscore(v){const n=v.name,l=(v.lang||"").replace("_","-").toLowerCase();let s=0;if(l==="pt-br")s+=100;else if(l.startsWith("pt"))s+=40;else return -1;
 if(/natural|neural/i.test(n))s+=50;if(/online/i.test(n))s+=30;if(/google portugu[eê]s do brasil/i.test(n))s+=35;if(/francisca|thalita|antonio|luciana|felipe/i.test(n))s+=25;if(v.localService===false)s+=5;return s}
function loadVoices(){if(!("speechSynthesis"in window))return;VOICES=speechSynthesis.getVoices().map(v=>({v,s:vscore(v)})).filter(x=>x.s>=0).sort((a,b)=>b.s-a.s).map(x=>x.v);
 const sel=$("#voiceSel");sel.innerHTML=VOICES.length?VOICES.map((v,i)=>`<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})${i===0?" ★ recomendada":""}</option>`).join(""):'<option value="">Voz padrão do sistema</option>';
 if(vpref.name&&VOICES.some(v=>v.name===vpref.name))sel.value=vpref.name}
function curVoice(){return VOICES.find(v=>v.name===vpref.name)||VOICES[0]||null}
function chunks(t){return(t.match(/[^.!?…:]+[.!?…:]*/g)||[t]).flatMap(x=>{x=x.trim();if(x.length<=160)return[x];return x.split(/,\s*/).map(y=>y.trim())}).filter(Boolean)}
let ttsWD=null,keepU=[];
function ttsEnabled(){const c=$("#tts");return !c||c.checked}
function syncTtsBtn(){const on=ttsEnabled(),b=$("#ttsToggle");if(b){b.textContent=on?"🔊 ligado":"🔇 desligado";b.setAttribute("aria-pressed",on?"true":"false")}}
function lastCoachText(){const m=[...(S.chat||[])].reverse().find(x=>x[0]==="c"&&x[1]);return m?m[1]:""}
function showTtsPlay(t,onEnd){if(!ttsEnabled())return;let b=$("#ttsPlay");
 if(!b){b=document.createElement("button");b.id="ttsPlay";b.type="button";b.className="btn";b.style.cssText="width:100%;margin:6px 0";const m=$("#mic");(m&&m.parentNode?m.parentNode:document.body).insertBefore(b,m||null)}
 b.textContent="🔊 Tocar para ouvir o coach";
 b.onclick=()=>{b.remove();window.__ttsUnlocked=true;try{speechSynthesis.resume()}catch(e){}speak(t||lastCoachText(),onEnd,{interrupt:true})}}
/* Frases fixas tocam em mp3 (Android costuma ficar mudo no speechSynthesis). Texto dinâmico, como o nome, usa a voz do navegador. */
const clipPlayer=typeof Audio==="function"?new Audio():null;
if(clipPlayer){clipPlayer.setAttribute("playsinline","");clipPlayer.preload="auto"}
function clipSegments(text){const clips=window.COACH_CLIPS||{},keys=Object.keys(clips).sort((a,b)=>b.length-a.length);let rest=String(text||""),out=[];
 while(rest.length){rest=rest.replace(/^\s+/,"");if(!rest)break;const hit=keys.find(k=>rest.startsWith(k));
  if(hit){out.push({mp3:clips[hit],text:hit});rest=rest.slice(hit.length);continue}
  let at=rest.length;for(const k of keys){const j=rest.indexOf(k);if(j>0&&j<at)at=j}const bit=rest.slice(0,at).trim();if(bit)out.push({text:bit});rest=rest.slice(at)}
 return out}
function primeAudio(){if(!clipPlayer)return;try{clipPlayer.src="/audio/silence.mp3";const p=clipPlayer.play();if(p&&p.catch)p.catch(()=>{})}catch(e){}}
/* A coach só fala enquanto a anamnese está aberta. Treino, painel e mensalidade ficam em silêncio. */
function emAnamnese(){
 if(typeof viewing!=="undefined"&&viewing)return false;
 if(window.__ME&&window.__ME.role&&window.__ME.role!=="student")return false;
 if(!S||S.status!=="none")return false;
 const card=document.getElementById("anamCard");
 if(card&&card.classList.contains("hide"))return false;
 return true}
function silenciarCoach(){
 spkId++;clearTimeout(ttsWD);
 try{if("speechSynthesis"in window)speechSynthesis.cancel()}catch(e){}
 try{if(clipPlayer){clipPlayer.pause();clipPlayer.currentTime=0}}catch(e){}
 setAI(false);
 const b=$("#ttsPlay");if(b)b.remove();
 if(!emAnamnese()){const v=$("#voiceGo");if(v)v.remove()}}
function speak(t,onEnd,opts){
 if(!emAnamnese()){silenciarCoach();if(onEnd)onEnd();return}
 const id=++spkId;let done=false;setAI(true);try{if(clipPlayer)clipPlayer.pause()}catch(e){}
 const fin=()=>{if(done||id!==spkId)return;done=true;clearTimeout(ttsWD);try{if(clipPlayer)clipPlayer.pause()}catch(e){}setAI(false);onEnd&&onEnd()};
 if(!t||!ttsEnabled()){fin();return}
 const segs=clipSegments(t);if(!segs.length){fin();return}
 if(segs.some(s=>s.mp3)&&!(segs[0]&&segs[0].mp3))primeAudio();
 segs.filter(s=>s.mp3).forEach(s=>{window.__played=window.__played||[];window.__played.push({text:s.text,src:s.mp3})});
 let i=0,warned=false;
 const step=()=>{if(done||id!==spkId)return;if(i>=segs.length){fin();return}const seg=segs[i++];if(seg.mp3)playOne(seg);else speakSynth(seg.text,step)};
 const playOne=seg=>{
  if(!clipPlayer){if(!warned){warned=true;showTtsPlay(t,onEnd)}step();return}
  let settled=false,armed=false;const token={};clipPlayer._tok=token;
  const fail=()=>{if(settled||id!==spkId||clipPlayer._tok!==token)return;settled=true;clearTimeout(ttsWD);if(!warned){warned=true;showTtsPlay(t,onEnd)}step()};
  const pass=()=>{if(settled||id!==spkId||clipPlayer._tok!==token)return;settled=true;clearTimeout(ttsWD);step()};
  clipPlayer.onplaying=()=>{if(clipPlayer._tok===token){window.__audioHeard=true;window.__ttsHeard=true;const b=$("#ttsPlay");if(b)b.remove()}};
  clipPlayer.onended=()=>{if(armed)pass()};
  clipPlayer.onerror=()=>{if(armed)fail()};
  try{clipPlayer.src=seg.mp3;const p=clipPlayer.play();armed=true;ttsWD=setTimeout(pass,30000);if(p&&p.catch)p.catch(()=>{if(armed)fail()})}catch(e){armed=true;fail()}};
 const speakSynth=(text,next)=>{if(!("speechSynthesis"in window)){showTtsPlay(t,onEnd);next();return}
  const SS=speechSynthesis;try{SS.resume()}catch(e){}
  const parts=chunks(String(text)),rate=+vpref.rate||1.15;let pi=0;
  const voices=typeof SS.getVoices==="function"?SS.getVoices()||[]:[];if(!voices.length)showTtsPlay(t,onEnd);
  const goPart=()=>{if(id!==spkId||done)return;clearTimeout(ttsWD);if(pi>=parts.length){next();return}
   const txt=parts[pi++];let fired=false;const adv=()=>{if(fired||id!==spkId)return;fired=true;goPart()};
   const u=new SpeechSynthesisUtterance(txt);u.lang="pt-BR";const v=curVoice();if(v)u.voice=v;u.rate=rate;u.pitch=1;keepU=[u];
   const mark=()=>{window.__ttsHeard=true;window.__ttsStart=Date.now()};u.onstart=mark;try{u.addEventListener("start",mark)}catch(e){}
   u.onend=adv;u.onerror=e=>{if(e.error==="interrupted"||e.error==="canceled")return;showTtsPlay(t,onEnd);adv()};
   const startedAt=Date.now();
   ttsWD=setTimeout(()=>{if(id!==spkId||done)return;if(!(window.__ttsStart>=startedAt)&&!SS.speaking)showTtsPlay(t,onEnd);adv()},1800+txt.length*90/rate);
   const go=()=>{if(id!==spkId||done)return;try{SS.resume();SS.speak(u)}catch(e){showTtsPlay(t,onEnd);adv()}};
   if(pi===1&&(SS.speaking||SS.pending)){try{SS.cancel()}catch(e){}setTimeout(go,120);return}
   go()};
  goPart()};
 step()}
function say(t){if(!t)return;addMsg("c",t);speak(t)}
function addMsg(w,t){if(target==="anam"&&S.status==="none"||w==="a"&&target==="anam"){S.chat.push([w,t]);save()}renderChat()}
function renderChat(){$("#chat").innerHTML="";S.chat.forEach(([w,t])=>{const d=document.createElement("div");d.className="msg "+w;if(w==="c"&&t){const s=document.createElement("span");s.textContent=t;d.appendChild(s);const b=document.createElement("button");b.type="button";b.className="btn sm sec repetir";b.textContent="Repetir";b.onclick=()=>speak(t,null,{interrupt:true});d.appendChild(b)}else d.textContent=t;$("#chat").appendChild(d)});$("#chat").scrollTop=1e6}
function unlockTts(ev){if(!emAnamnese()){silenciarCoach();return}if(window.__ttsUnlocked)return;window.__ttsUnlocked=true;try{speechSynthesis.resume()}catch(e){}
 if(!ttsEnabled())return;const last=lastCoachText();const needs=last&&clipSegments(last).some(s=>s.mp3);
 if(needs?window.__audioHeard:window.__ttsHeard)return;const el=ev&&ev.target;if(el&&el.closest&&el.closest("#ttsToggle,#voiceGo,#ttsPlay,.repetir"))return;
 if(last)speak(last)}
["pointerdown","keydown"].forEach(ev=>document.addEventListener(ev,unlockTts,true));
const MOBILE=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform));
let waveGen=0;
async function startWave(){/* no celular, abrir o microfone em paralelo (getUserMedia) derruba o reconhecimento de voz: usa onda animada */const g=++waveGen;if(MOBILE||!navigator.mediaDevices){fakeWave();return}try{const s=await navigator.mediaDevices.getUserMedia({audio:true});if(g!==waveGen){s.getTracks().forEach(t=>t.stop());return}stream=s;audioCtx=new(window.AudioContext||window.webkitAudioContext)();an=audioCtx.createAnalyser();an.fftSize=64;audioCtx.createMediaStreamSource(stream).connect(an);const data=new Uint8Array(an.frequencyBinCount),bars=[...$("#wave").children];(function loop(){if(g!==waveGen)return;an.getByteFrequencyData(data);bars.forEach((b,i)=>b.style.height=(6+data[i*2]/255*34)+"px");raf=requestAnimationFrame(loop)})()}catch(e){if(g===waveGen)fakeWave()}}
function fakeWave(){const g=waveGen,bars=[...$("#wave").children];(function loop(){if(g!==waveGen)return;bars.forEach(b=>b.style.height=(6+Math.random()*28)+"px");raf=setTimeout(loop,120)})()}
function stopWave(){waveGen++;cancelAnimationFrame(raf);clearTimeout(raf);if(stream)stream.getTracks().forEach(t=>t.stop());if(audioCtx)audioCtx.close().catch(()=>{});stream=audioCtx=null;[...$("#wave").children].forEach(b=>b.style.height="")}
let recWD=null;
function setAI(on){const m=$("#mic");if(!m)return;m.classList.toggle("ai",!!on);if(on)m.classList.remove("live");if(on)stopWave();updMode()}
function updMode(){const m=$("#mic"),v=$("#vmode");if(!v||!m)return;const live=m.classList.contains("live"),ai=m.classList.contains("ai");v.className=live?"user":ai?"ai":"";v.textContent=live?"● Ouvindo você":ai?"🔊 Coach falando":"Toque para falar"}
function resetRec(){listening=false;clearTimeout(recWD);$("#mic").classList.remove("live");stopWave();updMode()}
/* Ruído de fundo vira texto curtíssimo ou com confiança baixa. Confiança 0 = o navegador não informou: não descarta. */
function speechOk(text,conf){const t=String(text||"").replace(/\s+/g," ").trim();if(t.length<2)return false;if(/^(a+|e+|o+|h+|ah+|eh+|hm+|hum+|hmm+|uh+|u+|é+|né|ne|hã|ham|ahn)$/i.test(t))return false;if(typeof conf==="number"&&conf>0&&conf<0.4)return false;return true}
function listen(tgt){if(!SR){$("#nosup").classList.remove("hide");return}
 if(listening){const r=rec;try{r.stop()}catch(e){}setTimeout(()=>{if(rec===r&&listening&&r.__finish)r.__finish()},1500);return}
 target=tgt;spkId++;clearTimeout(ttsWD);try{speechSynthesis.cancel()}catch(e){}try{if(clipPlayer)clipPlayer.pause()}catch(e){}
 $("#mic").classList.remove("ai");
 if(rec){try{rec.onend=rec.onerror=rec.onresult=rec.onstart=null;rec.abort()}catch(e){}}
 const r=new SR();rec=r;r.lang="pt-BR";r.interimResults=true;r.continuous=false;r.maxAlternatives=1;
 let final="",interim="",err="",ended=false,conf=0;
 const finish=()=>{if(ended)return;ended=true;if(rec===r)resetRec();
  const text=(final||interim).trim();
  if(text&&speechOk(text,conf)){$("#live").textContent="“"+text+"”";tgt==="adj"?adjust(text):handle(text);return}
  if(["not-allowed","service-not-allowed","audio-capture","network"].includes(err))return;
  $("#live").textContent=text?"Não entendi. Toque para falar de novo.":"Toque para falar"};
 r.__finish=finish;
 r.onstart=()=>{$("#mic").classList.add("live");$("#mic").classList.remove("ai");updMode();$("#live").textContent="Ouvindo... toque de novo para parar";startWave()};
 r.onresult=e=>{interim="";for(let i=e.resultIndex;i<e.results.length;i++){const alt=e.results[i][0];if(e.results[i].isFinal){final+=alt.transcript;if(alt&&typeof alt.confidence==="number"&&alt.confidence>conf)conf=alt.confidence}else interim+=alt.transcript}const show=(final||interim).trim();$("#live").textContent=show||"Ouvindo... toque de novo para parar";if(tgt==="adj")$("#adjTxt").value=final||interim};
 r.onerror=e=>{err=e.error||"";const M={"not-allowed":"🎤 O microfone está bloqueado. Libere o microfone para este site (cadeado ao lado do endereço) ou responda digitando abaixo.","service-not-allowed":"🎤 Este navegador não liberou o reconhecimento de voz. Use o Chrome (Android/PC) ou o Safari (iPhone), ou digite abaixo.","audio-capture":"🎤 Não encontrei microfone. Verifique o microfone ou digite abaixo.","network":"📶 O reconhecimento de voz precisa de internet. Verifique a conexão ou digite abaixo."};if(M[err])$("#live").textContent=M[err];else if(err!=="no-speech"&&err!=="aborted")$("#live").textContent="Não entendi. Toque para falar de novo."};
 r.onend=finish;
 listening=true;$("#mic").classList.add("live");$("#mic").classList.remove("ai");updMode();startWave();
 recWD=setTimeout(()=>{try{r.stop()}catch(e){}setTimeout(finish,1500)},12000);/* watchdog: reconhecimento travado, não religa sozinho */
 try{r.start()}catch(e){ended=true;resetRec();$("#live").textContent="Toque para falar de novo."}}

/* ---------- Senha do personal (SHA-256 + sal) ---------- */
const PKEY="coachvoz_senha";let unlocked=false;try{const ps=sessionStorage.getItem("sq_personal_sessao"),pa=JSON.parse(localStorage.getItem("sq_personal")||"null");unlocked=!!(ps&&pa&&pa.email===ps)}catch(e){}
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function hashPw(pw,salt){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(salt+":"+pw)))}
function pwRec(){try{return JSON.parse(localStorage.getItem(PKEY))}catch(e){return null}}
const PACC="sq_personal",PSESS="sq_personal_sessao";
function pAcc(){try{const a=JSON.parse(localStorage.getItem(PACC));return a&&a.email&&a.hash?a:null}catch(e){return null}}
let pMode=null;
function lockHTML(){const acc=pAcc(),old=pwRec(),f=(id,ph,t)=>`<input type="${t||"text"}" id="${id}" placeholder="${ph}" style="margin-bottom:8px">`;
 if(acc&&pMode!=="forgot")return `<div class="lockbox"><h2>🔒 Login do Personal</h2><p style="color:var(--mut)">Entre com seu e-mail e senha.</p>${f("pEmail","E-mail","email")}${f("pw1","Senha","password")}<div id="pwErr"></div><button class="btn" id="pwGo" style="width:100%">Entrar</button><p><a href="#" id="pwForgot" style="color:var(--bad);font-size:.85rem">Esqueci a senha</a></p></div>`;
 if(pMode==="forgot")return `<div class="lockbox"><h2>⚠️ Esqueci a senha</h2><div class="alert bad">Nesta versão de teste não existe recuperação por e-mail. A única saída é <b>apagar a conta do personal</b> neste aparelho. As contas e fichas dos alunos são mantidas, mas os treinos aprovados voltam para <b>pendente</b> e precisarão ser aprovados de novo.</div><p>Para confirmar, digite <b>APAGAR</b>:</p>${f("pConf","Digite APAGAR")}<div id="pwErr"></div><button class="btn" id="pwWipe" style="width:100%;background:var(--bad);color:#fff">Apagar conta do personal</button><p><a href="#" id="pwCancel">Cancelar</a></p></div>`;
 if(old)return `<div class="lockbox"><h2>🔒 Atualize seu acesso</h2><p style="color:var(--mut)">O painel agora usa login com e-mail. Digite a senha atual e cadastre seu e-mail.</p>${f("pNomeAcc","Seu nome")}${f("pEmail","E-mail","email")}${f("pCrefAcc","CREF (opcional)")}${f("pw1","Senha atual","password")}<div id="pwErr"></div><button class="btn" id="pwGo" style="width:100%">Salvar e entrar</button><p><a href="#" id="pwForgot" style="color:var(--bad);font-size:.85rem">Esqueci a senha</a></p></div>`;
 return `<div class="lockbox"><h2>🔒 Criar conta do Personal</h2><p style="color:var(--mut)">Primeiro acesso: crie sua conta. Ela protege o painel, as aprovações e o relatório.</p>${f("pNomeAcc","Seu nome")}${f("pEmail","E-mail","email")}${f("pCrefAcc","CREF (opcional, ex.: 012345-G/SP)")}${f("pw1","Senha (mínimo 6 caracteres)","password")}${f("pw2","Confirme a senha","password")}<div id="pwErr"></div><button class="btn" id="pwGo" style="width:100%">Criar conta</button></div>`}
function pLogin(acc){unlocked=true;sessionStorage.setItem(PSESS,acc.email);render()}
function bindLock(){const err=m=>$("#pwErr").innerHTML=`<div class="alert bad">${m}</div>`;const v=id=>{const e=$("#"+id);return e?e.value.trim():""};
 const fg=$("#pwForgot");if(fg)fg.onclick=e=>{e.preventDefault();pMode="forgot";render()};
 const cn=$("#pwCancel");if(cn)cn.onclick=e=>{e.preventDefault();pMode=null;render()};
 const wp=$("#pwWipe");if(wp)wp.onclick=()=>{if(v("pConf")!=="APAGAR")return err("Digite APAGAR exatamente para confirmar.");
  localStorage.removeItem(PACC);localStorage.removeItem(PKEY);sessionStorage.removeItem(PSESS);
  Object.keys(accounts()).forEach(u=>{const F=loadF(u);if(F.status==="aprovado"){F.status=F.plan?"pendente":"none";F.aprov=null;F.adj=[];localStorage.setItem(fkey(u),JSON.stringify(F))}});
  if(curUser){S=load()}pMode=null;unlocked=false;render()};
 const go=$("#pwGo");if(!go)return;
 const doIt=async()=>{const acc=pAcc(),old=pwRec(),em=v("pEmail").toLowerCase(),p1=$("#pw1").value;
  if(acc){if(em===acc.email&&await hashPw(p1,acc.salt)===acc.hash)return pLogin(acc);return err("E-mail ou senha incorretos.")}
  const nome=v("pNomeAcc"),cref=v("pCrefAcc").toUpperCase();if(nome.length<2)return err("Informe seu nome.");if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em))return err("Informe um e-mail válido.");
  if(old){if(await hashPw(p1,old.salt)!==old.hash)return err("Senha atual incorreta.");const A={nome,email:em,cref,salt:old.salt,hash:old.hash,criado:Date.now()};localStorage.setItem(PACC,JSON.stringify(A));localStorage.removeItem(PKEY);return pLogin(A)}
  if(p1.length<6)return err("A senha precisa ter pelo menos 6 caracteres.");if(p1!==$("#pw2").value)return err("As senhas não conferem.");
  const salt=hex(crypto.getRandomValues(new Uint8Array(16)));const A={nome,email:em,cref,salt,hash:await hashPw(p1,salt),criado:Date.now()};localStorage.setItem(PACC,JSON.stringify(A));pLogin(A)};
 go.onclick=doIt;$("#pw1").onkeydown=e=>{if(e.key==="Enter")doIt()}}
function lockBtn(){const a=pAcc();return `<div class="noprint" style="float:right;text-align:right"><small style="color:var(--mut)">👤 ${esc(a?a.nome:"")}</small> <button class="btn sm sec" id="lockNow">Sair</button></div>`}
/* ---------- Render ---------- */
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function todayHTML(){const td=todayTreino(),sw=activeSwap();
 if(sw&&sw.rest)return `<div class="alert ok" style="font-size:1.05rem">😴 <b>Hoje é descanso.</b> Seu personal trocou só o treino de hoje. A divisão da semana continua a mesma.</div>`;
 if(!td.hoje)return `<div class="alert ok" style="font-size:1.05rem">😴 <b>Hoje é descanso.</b> Recupere bem, hidrate-se e durma bem.</div>`;
 const T=sw||S.plan.treinos[td.idx],A=todayAdj(),D=A?A.day:T;if(!T)return "";
 return `<h3 style="font-size:1.1rem">Hoje: ${esc(td.dia)} — ${esc(T.nome)}</h3>`+(sw&&!A?`<div class="adjbadge">🔁 Treino de hoje trocado pelo personal. A divisão da semana não mudou.</div>`:"")+(A?`<div class="adjbadge">🩹 Ajustado hoje: ${esc(A.day.lbl||A.t)}</div><button class="btn sm sec" id="adjUndo" style="margin:4px 0 8px">↩ Voltar ao treino original</button>`:"")+planHTML([{...D,nome:T.nome,titulo:T.titulo||T.nome,adj:true}]).replace(/<h3>[\s\S]*?<\/h3>/,"")}
function calHTML(){const now=NOW(),wp=weekPlan(now),T=S.plan.treinos,N=S.a.dias,custom=isCustomSplit();const nx=weekPlan(new Date(now.getTime()+7*864e5)).find(x=>x.t!==null);
 return `<h3>Semana</h3><ul class="wk">${wp.map(x=>`<li class="${x.t===null?"rest":"tr"}"><b>${x.dia}:</b> ${x.t===null?"Descanso":esc(T[x.t].nome+" – "+(T[x.t].titulo||""))}</li>`).join("")}</ul>${custom?`<p style="color:var(--mut);font-size:.85rem">Divisão personalizada: estes dias se repetem toda semana.</p>`:(N%T.length&&nx?`<p style="color:var(--mut);font-size:.85rem">A rotação continua na próxima semana, começando pelo ${esc(T[nx.t].nome)}.</p>`:"")}`}
const MUSC={peito:"o peitoral (empurrar e abraçar), com ajuda do ombro anterior",triceps:"o tríceps, que estende o cotovelo e dá força a todo movimento de empurrar",antebraco:"o antebraço, responsável pela pegada firme que sustenta os outros exercícios",costas:"as dorsais e romboides, que puxam e mantêm a postura ereta",biceps:"o bíceps, que flexiona o cotovelo e participa de toda puxada",ombro:"os deltoides e o manguito rotador, que movem e estabilizam o ombro",post:"os posteriores de coxa e glúteos, que estendem o quadril, flexionam o joelho e protegem joelho e lombar",quad:"o quadríceps, que estende o joelho e dá estabilidade para agachar, subir escadas e correr",pant:"as panturrilhas, que impulsionam a passada e estabilizam o tornozelo",gluteo:"os glúteos, que estendem o quadril e estabilizam joelho e lombar",abdomen:"o abdômen, que estabiliza o tronco em todos os movimentos",cardio:"o condicionamento, com pernas, coração e pulmões",mobilidade:"a mobilidade, para a articulação chegar na posição do exercício sem compensar"};
const OBJX={hipertrofia:"o estímulo de 8 a 12 repetições perto da falha gera tensão mecânica, o principal sinal para o músculo crescer; com boa alimentação e sono, isso vira ganho de massa",emagrecimento:"as 12 a 15 repetições com descanso curto mantêm a frequência cardíaca alta, aumentam o gasto calórico e preservam a massa muscular enquanto a gordura diminui",forca:"o foco é progredir a carga com técnica perfeita, poucas repetições e descanso longo, ensinando o sistema nervoso a recrutar mais fibras e ficar mais forte",condicionamento:"as 15 a 20 repetições trabalham a resistência muscular e o fôlego, para você aguentar mais tempo sem cansar",mobilidade:"a amplitude e o controle vêm antes da carga, para o corpo se mover bem e com menos compensação",saude:"as 10 a 15 repetições com carga moderada fortalecem músculos e articulações, melhoram a postura e a disposição no dia a dia com segurança",outro:"o plano segue o que você descreveu, com carga e descanso que dá para sustentar"};
const NIVX={iniciante:"Como você está começando, a prioridade é aprender a técnica: comece com carga leve e aumente aos poucos quando as repetições ficarem fáceis.",intermediario:"No seu nível intermediário, busque aumentar carga ou repetições a cada semana, mantendo a execução controlada.",avancado:"Como você é avançado, use progressão de carga semanal e chegue perto da falha nas últimas séries, sem perder a técnica."};
function goalLabels(A){A=A||S.a;return goalSet(A).map(g=>g==="outro"&&A.objOutro?"Outro: "+A.objOutro:(GOAL_LAB[g]||g))}
function objSectionHTML(A){A=A||S.a;if(!A.objTxt&&!goalSet(A).length&&!A.resultados&&!A.prioridade&&!A.prazo&&!A.progresso)return"";
 const words=A.objTxt?` <small style="color:var(--mut)">(palavras do aluno: “${esc(A.objTxt)}”)</small>`:"";
 const note=A.prazo?prazoNote(A.prazo):"";
 return `<h3>2. OBJETIVOS E EXPECTATIVAS</h3><ul>
 <li><b>Objetivo principal:</b> ${esc(goalLabels(A).join(", ")||"—")}${words}</li>
 ${A.resultados?`<li><b>Resultados que deseja alcançar:</b> ${esc(A.resultados)}</li>`:""}
 <li><b>Região ou capacidade para priorizar:</b> ${esc(A.prioridade||"—")}</li>
 <li><b>Em quanto tempo espera resultados:</b> ${esc(A.prazo||"—")}${note?` <small>${esc(note)}</small>`:""}</li>
 <li><b>Como vamos medir o progresso:</b> ${esc(A.progresso||"—")}</li></ul>`}
function progEditorHTML(){if(!unlocked||!viewing)return"";const sug=["Peso","Medidas","Fotos","Cargas","Testes"];
 return `<div class="noprint" id="progBox"><p style="margin:8px 0 4px"><b>Como vamos medir o progresso</b></p><p style="color:var(--mut);font-size:.85rem;margin:0 0 6px">O personal preenche. Sugestões: peso, medidas, fotos, cargas, testes.</p><textarea id="progIn" rows="2" placeholder="Ex.: peso, fotos e cargas">${esc(S.a.progresso||"")}</textarea><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${sug.map(s=>`<button type="button" class="btn sm sec progSug" data-s="${esc(s)}">${s}</button>`).join("")}</div></div>`}
function bindProg(){const pi=$("#progIn");if(!pi)return;const apply=v=>{S.a.progresso=v;save()};pi.onchange=()=>apply(pi.value.trim());
 document.querySelectorAll(".progSug").forEach(b=>b.onclick=()=>{const s=b.dataset.s,cur=pi.value.trim();const next=!cur?s:(cur.toLowerCase().includes(s.toLowerCase())?cur:cur+", "+s);pi.value=next;apply(next)})}
function dayExp(d){if(!d||!d.blocos||!d.blocos.length)return"";const A=S.a,M=A.medInfo||{},gs=d.blocos.map(b=>b.g);if(gs[0]==="caminhada"||(gs.length===1&&gs[0]==="cardio"))return"";
 const ex=d.blocos.flatMap(b=>b.ex);if(!ex.length)return"";const strength=d.blocos.filter(b=>b.g!=="mobilidade"&&b.g!=="cardio"&&b.g!=="caminhada");
 const e0=(strength[0]&&strength[0].ex[0])||ex[0]||{s:4,d:"60s",r:"10–12"};
 const cat=goalSet(A).includes("forca")?"forca":(/forc/.test(norm(A.objTxt||""))&&A.objetivo==="hipertrofia"?"forca":(dominant(goalSet(A))||A.objetivo||"saude"));
 const lst=gs.map(g=>MUSC[g]).filter(Boolean);const mus=lst.length>1?lst.slice(0,-1).join("; ")+"; e "+lst[lst.length-1]:lst[0];
 const t=[];t.push("Este treino trabalha "+mus+".");
 const P=params(),prio=prioMain(),hasPrio=!!(prio&&d.blocos.some(b=>b.g===prio));
 if(d.blocos.some(b=>b.g==="mobilidade"))t.push("Começa com mobilidade, para preparar as articulações antes da carga.");
 if(hasPrio)t.push("A prioridade que você pediu (“"+((A.prioridade)||GN[prio]||prio)+"”) entra primeiro na parte principal e com mais volume: mais séries e um exercício a mais do que o resto.");
 const light=ex.some(e=>/leve/.test(String(e.r)+" "+(e.sub||"")))||M.low,tiredD=d.adj&&ex.some(e=>e.s===3&&/90/.test(e.d));
 const eRest=(strength.find(b=>b.g!==prio)||{}).ex,eR=eRest&&eRest[0],ePri=hasPrio&&d.blocos.find(b=>b.g===prio).ex[0];
 const how=light||tiredD?"com carga leve, amplitude controlada e foco total na técnica; termine cada série sentindo que ainda daria para fazer várias repetições.":"executadas com controle na descida e carga que deixe as últimas repetições difíceis.";
 if(hasPrio&&ePri&&eR&&ePri.s!==eR.s)t.push("No bloco prioritário, cada exercício tem "+ePri.s+" séries de "+ePri.r+" com "+ePri.d+" de descanso. Nos outros grupos, "+eR.s+" séries de "+eR.r+" com "+eR.d+" de descanso, "+how);
 else t.push("Cada exercício de força tem "+e0.s+" séries de "+e0.r+" repetições com "+String(e0.d).replace("60s","1 minuto")+" de descanso, "+how);
 if(P.circuit)t.push("A musculação entra em circuito, com descanso curto, para gastar mais energia.");
 if(d.blocos.some(b=>b.g==="cardio"))t.push("Termina com cardio, para somar fôlego e gasto calórico ao objetivo de emagrecer ou condicionar.");
 if(light||tiredD){t.push("Para o seu objetivo, “"+objShow()+"”, hoje o importante é manter o hábito e o movimento sem se sobrecarregar: um treino leve e bem feito protege sua evolução.");t.push("Não busque a falha nem aumente a carga hoje; a progressão volta no próximo treino, quando você estiver recuperado.")}
 else{t.push("Para o seu objetivo, “"+objShow()+"”"+(goalLabels(A).length?" ("+goalLabels(A).join(", ")+")":"")+", "+(OBJX[cat]||OBJX.saude)+".");
 const nk=norm(A.nivel||"");t.push(NIVX[nk]||NIVX.iniciante)}
 if(A.prazo)t.push("Você espera perceber resultados em “"+A.prazo+"”. "+prazoNote(A.prazo));
 const ad=[];if(M.low||(M.tags&&M.tags.length))ad.push("conforme sua orientação médica (“"+A.med+"”), "+(M.low?"a intensidade foi reduzida para 3 séries com carga leve e 1min30 de descanso":"exercícios que forçam "+M.tags.join(", ")+" foram trocados por opções seguras"));
 if(d.adj&&!M.low&&ex.some(e=>e.s===3&&/90/.test(e.d)))ad.push("como você relatou cansaço hoje, o treino caiu para 3 séries com 1min30 de descanso para recuperar sem perder o estímulo");
 if(d.lbl&&/dor no/.test(d.lbl))ad.push("pela "+d.lbl.split(" + ").find(x=>/dor no/.test(x))+" relatada hoje, exercícios que forçam essa região foram trocados ou feitos em versão leve; não treine com dor")
 if(Object.keys(A.dores||{}).length)ad.push("por causa da dor/lesão informada ("+Object.keys(A.dores).join(", ")+"), evitamos movimentos que sobrecarregam essa região");
 if(ad.length)t.push("Adaptações: "+ad.join("; ")+".");return t.join(" ")}
let DETMAP={},DETN=0,grpOpen=null;
function planHTML(treinos,edit){const wp=S.plan?weekPlan(NOW()):[];return treinos.map((d,di)=>{const wk=d.adj?"":wp.filter(x=>x.t===di).map(x=>x.dia).join(", ");
 const head=`<h3>${esc(d.nome+(d.titulo&&d.titulo!==d.nome?" – "+d.titulo:""))}${wk?` <small style="color:var(--mut)">(${wk})</small>`:""}</h3>`+(dayExp(d)?`<div class="dexp">💡 <b>Sobre este treino:</b> ${esc(dayExp(d))}</div>`:"");
 return head+d.blocos.map((b,bi)=>{
  const titulo=`${b.g==="caminhada"?"":("ABCDEFGHIJK"[bi]||"")+" – "}${esc(GN[b.g]||b.g)}`;
  const corpo=`${b.aviso?`<div class="sub">${esc(b.aviso)}</div>`:""}`+b.ex.map((e,ei)=>`<div class="ex"><b>${esc(e.n)}</b>${edit?exEdit(e,di,bi,ei):""}${e.s} série(s) × ${esc(e.r)} · descanso ${esc(e.d)}<div class="j">${esc(e.manual?manualText(e):e.j)}</div>${e.sub?`<div class="sub">↺ ${esc(e.sub)}</div>`:""}${!e.manual?(()=>{const k="d"+(++DETN);DETMAP[k]=e;return `<button class="detBtn" data-k="${k}">Detalhes</button>`})():""}</div>`).join("")+(edit&&EX[b.g]?`<div class="edit">${exAdd(b.g,b.ex.map(e=>e.n),di,bi)}${customTab(di,bi,-1)}${customPanel(di,bi,-1,b.g)}</div>`:"");
  if(!edit)return `<div class="blk"><div class="blkh">${titulo}</div>${corpo}</div>`;
  const key=di+"-"+bi;
  return `<details class="blk alert ok" data-grp="${key}"${grpOpen===key?" open":""}><summary><b>${titulo}</b></summary>${corpo}</details>`}).join("")}).join("")}
function bindGrupos(){const root=$("#persCard");if(!root)return;
 root.querySelectorAll("details.blk").forEach(d=>{d.ontoggle=()=>{if(d.open){grpOpen=d.dataset.grp||null;root.querySelectorAll("details.blk").forEach(o=>{if(o!==d&&o.open)o.open=false})}else if(grpOpen===d.dataset.grp)grpOpen=null}});
 root.querySelectorAll(".wk li").forEach(li=>{li.onclick=()=>{grpOpen=null;root.querySelectorAll("details.blk").forEach(d=>{d.open=false})}});
 root.querySelectorAll(".exBusca").forEach(inp=>{inp.addEventListener("keydown",ev=>ev.stopPropagation());inp.addEventListener("input",()=>{const q=norm(inp.value);const box=inp.closest("details")||inp.closest(".blk");if(!box)return;box.querySelectorAll("select[data-act]").forEach(sel=>{[...sel.options].forEach(o=>{if(!o.value&&/Adicionar/.test(o.textContent)){o.hidden=false;return}o.hidden=!!q&&!norm(o.textContent).includes(q)&&!o.selected})})})})}
function splitHTML(){const custom=isCustomSplit(),by={};if(custom)S.plan.split.days.forEach(d=>{by[d.w]=d});
 const order=[1,2,3,4,5,6,0];
 if(!custom)return `<div id="splitBox" class="noprint"><h3>Divisão da semana</h3><p style="margin:.2em 0"><b>Usar sugestão automática</b></p><p style="color:var(--mut);font-size:.9rem">A divisão fixa do app, conforme os dias da anamnese. Personalize só se quiser mudar os dias, os grupos ou o nome de cada treino.</p><button type="button" class="btn sec" id="splitEdit">Personalizar dias</button></div>`;
 return `<div id="splitBox" class="noprint"><h3>Divisão da semana</h3><p style="color:var(--mut);font-size:.9rem">Marque os dias de treino, escolha os grupos e, se quiser, renomeie o dia. Os exercícios saem da biblioteca e respeitam os equipamentos do aluno.</p>`+order.map(w=>{const d=by[w],on=!!d,gs=d?d.gs||[]:[];
  return `<div class="splitDay" data-w="${w}"><label class="splitOnL"><input type="checkbox" class="splitOn" ${on?"checked":""}> <b>${WKF[w]}</b> treina</label>`+(on?`<input class="splitLabel" placeholder="Nome do dia (ex.: Peito e tríceps)" value="${esc(d.label||"")}"><div class="splitGs">${SPLIT_GS.map(g=>`<label><input type="checkbox" class="splitG" value="${g.id}" ${gs.includes(g.id)?"checked":""}>${esc(g.label)}</label>`).join("")}</div>`:`<p class="splitRest">Descanso</p>`)+`</div>`}).join("")+`<button type="button" class="btn sec" id="splitAuto">Voltar à divisão automática</button></div>`}
function swapHTML(){const wp=weekPlan(NOW()),T=S.plan.treinos,sw=activeSwap(),td=todayTreino();
 return `<div id="swapBox" class="noprint"><h3>Trocar treino de hoje</h3><p style="color:var(--mut);font-size:.9rem">Vale só hoje (${esc(WKF[NOW().getDay()])}${td.hoje&&!sw?" · "+esc((T[td.idx]||{}).nome||""):""}). A divisão da semana não muda. Use quando o aluno já treinou esse grupo em outro lugar.</p>`+(sw?`<div class="alert warn">Hoje está trocado: <b>${esc(sw.nome||"Descanso")}</b></div>`:"")+`<label>Usar outro dia da semana<select id="swapDay"><option value="">Escolha um dia</option>${wp.filter(x=>x.t!=null).map(x=>`<option value="${x.t}">${esc(x.dia)}: ${esc(T[x.t].nome)}</option>`).join("")}</select></label><button type="button" class="btn sm" id="swapDayGo">Usar este dia hoje</button><p style="margin:10px 0 4px"><b>Ou escolher grupos só para hoje</b></p><div class="splitGs" id="swapGs">${SPLIT_GS.map(g=>`<label><input type="checkbox" class="splitG" value="${g.id}">${esc(g.label)}</label>`).join("")}</div><div class="splitActs"><button type="button" class="btn sm" id="swapApply">Aplicar só hoje</button>${sw?`<button type="button" class="btn sm sec" id="swapUndo">Desfazer troca de hoje</button>`:""}</div></div>`}
function bindSplit(){const ed=$("#splitEdit");if(ed)ed.onclick=()=>{if((S.a.medInfo||{}).soCaminhada){alert("A orientação médica deste aluno permite só caminhada. A divisão automática fica como está.");return}applySplit(autoSeed())};
 const au=$("#splitAuto");if(au)au.onclick=()=>useAutoSplit();
 document.querySelectorAll("#splitBox .splitDay").forEach(row=>{const read=()=>{const on=row.querySelector(".splitOn").checked;const days=[];document.querySelectorAll("#splitBox .splitDay").forEach(r=>{const chk=r.querySelector(".splitOn").checked;if(!chk)return;const label=(r.querySelector(".splitLabel")||{}).value||"";let gs=[...r.querySelectorAll(".splitG:checked")].map(i=>i.value);if(gs.includes("descanso"))gs=[];days.push({w:+r.dataset.w,label,gs})});if(!days.length){alert("Marque pelo menos um dia de treino, ou volte à divisão automática.");render();return}applySplit(days)};
  row.querySelector(".splitOn").onchange=()=>{if(!row.querySelector(".splitOn").checked){const n=[...document.querySelectorAll("#splitBox .splitOn")].filter(x=>x.checked).length;if(!n){alert("Marque pelo menos um dia de treino.");row.querySelector(".splitOn").checked=true;return}}read()};
  const lb=row.querySelector(".splitLabel");if(lb)lb.onchange=read;row.querySelectorAll(".splitG").forEach(g=>g.onchange=ev=>{if(ev.target.value==="descanso"&&ev.target.checked){row.querySelectorAll(".splitG").forEach(x=>{if(x!==ev.target)x.checked=false});row.querySelector(".splitOn").checked=false;read();return}if(ev.target.value!=="descanso"&&ev.target.checked){const dz=row.querySelector('.splitG[value="descanso"]');if(dz)dz.checked=false}read()})});
 const dg=$("#swapDayGo");if(dg)dg.onclick=()=>{const v=$("#swapDay").value;if(v==="")return;swapFromDay(v)};
 const ap=$("#swapApply");if(ap)ap.onclick=()=>{const gs=[...document.querySelectorAll("#swapGs .splitG:checked")].map(i=>i.value);if(!gs.length)return;swapFromGs(gs)};
 const un=$("#swapUndo");if(un)un.onclick=()=>setSwap(null)}
function badge(){return{pendente:'<span class="badge pend">PENDENTE</span>',aprovado:'<span class="badge apr">APROVADO</span>',bloqueado:'<span class="badge blk">BLOQUEADO – LIBERAÇÃO MÉDICA</span>'}[S.status]||""}
function numMed(v){if(v==null||v==="")return null;const n=Number(v);return Number.isFinite(n)&&n>0?n:null}
function brDec(n,dec){const s=Math.abs(Number(n)).toFixed(dec).split(".");return s[0]+(dec?","+s[1]:"")}
function fmtAltura(cm){const m=cm/100,m2=Math.round(m*100)/100;if(Math.abs(m-m2)<1e-6)return brDec(m2,2)+" m";const c=Math.round(cm*10)/10;return (Math.abs(c-Math.round(c))<1e-6?String(Math.round(c)):brDec(c,1))+" cm"}
function fmtPeso(kg){const k=Math.round(kg*10)/10;return (Math.abs(k-Math.round(k))<1e-6?String(Math.round(k)):brDec(k,1))+" kg"}
function medidasDe(){const me=window.__ME||{};const src=viewing?(me.students||[]).find(s=>s.u===viewing):null;if(!src)return{cm:null,kg:null};return{cm:numMed(src.altura_cm),kg:numMed(src.peso_kg)}}
function corpoTexto(){const m=medidasDe();const alt=m.cm==null?"não informado":fmtAltura(m.cm);const peso=m.kg==null?"não informado":fmtPeso(m.kg);let imc="";if(m.cm!=null&&m.kg!=null){const v=Math.round(m.kg/((m.cm/100)*(m.cm/100))*10)/10;imc=' <span style="font-size:.85em">IMC '+brDec(v,1)+"</span>"}return "Altura "+alt+" · Peso "+peso+imc}
function corpoHTML(){if(!viewing)return "";return `<p id="corpoAluno" style="color:var(--mut);font-size:.9rem;margin:.2em 0 .6em">${corpoTexto()}</p>`}
function diasDisponiveisTexto(){const nomes={segunda:"Segunda",terca:"Terça",quarta:"Quarta",quinta:"Quinta",sexta:"Sexta",sabado:"Sábado",domingo:"Domingo"};let ids=(S.a&&S.a.diasSemana)||[];if(!ids.length&&viewing&&window.__ME){const st=(window.__ME.students||[]).find(s=>s.u===viewing);if(st&&Array.isArray(st.dias_semana))ids=st.dias_semana}if(!ids.length)return "";return "Dias disponíveis: "+ids.map(id=>nomes[id]||id).join(", ")}
function diasHTML(){if(!viewing)return "";const t=diasDisponiveisTexto();if(!t)return "";return `<p id="diasAluno" style="color:var(--mut);font-size:.9rem;margin:.2em 0 .6em">${esc(t)}</p>`}
function zapAlunoHTML(){if(!viewing)return "";const st=window.__ME&&(window.__ME.students||[]).find(s=>s.u===viewing);const nome=(accounts()[viewing]||{}).nome||(st&&st.nome)||"";const num=st&&st.whatsapp?String(st.whatsapp).replace(/\D/g,""):"";if(!/^55\d{10,11}$/.test(num))return `<span class="waAlunoLinha"><button type="button" class="btn sm waAluno" id="waAluno" disabled>💬 WhatsApp</button> <span class="waAlunoOff">WhatsApp não informado</span></span>`;const href="https://wa.me/"+num+"?text="+encodeURIComponent("Oi "+nome+", aqui é o seu personal do Shape de Qualidade.");return `<a class="btn sm waAluno" id="waAluno" href="${esc(href)}" target="_blank" rel="noopener">💬 WhatsApp</a>`}
function bindApagar(){const open=$("#apagarAluno"),box=$("#apagarBox"),go=$("#apagarGo"),txt=$("#apagarTxt"),dica=$("#apagarDica");if(!open||!box||!go)return;open.onclick=()=>{box.classList.remove("hide");if(txt)txt.focus()};go.onclick=()=>{const typed=(txt&&txt.value||"").trim().toUpperCase()==="APAGAR";if(!typed&&go.dataset.arm!=="1"){go.dataset.arm="1";if(dica)dica.classList.remove("hide");return}go.disabled=true;fetch("/api/personal/students/"+encodeURIComponent(viewing),{method:"DELETE"}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"Não foi possível apagar.");location.href="/?area=personal&apagado=1"}).catch(e=>{go.disabled=false;if(dica){dica.textContent=e.message;dica.classList.remove("hide")}})}}
function render(){DETMAP={};DETN=0;closeDet();renderChat();hdr();const st=S.status,r=risk();
 $("#anamCard").classList.toggle("hide",st!=="none");
 if(!emAnamnese())silenciarCoach();
 $("#equipCard").classList.toggle("hide",st!=="equip");
 $("#equipList").innerHTML=EQUIP.map(e=>`<label><input type="checkbox" value="${e}" ${S.equip.includes(e)?"checked":""}>${e}</label>`).join("");
 const sc=$("#statusCard");sc.classList.toggle("hide",!["pendente","bloqueado","aprovado","equip"].includes(st)||st==="equip"&&!r.length);
 if(st==="equip"&&r.length)sc.innerHTML=`<div class="alert bad">⚠️ Pontos de risco identificados. Você precisará de <b>liberação médica</b> antes de treinar.<ul>${r.map(x=>"<li>"+esc(x)+"</li>").join("")}</ul></div>`;
 if(st==="pendente")sc.innerHTML=`<h2>Seu treino ${badge()}</h2><div class="alert warn">⏳ Seu treino foi gerado e está aguardando a aprovação de um personal com CREF. Assim que for aprovado, ele aparece aqui.</div>`;
 if(st==="bloqueado")sc.innerHTML=`<h2>Seu treino ${badge()}</h2><div class="alert bad">⛔ Identificamos pontos de risco na sua anamnese. Procure um médico e apresente a <b>liberação médica</b> ao seu personal. Sem isso o treino não será liberado.<ul>${r.map(x=>"<li>"+esc(x)+"</li>").join("")}</ul></div>`;
 if(st==="aprovado")sc.innerHTML=`<h2>Seu treino ${badge()}</h2><p style="color:var(--mut)">Treinador: ${esc(S.aprov.nome)}${S.aprov.cref?" – CREF "+esc(S.aprov.cref):""} · aprovado em ${esc(S.aprov.data)}</p>`+medNoteHTML()+todayHTML();
 const tdk=st==="aprovado"?todayTreino():null;
 $("#adjCard").classList.toggle("hide",!(st==="aprovado"&&tdk.hoje)&&!["equip","pendente","bloqueado"].includes(st));$("#adjTitle").textContent=st==="aprovado"?"Como você está hoje?":"Quer corrigir alguma resposta?";
 {const A=todayAdj();$("#adjOut").innerHTML=A?`<div class="alert ok"><b>“${esc(A.t)}”</b> <small>(${esc(A.quando)})</small><br>${A.exp.map(esc).join("<br>")}</div>`:""}const un=$("#adjUndo");if(un)un.onclick=()=>{const dk=dayKey(NOW());S.adj=(S.adj||[]).filter(a=>a.dk!==dk);S.adjLog=(S.adjLog||[]).concat([NOW().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})+" voltou ao treino original"]);save();render();const o=$("#adjOut");if(o)o.innerHTML='<div class="alert ok">Pronto, voltei para o treino original de hoje.</div>'};
 // Personal
 const pc=$("#persCard");
 if(!S.plan){pc.innerHTML='<h2>Painel do Personal</h2><div class="alert warn">ℹ️ O CREF é opcional. Quando informado, é verificado só pelo formato; confira o registro na consulta pública do sistema CONFEF/CREF.</div><p style="color:var(--mut)">Nenhum treino aguardando aprovação. O aluno precisa concluir a anamnese primeiro.</p>'+corpoHTML()+diasHTML()}
 else pc.innerHTML=`<h2>Painel do Personal ${badge()}</h2>${S.mudancas&&S.mudancas.length?`<div class="alert warn">✏️ O aluno corrigiu respostas e o treino foi recalculado: ${S.mudancas.slice(-5).map(esc).join(" · ")}</div>`:""}<div class="alert warn">ℹ️ O CREF é opcional. Quando informado, é verificado só pelo formato; confira o registro na consulta pública do sistema CONFEF/CREF.</div>${S.adjLog&&S.adjLog.length?`<div class="alert warn">🩹 <b>Ajustes do aluno:</b> ${S.adjLog.slice(-8).map(esc).join(" · ")}</div>`:""}<p><b>Aluno:</b> ${esc(S.a.nome)} · ${esc(S.a.idade)} anos · ${esc(objShow())}${S.a.objetivo?` <small style="color:var(--mut)">(${esc(goalLabels().join(", ")||S.a.objetivo)})</small>`:""} · ${esc(S.a.nivel)} · ${S.a.dias}x/semana</p>
 ${corpoHTML()}
 ${diasHTML()}
 ${objSectionHTML()}
 ${progEditorHTML()}
 ${r.length?`<div class="alert bad">⚠️ ${r.length} ponto(s) de risco. Confirme a <b>liberação médica</b> antes de aprovar.<ul>${r.map(x=>"<li>"+esc(x)+"</li>").join("")}</ul><label style="display:flex;gap:6px"><input type="checkbox" id="libmed" style="width:auto"> Recebi e conferi a liberação médica</label></div>`:'<div class="alert ok">Sem pontos de risco na anamnese.</div>'}${S.a.med?`<p><b>Orientação médica:</b> “${esc(S.a.med)}”</p>`:""}${attn().length?`<div class="alert warn">Atenção: ${attn().map(esc).join(" · ")}</div>`:""}
 ${S.status!=="aprovado"?`<div class="noprint"><input id="pNome" placeholder="Nome do personal" value="${esc((pAcc()||{}).nome||"")}" style="margin-bottom:8px"><input id="pCref" value="${esc((pAcc()||{}).cref||"")}" placeholder="CREF (opcional, ex.: 012345-G/SP)" style="margin-bottom:8px"><div id="pErr"></div><button class="btn ok" id="aprovar" style="width:100%">✓ Aprovar treino</button></div>`:`<div class="alert ok">Aprovado por ${esc(S.aprov.nome)}${S.aprov.cref?" – CREF "+esc(S.aprov.cref):" (sem CREF informado)"} em ${esc(S.aprov.data)} <button class="btn sm bad noprint" id="revogar">Revogar</button></div>`}
 <div id="splitSlot"></div>
 <h3>${isCustomSplit()?"Divisão personalizada da semana":"Treino proposto (sugestão automática)"}</h3>${unlocked&&viewing?'<p class="noprint" style="color:var(--mut);font-size:.85rem">Você pode substituir, adicionar, remover e reordenar exercícios, e editar séries, repetições e descanso — antes ou depois de aprovar.</p>':""}`+medNoteHTML()+calHTML()+planHTML(S.plan.treinos,unlocked&&!!viewing);
 if(unlocked&&viewing&&S.plan)pc.insertAdjacentHTML("beforeend",revHTML());
 // Relatório
 const A=S.a,rp=$("#repCard");
 rp.innerHTML=!A.nome?'<h2>Relatório de Anamnese</h2><p style="color:var(--mut)">Conclua a anamnese para gerar o relatório.</p>':`<h2>Relatório de Anamnese – Shape de Qualidade</h2><p style="color:var(--mut)">Gerado em ${new Date().toLocaleString("pt-BR")}</p>
 <h3>Resumo</h3><table><tr><th>Nome</th><td>${esc(A.nome)}</td></tr><tr><th>Idade</th><td>${esc(A.idade)}</td></tr><tr><th>Altura e peso</th><td>${corpoTexto()}</td></tr><tr><th>Objetivo</th><td>${esc(objShow(A))}</td></tr><tr><th>Nível</th><td>${esc(A.nivel)}${A.retorno?" (retorno após pausa)":""}</td></tr><tr><th>Dias/semana</th><td>${A.dias}</td></tr>${diasDisponiveisTexto()?`<tr><th>Dias disponíveis</th><td>${esc(diasDisponiveisTexto().replace(/^Dias disponíveis: /,""))}</td></tr>`:""}<tr><th>Tempo por treino</th><td>${A.tempo} min</td></tr><tr><th>Medicamentos</th><td>${esc(A.meds||"Não informado")}</td></tr><tr><th>Status do treino</th><td>${badge()||"Não gerado"}</td></tr></table>
 ${objSectionHTML(A)}
 <h3>Dores e lesões</h3>${Object.keys(A.dores).length?`<table><tr><th>Local</th><th>Intensidade</th><th>Quando</th><th>Diagnóstico</th></tr>${Object.entries(A.dores).map(([k,v])=>`<tr class="${v.int>=7?"risk":""}"><td>${k}</td><td>${v.int??"-"}/10</td><td>${esc(v.quando||"-")}</td><td>${esc(v.dx||"-")}</td></tr>`).join("")}</table>`:"<p>Nenhuma relatada.</p>"}
 <h3>Orientação médica</h3><p class="quote">“${esc(A.med||"Não informada")}”</p>${A.medInfo&&A.medInfo.conds.length?`<p><b>Condições detectadas:</b> ${A.medInfo.conds.map(esc).join(", ")}</p>`:""}${A.medInfo&&A.medInfo.tags.length?`<p><b>Restrições aplicadas no treino:</b> ${A.medInfo.tags.map(esc).join(", ")}</p>`:""}${attn().length?`<div class="alert warn">Pontos de atenção: ${attn().map(esc).join(" · ")}</div>`:""}
 ${Object.keys(A.cond).length?`<h3>Detalhes clínicos</h3><table>${Object.entries(A.cond).map(([k,v])=>`<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join("")}</table>`:""}
 <h3>Pontos de risco</h3>${r.length?`<div class="alert bad"><ul>${r.map(x=>"<li>"+esc(x)+"</li>").join("")}</ul><b>Recomendação: exigir liberação médica antes do início.</b></div>`:'<div class="alert ok">Nenhum ponto de risco identificado.</div>'}
 <h3>Transcrição</h3><div style="font-size:.85rem">${S.chat.map(([w,t])=>`<p><b>${w==="c"?"Coach":"Aluno"}:</b> ${esc(t)}</p>`).join("")}</div>
 <p class="disc">Este relatório não substitui avaliação médica.</p><button class="btn noprint" onclick="document.body.classList.add('printrep');window.print();setTimeout(()=>document.body.classList.remove('printrep'),500)">🖨️ Imprimir / salvar PDF</button>`;
 if(unlocked&&!viewing){pc.innerHTML='<h2>Painel do Personal</h2><p style="color:var(--mut)">👈 Selecione um aluno na lista (ou use a 🔍 busca) para abrir a ficha, editar o treino e aprovar.</p>';rp.innerHTML=""}
 if(unlocked&&viewing){const acc=accounts()[viewing]||{};const quem=acc.email||acc.nome||viewing;const nome=acc.nome||viewing;pc.insertAdjacentHTML("afterbegin",`<div class="alert ok noprint" id="fichaTopo">📂 Ficha de <b>${esc(nome)}</b> (${esc(quem)}) <button class="btn sm sec" id="closeStu">Fechar ficha</button> ${zapAlunoHTML()}<div id="apagarWrap"><button type="button" class="btn sm" id="apagarAluno">🗑️ Apagar aluno</button><div id="apagarBox" class="hide"><p>Apagar a ficha de ${esc(nome)}? Isso não pode ser desfeito.</p><input id="apagarTxt" placeholder="Digite APAGAR" autocomplete="off"><button type="button" class="btn sm bad" id="apagarGo">Apagar</button><p id="apagarDica" class="hide">Toque de novo para apagar.</p></div></div></div>`)}
 if(!unlocked){pc.innerHTML=lockHTML();rp.innerHTML="";rp.classList.add("hide");bindLock()}
 else{rp.classList.remove("hide");pc.insertAdjacentHTML("afterbegin",lockBtn());document.querySelectorAll("#lockNow").forEach(b=>b.onclick=()=>{unlocked=false;sessionStorage.removeItem(PSESS);if(viewing)closeStu();else render()})}
 renderPanel();bindRev();bindApagar();const cs=$("#closeStu");if(cs)cs.onclick=closeStu;if(unlocked&&!viewing)rp.classList.add("hide");
 if(unlocked&&viewing&&S.plan){const slot=$("#splitSlot");if(slot)slot.outerHTML=splitHTML()+swapHTML();bindSplit()}
 if(unlocked&&viewing)ensureCustom();
 const planEdit=ev=>{const t=ev.target.closest?ev.target.closest("[data-act]"):ev.target;if(!t||!t.dataset||!t.dataset.act)return;if(!unlocked||!viewing)return;if(t.dataset.act==="add"&&!t.value)return;editPlan(t.dataset.act,+t.dataset.d,+t.dataset.b,+t.dataset.e,t.value)};
 pc.onchange=ev=>{if(ev.target.id==="revF"||ev.target.id==="revD"||ev.target.closest(".exCustom"))return;planEdit(ev)};
 pc.onclick=ev=>{const tab=ev.target.closest&&ev.target.closest(".exCustomTab");if(tab){const parts=String(tab.dataset.cxkey||"").split("-");if(parts.length>=2)grpOpen=parts[0]+"-"+parts[1];customOpen=customOpen===tab.dataset.cxkey?"":tab.dataset.cxkey;render();return}const saveB=ev.target.closest&&ev.target.closest("[data-savecx]");if(saveB){saveCustomFrom(saveB);return}const useB=ev.target.closest&&ev.target.closest("[data-use]");if(useB){useCustom(+useB.dataset.use,+useB.dataset.d,+useB.dataset.b,+useB.dataset.e);return}const delB=ev.target.closest&&ev.target.closest("[data-delx]");if(delB){delCustom(+delB.dataset.delx);return}const t=ev.target.closest&&ev.target.closest("button[data-act]");if(t)planEdit(ev)};
 const ap=$("#aprovar");if(ap)ap.onclick=approve;const rv=$("#revogar");if(rv)rv.onclick=()=>{if(!unlocked)return;S.status=risk().length?"bloqueado":"pendente";S.aprov=null;S.adj=[];save();render()};
 bindProg();bindGrupos();
}
function approve(){if(!unlocked)return;const nome=$("#pNome").value.trim(),cref=$("#pCref").value.trim().toUpperCase();const err=m=>$("#pErr").innerHTML=`<div class="alert bad">${m}</div>`;
 if(nome.length<3)return err("Informe o nome do personal.");
 if(cref&&!/^\d{6}-[GP]\/[A-Z]{2}$/.test(cref))return err("CREF inválido. Use o formato 012345-G/SP ou deixe em branco.");
 if(risk().length&&!($("#libmed")&&$("#libmed").checked))return err("Há pontos de risco: confirme a liberação médica antes de aprovar.");
 S.status="aprovado";S.aprov={nome,cref,ts:Date.now(),data:new Date().toLocaleString("pt-BR")};save();render()}

/* ---------- Fichas dos alunos (personal) ---------- */
const FREQ={semanal:7,quinzenal:15,mensal:30};
function revNext(F){const r=F.rev;if(!r)return null;const d=r.freq==="personalizada"?(+r.dias||0):FREQ[r.freq];if(!d)return null;return new Date(r.base+d*864e5)}
function revHTML(){const r=S.rev||{freq:"",dias:""},nx=revNext(S);return `<div class="noprint"><h3>📅 Revisão do treino</h3><div class="row"><select id="revF"><option value="">Sem revisão definida</option>${["semanal","quinzenal","mensal","personalizada"].map(x=>`<option ${r.freq===x?"selected":""} value="${x}">${x[0].toUpperCase()+x.slice(1)}</option>`).join("")}</select><input id="revD" type="number" min="1" max="365" placeholder="dias" value="${esc(r.dias||"")}" class="${r.freq==="personalizada"?"":"hide"}" style="max-width:90px"></div>${nx?`<p id="revNext"><b>Próxima revisão:</b> ${nx.toLocaleDateString("pt-BR")}${nx<NOW()?' <span class="badge blk">VENCIDA</span>':""}</p>`:""}</div>`}
function bindRev(){const f=$("#revF");if(!f)return;const up=()=>{const fr=f.value,d=$("#revD").value;S.rev=fr?{freq:fr,dias:fr==="personalizada"?d:"",base:Date.now()}:null;save();render()};f.onchange=up;$("#revD").onchange=up}
let pq="",pf="todos",panelOpen=true,cardReg="",cardData=null,cardLoading=null,cardList=[],cardIdx=0;
function cardBanner(d){if(!d.paid)return"🔒 Liberado após a assinatura";const n=d.cards.filter(c=>!c.locked).length;if(!n)return"No plano Básico os cards ficam bloqueados. Faça upgrade para o Pro (50 cards) ou para o Ilimitado (os 100).";if(n===d.cards.length)return"Os 100 cards estão liberados no seu plano.";return"Os cards com cadeado são do plano Ilimitado. Faça upgrade para abrir."}
function paintCards(){const d=cardData,body=$("#cardStudyBody");if(!d||!body)return;const regs=[...new Set(d.cards.map(c=>c.regiao))].sort((a,b)=>a.localeCompare(b,"pt"));
 const list=d.cards.filter(c=>!cardReg||c.regiao===cardReg);
 body.innerHTML=`<p class="cardhint">${esc(cardBanner(d))}</p><select id="cardReg"><option value="">Todas as regiões</option>${regs.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join("")}</select><div class="cardgrid">${list.map(c=>c.locked?`<button type="button" class="cardtile locked" data-id="${c.id}"><span class="lock">🔒</span><b>${esc(c.titulo)}</b><small>${esc(d.paid?(c.plano==="Pro"?"Pro":"Ilimitado"):"Após a assinatura")}</small></button>`:`<button type="button" class="cardtile" data-id="${c.id}"><img alt="${esc(c.titulo)}" loading="lazy" src="/api/cards/${c.id}/img"><b>${esc(c.titulo)}</b><small>${esc(c.regiao)}</small></button>`).join("")||"<p>Nenhum card nesta região.</p>"}</div>`;
 const sel=$("#cardReg");sel.value=cardReg;sel.onchange=()=>{cardReg=sel.value;paintCards()};
 body.querySelectorAll(".cardtile").forEach(b=>b.onclick=()=>openCard(+b.dataset.id,list))}
function loadCards(){const body=$("#cardStudyBody");if(!body)return;if(cardData){paintCards();return}if(cardLoading)return cardLoading;
 body.textContent="Carregando…";
 cardLoading=fetch("/api/cards").then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"Não foi possível carregar os cards.");cardData=j;paintCards()}).catch(e=>{if($("#cardStudyBody"))$("#cardStudyBody").innerHTML=`<p class="cardhint">${esc(e.message)}</p>`}).finally(()=>{cardLoading=null});
 return cardLoading}
function ensureCardView(){let v=$("#cardView");if(v)return v;v=document.createElement("div");v.id="cardView";v.className="cardview hide";
 v.innerHTML=`<div class="cvtop"><button type="button" id="cardPrev" aria-label="Anterior">‹</button><button type="button" id="cardViewX" aria-label="Fechar">✕</button><button type="button" id="cardNext" aria-label="Próximo">›</button></div><div id="cardStage"></div><p id="cardCap"></p>`;
 document.body.appendChild(v);let x0=null;
 $("#cardStage").addEventListener("touchstart",e=>{x0=e.changedTouches[0].clientX},{passive:true});
 $("#cardStage").addEventListener("touchend",e=>{if(x0==null)return;const dx=e.changedTouches[0].clientX-x0;x0=null;if(dx<-40)cardStep(1);else if(dx>40)cardStep(-1)},{passive:true});
 $("#cardPrev").onclick=()=>cardStep(-1);$("#cardNext").onclick=()=>cardStep(1);$("#cardViewX").onclick=()=>v.classList.add("hide");return v}
function openCard(id,list){cardList=list;cardIdx=Math.max(0,list.findIndex(c=>c.id===id));ensureCardView();showCard()}
function cardStep(d){const n=cardIdx+d;if(n<0||n>=cardList.length)return;cardIdx=n;showCard()}
function showCard(){const c=cardList[cardIdx],v=$("#cardView");if(!c||!v)return;v.classList.remove("hide");
 const up=c.locked?(!cardData||!cardData.paid?"🔒 Liberado após a assinatura":cardData.cards.every(x=>x.locked)?"No plano Básico este card está bloqueado. Faça upgrade para o Pro ou Ilimitado.":"Este card é do plano Ilimitado. Faça upgrade para abrir."):"";
 $("#cardStage").innerHTML=c.locked?`<div class="cvlock"><span>🔒</span><p>${esc(up)}</p></div>`:`<img alt="${esc(c.titulo)}" src="/api/cards/${c.id}/img">`;
 $("#cardCap").textContent=c.titulo+" · "+c.regiao+" ("+(cardIdx+1)+"/"+cardList.length+")";
 $("#cardPrev").disabled=cardIdx===0;$("#cardNext").disabled=cardIdx===cardList.length-1}
function stuList(){const A=accounts();return Object.keys(A).map(u=>{const F=loadF(u);const st=F.status==="aprovado"?"apr":F.plan?"pend":"none";return{u,nome:A[u].nome,email:A[u].email||"",st,F}})}
function ebookView(){const sub=ME.sub||{},paid=!!ME.paid;if(ME.owner_test||(paid&&sub.plan==="ilimitado"))return{open:true,msg:""};if(sub.trial||!paid)return{open:false,msg:"Liberado após a assinatura"};return{open:false,msg:"Exclusivo do plano Ilimitado"}}
function ebookCard(){const v=ebookView();const body=v.open?'<button type="button" class="btn sm" id="ebookGo">Abrir ebook</button>':'<p class="ebooklock">🔒 '+esc(v.msg)+'</p>';return '<section id="ebookSec" class="ebookcard noprint"><h3>📘 Ebook: Guia Prático dos Exercícios</h3><div class="ebookcover"><b>Guia Prático dos Exercícios de Musculação</b><span>abordagem anatômica</span></div>'+body+'</section>'}
function renderPanel(){const p=$("#stuPanel");const cardStudyOpen=!!($("#cardStudySec")&&$("#cardStudySec").open),vidWas=!!($("#vidSec")&&$("#vidSec").open);p.classList.toggle("hide",!unlocked);if(!unlocked){p.innerHTML="";return}
 const L=stuList(),q=norm(pq);let v=L.filter(x=>!q||norm(x.nome+" "+x.u).includes(q)).filter(x=>pf==="todos"||(pf==="pend"?x.st!=="apr":x.st==="apr"));
 v.sort((a,b)=>(a.st==="apr")-(b.st==="apr")||a.nome.localeCompare(b.nome));
 const np=L.filter(x=>x.st!=="apr").length,na=L.length-np;
 p.innerHTML=`<details id="stuDet" ${panelOpen?"open":""}><summary>👥 Alunos (${L.length})</summary><div class="srch"><span>🔍</span><input id="stuQ" placeholder="Buscar aluno pelo nome" value="${esc(pq)}"></div>
 <div class="flt">${[["todos","Todos ("+L.length+")"],["pend","Pendentes ("+np+")"],["apr","Aprovados ("+na+")"]].map(([k,l])=>`<button data-f="${k}" class="${pf===k?"on":""}">${l}</button>`).join("")}</div>
 ${v.map(x=>{const sub=x.email||x.u;return `<div class="stu ${x.st} ${viewing===x.u?"sel":""}" data-u="${esc(x.u)}"><div><b>${esc(x.nome)}</b><small>${esc(sub)}${revNext(x.F)?" · rev. "+revNext(x.F).toLocaleDateString("pt-BR"):""}</small></div>${x.st==="apr"?'<span class="badge apr">Aprovado</span>':x.st==="pend"?(x.F.status==="bloqueado"?'<span class="badge blk">Bloqueado</span>':'<span class="badge pend">Pendente</span>'):'<span class="badge">Sem treino</span>'}</div>`}).join("")||'<p style="color:var(--mut)">Nenhum aluno encontrado.</p>'}</details>
 <details id="cardStudySec" class="cardstudy noprint" ${cardStudyOpen?"open":""}><summary>📚 Cards de memorização para estudo</summary><div id="cardStudyBody"></div></details>
 ${ebookCard()}
 <details id="vidSec" class="vidsec noprint" ${vidWas?"open":""}><summary><b>Vídeos seus</b></summary><div id="vidBody"></div></details>`;
 $("#stuDet").ontoggle=e=>{panelOpen=e.target.open};const qi=$("#stuQ");qi.oninput=()=>{pq=qi.value;const pos=qi.selectionStart;renderPanel();const n=$("#stuQ");n.focus();n.setSelectionRange(pos,pos)};
 p.querySelectorAll(".flt button").forEach(b=>b.onclick=()=>{pf=b.dataset.f;renderPanel()});
 p.querySelectorAll(".stu").forEach(d=>d.onclick=()=>openStu(d.dataset.u));
 const sec=$("#cardStudySec");if(sec){sec.ontoggle=()=>{if(sec.open)loadCards()};if(cardStudyOpen)loadCards()}
 const eg=$("#ebookGo");if(eg)eg.onclick=()=>window.open("/api/ebook","_blank","noopener");if(typeof bindVid==="function")bindVid()}
function openStu(u){viewing=u;grpOpen=null;if(innerWidth<=700)panelOpen=false;CK=fkey(u);S=loadF(u);render()}
function closeStu(){viewing=null;grpOpen=null;S=load();render()}
function showTab(t){if(t==="aluno"&&viewing)closeStu();["login","aluno","personal"].forEach(x=>$("#t-"+x).classList.toggle("hide",x!==t));render()}
/* ---------- Login do aluno ---------- */
let lgNew=false;
function lgUI(){["#lgNome","#lgPw2"].forEach(i=>{const el=$(i);if(el)el.classList.toggle("hide",!lgNew)});$("#lgGo").textContent=lgNew?"Criar conta":"Entrar";$("#lgMode").textContent=lgNew?"Já tenho conta, entrar":"Não tenho conta, criar agora";$("#lgErr").innerHTML=""}
$("#lgMode").onclick=e=>{e.preventDefault();lgNew=!lgNew;lgUI()};
$("#lgGo").onclick=async()=>{const err=m=>$("#lgErr").innerHTML=`<div class="alert bad">${m}</div>`;const email=($("#lgEmail").value||"").replace(/\s+/g,"").toLowerCase(),pw=$("#lgPw").value;
 if(lgNew){const nome=$("#lgNome").value.trim();if(nome.length<2)return err("Informe seu nome.");if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return err("Informe um e-mail válido.");if(pw.length<6)return err("A senha precisa ter pelo menos 6 caracteres.");if(pw!==$("#lgPw2").value)return err("As senhas não conferem.");return err("Abra o convite do seu personal para criar a conta.")}
 if(!email)return err("Informe seu e-mail.");return err("Entre pela página do app.")};
$("#lgPw").onkeydown=e=>{if(e.key==="Enter"&&!lgNew)$("#lgGo").click()};
$("#logout").onclick=()=>{try{speechSynthesis.cancel()}catch(e){}curUser=null;CK=null;localStorage.removeItem(SESS);S=fresh();lgNew=false;if($("#lgEmail"))$("#lgEmail").value="";if($("#lgNome"))$("#lgNome").value="";lgUI();showTab("login")};
$("#persLink").onclick=()=>showTab("personal");$("#backAluno").onclick=()=>showTab(curUser?"aluno":"login");
/* ---------- Eventos ---------- */
document.addEventListener("click",ev=>{const b=ev.target.closest&&ev.target.closest(".detBtn");if(b){const e=DETMAP[b.dataset.k];if(e)openDet(b.dataset.k,e);return}if(ev.target.id==="detOv")closeDet()});document.addEventListener("keydown",ev=>{if(ev.key==="Escape")closeDet()});
$("#mic").onclick=()=>listen("anam");$("#adjMic").onclick=()=>listen("adj");
const sendTxt=()=>{const v=$("#txt").value.trim();if(v){target="anam";$("#txt").value="";handle(v)}};$("#send").onclick=sendTxt;$("#txt").onkeydown=e=>{if(e.key==="Enter")sendTxt()};
const sendAdj=()=>{const v=$("#adjTxt").value.trim();if(v){target="adj";$("#adjTxt").value="";adjust(v)}};$("#adjSend").onclick=sendAdj;$("#adjTxt").onkeydown=e=>{if(e.key==="Enter")sendAdj()};
$("#genBtn").onclick=()=>{S.equip=[...document.querySelectorAll("#equipList input:checked")].map(i=>i.value);generate()};
$("#reset").onclick=()=>{if(!curUser||viewing)return alert("Entre como aluno para reiniciar a anamnese.");if(confirm("Apagar a sua anamnese e o seu treino e recomeçar?")){localStorage.removeItem(CK);S=fresh();S.a.nome=accounts()[curUser].nome;start()}};
function start(){if(!curUser){showTab("login");return}$("#whoName").textContent="👤 "+primeiroNome(accounts()[curUser].nome);if(!SR)$("#nosup").classList.remove("hide");if(!S.a.nome&&accounts()[curUser])S.a.nome=accounts()[curUser].nome;if(!S.queue){S.queue=baseQueue();save();render();target="anam";const g=greet(),it=S.queue[0];if(g&&it.id!=="nome")say(g+" "+it.q);else ask()}else{if(!emAnamnese())silenciarCoach();render()}}
if("speechSynthesis"in window){speechSynthesis.onvoiceschanged=loadVoices;loadVoices();setTimeout(loadVoices,800)}
$("#rate").value=vpref.rate;$("#rateV").textContent=(+vpref.rate).toFixed(2);
$("#rate").oninput=e=>{vpref.rate=+e.target.value;$("#rateV").textContent=vpref.rate.toFixed(2);localStorage.setItem(VKEY,JSON.stringify(vpref))};
$("#voiceSel").onchange=e=>{vpref.name=e.target.value;localStorage.setItem(VKEY,JSON.stringify(vpref))};
$("#testV").onclick=()=>speak("Oi! Eu sou o coach do Shape de Qualidade. Bora treinar? Vou te fazer algumas perguntas rápidas.");
$("#ttsToggle").onclick=()=>{const c=$("#tts");if(!c)return;c.checked=!c.checked;syncTtsBtn();if(!c.checked){spkId++;clearTimeout(ttsWD);try{speechSynthesis.cancel()}catch(e){}setAI(false)}};
$("#tts").onchange=syncTtsBtn;syncTtsBtn();
function boot(){try{S=load();if(curUser&&!accounts()[curUser])curUser=null;if(!curUser)localStorage.removeItem(SESS);if(curUser)showTab("aluno");start()}catch(e){console.error("Shape de Qualidade init:",e);try{if(curUser&&CK){localStorage.setItem(CK+"_bak"+Date.now(),localStorage.getItem(CK)||"");localStorage.removeItem(CK)}}catch(_){}curUser=null;CK=null;try{localStorage.removeItem(SESS)}catch(_){}S=fresh();viewing=null;["login","aluno","personal"].forEach(x=>{const el=document.getElementById("t-"+x);if(el)el.classList.toggle("hide",x!=="login")});try{render()}catch(_){}}}
