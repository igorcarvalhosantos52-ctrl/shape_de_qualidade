#!/usr/bin/env python3
"""Gera os mp3 das frases fixas do coach (pt-BR) e o mapa public/audio/clips.js."""
import asyncio, hashlib, shutil
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "audio"
VOICE = "pt-BR-FranciscaNeural"
PHRASES = [
    "Oi! Eu sou o coach do Shape de Qualidade. Qual é o seu nome?",
    "Qual é o seu nome?",
    "Eu sou o coach do Shape de Qualidade.",
    "Quantos anos você tem?",
    "Qual o seu principal objetivo? Por exemplo: Hipertrofia, Emagrecimento ou Saúde e qualidade de vida.",
    "Existe alguma região do corpo ou alguma capacidade que você deseja priorizar? Se não tiver, é só dizer que não.",
    "Em quanto tempo você espera perceber resultados?",
    "Você já treina? Se sim, há quanto tempo?",
    "Há quanto tempo?",
    "Quantos dias por semana você consegue treinar?",
    "Quanto tempo você tem por treino?",
    "Sente alguma dor ou tem alguma lesão?",
    "Você tem alguma orientação médica?",
    "Qual?",
    "Em qual parte do corpo?",
    "De 0 a 10, quanto dói?",
    "Não peguei seu nome. Pode repetir?",
    "Não entendi a idade. Pode repetir só o número?",
    "Sem problema. Pode dizer saúde, hipertrofia, emagrecimento, força, condicionamento, mobilidade, ou outro e explicar com as suas palavras.",
    "Pode me contar com outras palavras? Vale mais de um.",
    "Pode ser uma ideia: duas semanas, três meses, um ano...",
    "Quantos dias? Diga um número de 2 a 6.",
    "Me conta, mesmo em poucas palavras, o resultado que você quer ver.",
    "O que você vai notar quando estiver melhorando?",
    "Sem problema! Em qual pergunta você errou?",
    "Não entendi. Foi no nome, idade, objetivo, prioridade, prazo, progresso, tempo de treino, dias por semana, tempo por treino, dor ou lesão, ou orientação médica?",
    "Beleza, vamos começar do começo.",
    "Anamnese concluída.",
    "Atenção: identifiquei pontos de risco. Você vai precisar de liberação médica antes de treinar.",
    "Agora marque os equipamentos da sua academia.",
    "Treino gerado! Agora ele aguarda a aprovação do seu personal.",
    "Seu treino foi gerado, mas está bloqueado até você apresentar liberação médica ao personal.",
    "Pronto, voltei para o treino original de hoje.",
    "Seu treino ainda aguarda a aprovação do personal. Se quiser corrigir uma resposta, diga por exemplo: errei, são 4 dias por semana.",
    "Hoje é descanso, não há treino para ajustar.",
    "Qualquer dúvida, consulte o seu personal.",
    "Não consegui ajustar com segurança. Consulte o seu personal.",
    "Certo, corrigi:",
    "Recalculei o treino e ele voltou para aprovação do personal.",
    "Recalculei o treino e a semana.",
    "Oi! Eu sou o coach do Shape de Qualidade. Bora treinar? Vou te fazer algumas perguntas rápidas.",
    "Bora treinar? Vou te fazer algumas perguntas rápidas.",
    "Teste de áudio. Se você ouviu esta frase, o áudio do coach funciona.",
]

def hid(text):
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]

async def one(text, dest):
    await edge_tts.Communicate(text, VOICE, rate="+0%").save(str(dest))

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = []
    mapping = {}
    for text in PHRASES:
        name = hid(text) + ".mp3"
        dest = OUT / name
        mapping[text] = "/audio/" + name
        if not dest.exists() or dest.stat().st_size < 500:
            jobs.append(one(text, dest))
    await asyncio.gather(*jobs)
    teste = OUT / "teste.mp3"
    shutil.copyfile(OUT / (hid(PHRASES[-1]) + ".mp3"), teste)
    keep = {hid(t) + ".mp3" for t in PHRASES} | {"teste.mp3", "silence.mp3", "clips.js"}
    for p in OUT.iterdir():
        if p.name not in keep:
            p.unlink()
    lines = ["window.COACH_CLIPS=" + __import__("json").dumps(mapping, ensure_ascii=False, separators=(",", ":")) + ";"]
    (OUT / "clips.js").write_text(lines[0] + "\n", encoding="utf-8")
    print(f"{len(mapping)} frases, {len(jobs)} geradas")

if __name__ == "__main__":
    asyncio.run(main())
