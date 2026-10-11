import type { BirthdayGroup } from "./birthdayTypes";

/**
 * Dados de DEMONSTRAÇÃO para visualização local (SYSTEM_LOCAL_PREVIEW=1) —
 * não existe nenhuma tabela real de Aniversariantes ainda. Datas usam o
 * mês/dia atual e os próximos dias de propósito, para que os filtros de
 * período ("Hoje", "Esta semana", "Período do jornal") tenham exemplos
 * reais para mostrar sem depender de uma data fixa no passado.
 */
function daysFromToday(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function buildBirthdayPreviewSeed(): BirthdayGroup[] {
  return [
    {
      id: "grp-1",
      kind: "individual",
      label: "Cristian Berão",
      city: "São João do Sul",
      principal: {
        id: "entry-1",
        displayName: "Cristian Berão",
        birthDate: daysFromToday(0),
        city: "São João do Sul",
        origin: "cadastro",
        active: true,
        publishInPrint: true,
      },
      members: [
        {
          id: "entry-2",
          displayName: "Maria Berão",
          birthDate: daysFromToday(3),
          city: "São João do Sul",
          relationship: "Esposa",
          origin: "familiar",
          active: true,
          publishInPrint: true,
        },
        {
          id: "entry-3",
          displayName: "Pedro Berão",
          birthDate: daysFromToday(10),
          city: "São João do Sul",
          relationship: "Filho",
          origin: "familiar",
          active: true,
          publishInPrint: false,
        },
        {
          id: "entry-4",
          displayName: "Ana Berão",
          birthDate: daysFromToday(21),
          city: "Florianópolis",
          relationship: "Filha",
          origin: "familiar",
          active: true,
          publishInPrint: true,
        },
      ],
    },
    {
      id: "grp-2",
      kind: "individual",
      label: "Maria Silva",
      city: "Praia Grande",
      principal: {
        id: "entry-5",
        displayName: "Maria Silva",
        birthDate: daysFromToday(1),
        city: "Praia Grande",
        origin: "cadastro",
        active: true,
        publishInPrint: true,
      },
      members: [],
    },
    {
      id: "grp-3",
      kind: "company",
      label: "Ótica Exemplo Ltda.",
      members: [
        {
          id: "entry-6",
          displayName: "Maria da Silva",
          birthDate: daysFromToday(5),
          city: "Torres",
          relationship: "Responsável",
          origin: "manual",
          active: true,
          publishInPrint: true,
        },
        {
          id: "entry-7",
          displayName: "João da Silva",
          birthDate: daysFromToday(45),
          city: "Sombrio",
          relationship: "Sócio",
          origin: "manual",
          active: true,
          publishInPrint: false,
        },
      ],
    },
  ];
}
