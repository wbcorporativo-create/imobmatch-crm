# Secretária Leitora 🤖📖

Robô que **lê** as ofertas de imóveis dos seus grupos de WhatsApp e enche o
banco do HomeMatch automaticamente. **Só lê — nunca envia mensagem a ninguém.**

> É a Fase 1 do plano (ver `../COMECAR.md`): plantar a semente, enchendo a base
> de imóveis a partir do seu grupo de ~700 corretores. Sem abordar ninguém,
> sem monetizar ainda.

---

## ⚠️ Antes de tudo: o número certo

Use um **número dedicado** (um chip só pra isso), não o seu pessoal. Embora a
leitura passiva raramente seja banida, é o jeito certo de separar as coisas.
Esse número precisa **estar dentro** do grupo que você quer ler.

---

## O que você vai precisar

1. Um **servidor sempre ligado** (VPS de ~R$25–40/mês, ex.: Hetzner, Contabo,
   DigitalOcean, ou uma VPS BR). Seu PC desligado **não serve**.
2. O **service-account.json** do Firebase (chave de escrita no banco).
3. O **UID** do seu usuário no HomeMatch.
4. Um **chip/número dedicado** com WhatsApp ativo, já dentro do grupo.

---

## Passo a passo

### 1. Pegar a chave do Firebase
No [Firebase Console](https://console.firebase.google.com/) → projeto
**homematch-crm** → ⚙️ Configurações do projeto → **Contas de serviço** →
**Gerar nova chave privada**. Salve o arquivo como `service-account.json`
dentro desta pasta (`bot-leitor/`).

### 2. Descobrir seu UID
Abra o HomeMatch logado, aperte **F12** → aba **Console** → digite:
```js
firebase.auth().currentUser.uid
```
Copie o valor que aparecer.

### 3. Configurar
```bash
cp config.example.env .env
nano .env          # preencha HM_UID e, se quiser, HM_GRUPO_NOME
```

### 4. Instalar e rodar (no VPS)
```bash
npm install
npm start
```
Na primeira vez, aparece um **QR Code** no terminal. Escaneie com o WhatsApp do
**número dedicado** (Configurações → Aparelhos conectados → Conectar aparelho).

O bot vai listar os grupos que enxerga, com o JID de cada um. Pegue o JID do seu
grupo principal, cole em `HM_GRUPOS_JID` no `.env` e reinicie — assim ele trava
só naquele grupo.

### 5. Deixar rodando pra sempre
```bash
npm install -g pm2
pm2 start index.js --name leitora
pm2 save && pm2 startup     # sobe sozinho se o servidor reiniciar
pm2 logs leitora            # acompanhar
```

---

## Testar a lógica SEM WhatsApp (recomendado antes de subir)

```bash
npm run dry-run
```
Roda uma amostra de mensagens pela mesma lógica do bot, usando um banco em
memória. Mostra o que seria gravado, o que seria ignorado (ruído/procura) e a
deduplicação funcionando. Bom para conferir a qualidade antes de pôr no ar.

---

## O que ela grava (e o que ignora)

| Mensagem | O que acontece |
|---|---|
| "Vendo ap 3qts no Aleixo, R$ 450 mil" | ✅ grava como imóvel à venda |
| "Procuro casa pra alugar no Parque 10" | ⏭️ ignora (é procura; Fase 2) |
| "Bom dia grupo!" | ⏭️ ignora (ruído, baixa confiança) |
| Oferta repetida | ⏭️ ignora (deduplicação) |
| "Sítio no Tarumã R$ 800.000" (sem dizer venda) | ✅ infere **venda** pela magnitude |

Cada imóvel gravado guarda a mensagem original e o telefone do corretor (quando
houver) no campo de observação — matéria-prima para a futura parceria.

---

## Como o cérebro é compartilhado

A leitura/estruturação vive em `../engine.js`, o **mesmo** motor do
`extrator.html`. Corrigiu o motor uma vez → o robô e a página melhoram juntos.
Nada de lógica duplicada dando erro diferente em cada lugar.

---

## Limites honestos (hoje)

- O motor é heurístico (regras). Acerta bem o padrão de Manaus, mas mensagens
  muito fora do comum podem escapar — por isso o filtro de confiança.
- Ainda não baixa **fotos** das ofertas (só texto e telefone).
- WhatsApp via biblioteca não-oficial: risco de ban existe. Número dedicado e
  leitura passiva reduzem muito, mas não zeram.
