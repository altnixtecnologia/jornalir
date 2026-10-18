/**
 * Geração de homenagem individual via IA — SOMENTE a pedido explícito do
 * operador (botão "Criar com IA" no modal de homenagem), nunca automática
 * para a lista inteira. Executa só no servidor (Server Action) — a chave de
 * API nunca é enviada ao navegador. Provedor configurável via variável de
 * ambiente, sem nenhuma chave hardcoded.
 *
 * Variáveis de ambiente (nenhuma obrigatória — sem configuração, a função
 * isAiConfigured() retorna false e a UI informa a limitação, sem quebrar as
 * outras opções do modal):
 *   BIRTHDAY_AI_PROVIDER = "openai" | "anthropic"
 *   BIRTHDAY_AI_API_KEY  = chave do provedor escolhido
 *   BIRTHDAY_AI_MODEL    = opcional; usa um padrão razoável se ausente
 */
import type { PersonProfile } from "./messageGenerator";

import {
  AssistantConfigurationError, getAssistantCredentialsForModule, isAssistantConfiguredForModule,
} from "../../lib/ai/assistantConfig";

export async function isAiConfigured(): Promise<boolean> {
  return isAssistantConfiguredForModule("aniversariantes");
}

const SYSTEM_PROMPT = `Você escreve homenagens de aniversário curtas (2 a 3 frases, até 420 caracteres) para a coluna social de um jornal regional brasileiro (Jornal IR).
Estilo tradicional de jornal do interior: cordial, respeitoso, sem gírias, sem emojis, sem exclamações exageradas, linguagem neutra de gênero (nunca "querido/querida", "cercado/cercada" — prefira construções sem flexão de gênero).
Regras obrigatórias:
- Use APENAS os dados fornecidos pelo operador (nome, cidade, cargo/profissão, empresa/instituição, apelido, contexto). NUNCA invente cargo, profissão, qualidades pessoais, feitos ou relações que não foram informados.
- Se um dado não foi fornecido, simplesmente não o mencione — não tente adivinhar ou generalizar.
- Nunca repita literalmente frases de exemplo fornecidas como referência de estilo; produza um texto original a cada vez.
- Nunca inclua saudações como "Olá" nem assinatura; é só o texto da homenagem.
- Responda só com o texto final da homenagem, sem aspas, sem comentários.`;

function buildUserPrompt(profile: PersonProfile, styleExamples: string[]): string {
  const facts: string[] = [`Nome: ${profile.name}`];
  if (profile.city) facts.push(`Cidade: ${profile.city}`);
  if (profile.profession) facts.push(`Cargo/profissão/atividade: ${profile.profession}`);
  if (profile.organization) facts.push(`Empresa/instituição: ${profile.organization}`);
  if (profile.knownAs) facts.push(`Como é conhecido: ${profile.knownAs}`);
  if (profile.editorialPhrase) facts.push(`Contexto editorial: ${profile.editorialPhrase}`);
  if (profile.dateLabel) facts.push(`Data do aniversário nesta edição: ${profile.dateLabel}`);
  const examplesBlock = styleExamples.length
    ? `\n\nExemplos de ESTILO (não copie o texto, use só como referência de tom):\n${styleExamples.map((e) => `- ${e}`).join("\n")}`
    : "";
  return `Escreva uma homenagem de aniversário com estes dados:\n${facts.join("\n")}${examplesBlock}`;
}

export class AiMessageError extends Error {}

async function callOpenAI(apiKey: string, model: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      max_tokens: 220,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new AiMessageError(`OpenAI respondeu ${res.status}.`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiMessageError("OpenAI não retornou texto.");
  return text;
}

async function callAnthropic(apiKey: string, model: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 220,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new AiMessageError(`Anthropic respondeu ${res.status}.`);
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((b) => b.type === "text")?.text?.trim();
  if (!text) throw new AiMessageError("Anthropic não retornou texto.");
  return text;
}

/** Gera UMA homenagem via IA para `profile`. Lança AiMessageError se a
 * configuração estiver ausente ou o provedor falhar — o chamador decide como
 * informar o operador (nunca derruba as outras opções do modal). */
export async function generateMessageWithAI(profile: PersonProfile, styleExamples: string[]): Promise<string> {
  // A configuracao central verifica interruptor geral, permissao do modulo e
  // chave cifrada antes de qualquer request externo. Nao usar env legado como
  // bypass: desativar no painel deve bloquear a chamada no servidor.
  let credentials: Awaited<ReturnType<typeof getAssistantCredentialsForModule>>;
  try {
    credentials = await getAssistantCredentialsForModule("aniversariantes");
  } catch (error) {
    throw new AiMessageError(
      error instanceof AssistantConfigurationError ? error.message : "Assistente IR nao configurado.",
    );
  }
  const userPrompt = buildUserPrompt(profile, styleExamples);
  if (credentials.provider === "openai") {
    return callOpenAI(credentials.apiKey, credentials.model, userPrompt);
  }
  return callAnthropic(credentials.apiKey, credentials.model, userPrompt);
}
